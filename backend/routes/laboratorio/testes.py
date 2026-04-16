# -*- coding: utf-8 -*-
"""
Laboratório / Bancada — testes de performance, equipes, simulação de rebaixamento.
Tipo de usuário 'L' (Laboratório) tem acesso restrito a este módulo.
APEX key: LABS
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter
from backend.core.config import logger
from backend.core.lov_cache import lov_cache

router = APIRouter()


def create_laboratorio_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_tp_tst (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_tp_user (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                sigla VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_eqp (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300) NOT NULL,
                codigo VARCHAR(50), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_mtv (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                tipo VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_team (
                id BIGSERIAL PRIMARY KEY, usuario_id BIGINT NOT NULL,
                hgr_lab_cad_tp_user_id BIGINT, ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_tst (
                id BIGSERIAL PRIMARY KEY, codigo VARCHAR(50),
                descricao VARCHAR(500), hgr_lab_cad_tp_tst_id BIGINT,
                hgr_lab_cad_eqp_id BIGINT,
                status VARCHAR(20) DEFAULT 'AGENDADO',
                dt_agendamento DATE, dt_execucao DATE, dt_conclusao DATE,
                responsavel_id BIGINT, observacao TEXT,
                pv VARCHAR(50), nr_serie VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_reg_teste (
                id BIGSERIAL PRIMARY KEY, hgr_lab_cad_tst_id BIGINT NOT NULL,
                vazao NUMERIC(15,4), pressao NUMERIC(15,4),
                potencia NUMERIC(15,4), corrente NUMERIC(15,4),
                tensao NUMERIC(15,4), rendimento NUMERIC(10,4),
                temperatura NUMERIC(10,2), vibracao NUMERIC(10,4),
                ponto_curva INTEGER, observacao TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_tst_reg_team (
                id BIGSERIAL PRIMARY KEY, hgr_lab_cad_tst_id BIGINT NOT NULL,
                usuario_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_tst_reg_stt (
                id BIGSERIAL PRIMARY KEY, hgr_lab_cad_tst_id BIGINT NOT NULL,
                status_anterior VARCHAR(20), status_novo VARCHAR(20),
                usuario_id BIGINT, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_lab_tst_reg_alt_data (
                id BIGSERIAL PRIMARY KEY, hgr_lab_cad_tst_id BIGINT NOT NULL,
                dt_anterior DATE, dt_nova DATE, justificativa TEXT,
                usuario_id BIGINT, created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Bancada
            """CREATE TABLE IF NOT EXISTS public.hgr_banc_cad_sim_reb (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300),
                parametros JSONB, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_banc_reg_bomba (
                id BIGSERIAL PRIMARY KEY, hgr_banc_cad_sim_reb_id BIGINT,
                modelo VARCHAR(200), nr_serie VARCHAR(100),
                dados JSONB, created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        cur.execute("ALTER TABLE public.hgr_lab_cad_tst ADD COLUMN IF NOT EXISTS curva_padrao_json TEXT")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lab_tst_status ON public.hgr_lab_cad_tst(status);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lab_tst_dt ON public.hgr_lab_cad_tst(dt_agendamento);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lab_reg_tst ON public.hgr_lab_reg_teste(hgr_lab_cad_tst_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lab_team_tst ON public.hgr_lab_tst_reg_team(hgr_lab_cad_tst_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lab_stt_tst ON public.hgr_lab_tst_reg_stt(hgr_lab_cad_tst_id);")
        conn.commit()
        logger.info("Tabelas de laboratório verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas laboratório: {e}")
    finally:
        cur.close()
        conn.close()


# --- Testes ---
@router.get("/testes", dependencies=[Depends(require_permission('LABS'))])
async def listar_testes(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT t.*,
                   COALESCE(t.nr_serie, t.n_serie::text) as _nr_serie,
                   COALESCE(t.responsavel_id, t.beg_usuarios_id) as _responsavel_id,
                   COALESCE(t.dt_agendamento, t.dt_prev_ini::date) as _dt_agendamento,
                   u.name as responsavel_nome, tp.descricao as tipo_teste,
                   eq.descricao as equipamento,
                   0 as qtd_pontos
            FROM public.hgr_lab_cad_tst t
            LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.beg_usuarios_id)
            LEFT JOIN public.hgr_lab_cad_tp_tst tp ON tp.id = t.hgr_lab_cad_tp_tst_id
            LEFT JOIN public.hgr_lab_cad_eqp eq ON eq.id = t.hgr_lab_cad_eqp_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND t.status = %s"
            params.append(status)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 't')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY t.dt_agendamento DESC NULLS LAST, COALESCE(t.created_at, t.created) DESC NULLS LAST LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/testes/{id}", dependencies=[Depends(require_permission('LABS'))])
async def obter_teste(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.*,
                   COALESCE(t.nr_serie, t.n_serie::text) as _nr_serie,
                   COALESCE(t.responsavel_id, t.beg_usuarios_id) as _responsavel_id,
                   COALESCE(t.dt_agendamento, t.dt_prev_ini::date) as _dt_agendamento,
                   u.name as responsavel_nome, tp.descricao as tipo_teste, eq.descricao as equipamento
            FROM public.hgr_lab_cad_tst t
            LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.beg_usuarios_id)
            LEFT JOIN public.hgr_lab_cad_tp_tst tp ON tp.id = t.hgr_lab_cad_tp_tst_id
            LEFT JOIN public.hgr_lab_cad_eqp eq ON eq.id = t.hgr_lab_cad_eqp_id
            WHERE t.id = %s
        """, (id,))
        tst = cur.fetchone()
        if not tst:
            raise HTTPException(404, "Teste não encontrado")
        # Resultados (pontos de curva) — Oracle hgr_lab_reg_teste é tabela flat sem FK para tst
        try:
            cur.execute("""SELECT * FROM public.hgr_lab_reg_teste
                WHERE hgr_lab_cad_tst_id = %s ORDER BY ponto_curva ASC NULLS LAST, id""", (id,))
            tst["resultados"] = cur.fetchall()
        except Exception:
            conn.rollback()
            tst["resultados"] = []
        # Equipe
        cur.execute("""SELECT tm.*, u.name as usuario_nome FROM public.hgr_lab_tst_reg_team tm
            LEFT JOIN public.users u ON u.id = tm.usuario_id WHERE tm.hgr_lab_cad_tst_id = %s""", (id,))
        tst["equipe"] = cur.fetchall()
        # Histórico status
        cur.execute("""SELECT s.*, u.name as usuario_nome FROM public.hgr_lab_tst_reg_stt s
            LEFT JOIN public.users u ON u.id = COALESCE(s.usuario_id, s.hgr_usuario_id)
            WHERE s.hgr_lab_cad_tst_id = %s ORDER BY COALESCE(s.created_at, s.created) DESC NULLS LAST""", (id,))
        tst["historico_status"] = cur.fetchall()
        return tst
    finally:
        cur.close()
        conn.close()


@router.post("/testes", status_code=201, dependencies=[Depends(require_permission('LABS', 'M'))])
async def criar_teste(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_lab_cad_tst
            (descricao, hgr_lab_cad_tp_tst_id, hgr_lab_cad_eqp_id, dt_agendamento,
             responsavel_id, pv, nr_serie, observacao, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("descricao"), data.get("hgr_lab_cad_tp_tst_id"),
             data.get("hgr_lab_cad_eqp_id"), data.get("dt_agendamento"),
             data.get("responsavel_id"), data.get("pv"),
             data.get("nr_serie"), data.get("observacao"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/testes/{id}", dependencies=[Depends(require_permission('LABS', 'M'))])
async def atualizar_teste(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Log de status se mudou
        novo_status = data.get("status")
        if novo_status:
            cur.execute("SELECT status FROM public.hgr_lab_cad_tst WHERE id = %s", (id,))
            row = cur.fetchone()
            if row and row["status"] != novo_status:
                cur.execute("""INSERT INTO public.hgr_lab_tst_reg_stt
                    (hgr_lab_cad_tst_id, status_anterior, status_novo, usuario_id)
                    VALUES (%s,%s,%s,%s)""", (id, row["status"], novo_status, usuario_id))

        cur.execute("""UPDATE public.hgr_lab_cad_tst SET
            descricao=COALESCE(%s,descricao), status=COALESCE(%s,status),
            dt_execucao=COALESCE(%s,dt_execucao), dt_conclusao=COALESCE(%s,dt_conclusao),
            observacao=COALESCE(%s,observacao), updated_at=NOW()
            WHERE id=%s RETURNING *""",
            (data.get("descricao"), novo_status, data.get("dt_execucao"),
             data.get("dt_conclusao"), data.get("observacao"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Teste não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Resultados (pontos de curva) ---
@router.post("/testes/{tst_id}/resultados", status_code=201, dependencies=[Depends(require_permission('LABS', 'M'))])
async def add_resultado(tst_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_lab_reg_teste
            (hgr_lab_cad_tst_id, vazao, pressao, potencia, corrente, tensao,
             rendimento, temperatura, vibracao, ponto_curva, observacao)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (tst_id, data.get("vazao"), data.get("pressao"), data.get("potencia"),
             data.get("corrente"), data.get("tensao"), data.get("rendimento"),
             data.get("temperatura"), data.get("vibracao"),
             data.get("ponto_curva"), data.get("observacao")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Equipes ---
@router.get("/equipes", dependencies=[Depends(require_permission('LABS'))])
async def listar_equipes(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT tm.*, u.name as usuario_nome, tp.descricao as tipo_usuario, tp.sigla
            FROM public.hgr_lab_cad_team tm
            LEFT JOIN public.users u ON u.id = COALESCE(tm.usuario_id, tm.beg_usuarios_id)
            LEFT JOIN public.hgr_lab_cad_tp_user tp ON tp.id = tm.hgr_lab_cad_tp_user_id
            ORDER BY u.name NULLS LAST""")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# --- Config (tipos de teste, equipamentos, motivos) ---
@router.get("/config/tipos-teste", dependencies=[Depends(require_permission('LABS'))])
async def listar_tipos_teste(usuario_id: int = Depends(require_user)):
    cached = lov_cache.get("lab_tipos_teste")
    if cached is not None:
        return cached
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_lab_cad_tp_tst WHERE ativo = 'S' ORDER BY descricao")
        result = {"items": cur.fetchall()}
        lov_cache.set("lab_tipos_teste", result)
        return result
    finally:
        cur.close()
        conn.close()


@router.get("/config/equipamentos", dependencies=[Depends(require_permission('LABS'))])
async def listar_equipamentos(usuario_id: int = Depends(require_user)):
    cached = lov_cache.get("lab_equipamentos")
    if cached is not None:
        return cached
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_lab_cad_eqp WHERE ativo = 'S' ORDER BY descricao")
        result = {"items": cur.fetchall()}
        lov_cache.set("lab_equipamentos", result)
        return result
    finally:
        cur.close()
        conn.close()


# --- Bancada / Simulação ---
@router.get("/bancada/simulacoes", dependencies=[Depends(require_permission('LABS'))])
async def listar_simulacoes(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                            usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_banc_cad_sim_reb")
        total = cur.fetchone()["total"]
        cur.execute("SELECT * FROM public.hgr_banc_cad_sim_reb ORDER BY created_at DESC LIMIT %s OFFSET %s",
                    (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


# ============================================================
# 538 — CRUD tipos de teste
# ============================================================
@router.post("/config/tipos-teste", status_code=201, dependencies=[Depends(require_permission('LABS', 'M'))])
async def criar_tipo_teste(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_lab_cad_tp_tst (descricao) VALUES (%s) RETURNING *",
                    (data.get("descricao"),))
        conn.commit()
        lov_cache.delete("lab_tipos_teste")
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/config/tipos-teste/{tipo_id}", status_code=204, dependencies=[Depends(require_permission('LABS', 'M'))])
async def excluir_tipo_teste(tipo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_lab_cad_tp_tst SET ativo='N' WHERE id=%s", (tipo_id,))
        conn.commit()
        lov_cache.delete("lab_tipos_teste")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 550 — CRUD laboratorios/bancadas disponiveis
# ============================================================
@router.get("/config/labs", dependencies=[Depends(require_permission('LABS'))])
async def listar_labs(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_lab_cad_bancada (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
            codigo VARCHAR(50), localizacao VARCHAR(200),
            capacidade INTEGER, ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        conn.commit()
        cur.execute("SELECT * FROM public.hgr_lab_cad_bancada WHERE ativo='S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/config/labs", status_code=201, dependencies=[Depends(require_permission('LABS', 'M'))])
async def criar_lab(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_lab_cad_bancada (descricao, codigo, localizacao, capacidade)
            VALUES (%s,%s,%s,%s) RETURNING *""",
            (data.get("descricao"), data.get("codigo"), data.get("localizacao"),
             data.get("capacidade")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/config/labs/{lab_id}", status_code=204, dependencies=[Depends(require_permission('LABS', 'M'))])
async def excluir_lab(lab_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_lab_cad_bancada SET ativo='N' WHERE id=%s", (lab_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 553 — Repetir Teste (clonar agendamento)
# ============================================================
@router.post("/testes/{id}/repetir", status_code=201, dependencies=[Depends(require_permission('LABS', 'M'))])
async def repetir_teste(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_lab_cad_tst WHERE id=%s", (id,))
        original = cur.fetchone()
        if not original:
            raise HTTPException(404, "Teste nao encontrado")
        cur.execute("""INSERT INTO public.hgr_lab_cad_tst
            (descricao, hgr_lab_cad_tp_tst_id, hgr_lab_cad_eqp_id,
             dt_agendamento, responsavel_id, pv, nr_serie, observacao, created_by, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'AGENDADO') RETURNING *""",
            (("Repeticao: " + original["descricao"])[:500],
             original.get("hgr_lab_cad_tp_tst_id"),
             original.get("hgr_lab_cad_eqp_id"),
             data.get("dt_agendamento") or original.get("dt_agendamento"),
             original.get("responsavel_id"), original.get("pv"),
             original.get("nr_serie"),
             data.get("observacao") or original.get("observacao"),
             usuario_id))
        conn.commit()
        return cur.fetchone()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 554 — Condicoes Ambientais
# ============================================================
@router.post("/testes/{tst_id}/condicoes", status_code=201, dependencies=[Depends(require_permission('LABS', 'M'))])
async def registrar_condicoes(tst_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_lab_reg_cond_amb (
            id BIGSERIAL PRIMARY KEY, hgr_lab_cad_tst_id BIGINT NOT NULL,
            temperatura_amb NUMERIC(6,2), pressao_atm NUMERIC(8,2),
            umidade_rel NUMERIC(6,2), observacao TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER
        )""")
        conn.commit()
        cur.execute("""INSERT INTO public.hgr_lab_reg_cond_amb
            (hgr_lab_cad_tst_id, temperatura_amb, pressao_atm, umidade_rel, observacao, created_by)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING *""",
            (tst_id, data.get("temperatura_amb"), data.get("pressao_atm"),
             data.get("umidade_rel"), data.get("observacao"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/testes/{tst_id}/condicoes", dependencies=[Depends(require_permission('LABS'))])
async def listar_condicoes(tst_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_lab_reg_cond_amb WHERE hgr_lab_cad_tst_id=%s ORDER BY created_at DESC", (tst_id,))
        return {"items": cur.fetchall()}
    except Exception:
        return {"items": []}
    finally:
        cur.close()
        conn.close()


# ============================================================
# 558 + 560 — Stats Dashboard LABS
# ============================================================
@router.get("/stats", dependencies=[Depends(require_permission('LABS'))])
async def stats_laboratorio(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT
            COUNT(*) FILTER (WHERE status IN ('AGU','AGENDADO')) as agendados,
            COUNT(*) FILTER (WHERE status IN ('EXE','EM_EXECUCAO')) as em_execucao,
            COUNT(*) FILTER (WHERE status IN ('FIN','FINALIZADO','APR')) as finalizados,
            COUNT(*) FILTER (WHERE status IN ('REP','REPROVADO')) as reprovados,
            COUNT(*) as total
            FROM public.hgr_lab_cad_tst
        """)
        totais = cur.fetchone() or {}

        cur.execute("""
            SELECT tp.descricao as tipo, COUNT(*) as qtd,
                   COUNT(*) FILTER (WHERE t.status IN ('REP','REPROVADO')) as reprovados
            FROM public.hgr_lab_cad_tst t
            LEFT JOIN public.hgr_lab_cad_tp_tst tp ON tp.id = t.hgr_lab_cad_tp_tst_id
            GROUP BY tp.descricao ORDER BY qtd DESC LIMIT 10
        """)
        por_tipo = cur.fetchall()

        cur.execute("""
            SELECT TO_CHAR(dt_agendamento, 'YYYY-MM') as mes, COUNT(*) as qtd
            FROM public.hgr_lab_cad_tst
            WHERE dt_agendamento >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY mes ORDER BY mes
        """)
        por_mes = cur.fetchall()

        cur.execute("""
            SELECT t.id, t.descricao, t.status, t.dt_agendamento, u.name as responsavel_nome
            FROM public.hgr_lab_cad_tst t
            LEFT JOIN public.users u ON u.id = t.responsavel_id
            WHERE t.status IN ('REP','REPROVADO')
            ORDER BY t.dt_agendamento DESC NULLS LAST LIMIT 10
        """)
        reprovados_recentes = cur.fetchall()

        return {
            "totais": totais,
            "por_tipo": por_tipo,
            "por_mes": por_mes,
            "reprovados_recentes": reprovados_recentes,
        }
    finally:
        cur.close()
        conn.close()


# ============================================================
# 545 — Historico de Testes por Modelo
# ============================================================
@router.get("/historico-modelo", dependencies=[Depends(require_permission('LABS'))])
async def historico_por_modelo(nr_serie: str = None, pv: str = None,
                                usuario_id: int = Depends(require_user)):
    if not nr_serie and not pv:
        raise HTTPException(400, "Informe nr_serie ou pv")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        conds = []
        params = []
        if nr_serie:
            conds.append("t.nr_serie = %s")
            params.append(nr_serie)
        if pv:
            conds.append("t.pv = %s")
            params.append(pv)
        where = " OR ".join(conds)
        cur.execute(f"""SELECT t.*, u.name as responsavel_nome, tp.descricao as tipo_teste
            FROM public.hgr_lab_cad_tst t
            LEFT JOIN public.users u ON u.id = t.responsavel_id
            LEFT JOIN public.hgr_lab_cad_tp_tst tp ON tp.id = t.hgr_lab_cad_tp_tst_id
            WHERE {where}
            ORDER BY t.dt_agendamento DESC NULLS LAST""", params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()
