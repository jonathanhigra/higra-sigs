# -*- coding: utf-8 -*-
"""CRUD de Indicadores/Metas + Dashboard + Apontamentos."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection, ensure_table_columns
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter
from backend.core.config import logger

router = APIRouter()


def create_indicadores_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_ges_cad_unidade (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                sigla VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ges_cad_tend (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                tipo VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ges_cad_semaforo (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200),
                cor VARCHAR(20), vlr_min NUMERIC(15,2), vlr_max NUMERIC(15,2),
                ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ges_cad_meta (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300) NOT NULL,
                sigla VARCHAR(50), formula TEXT, unidade VARCHAR(50),
                frequencia VARCHAR(20), meta_valor NUMERIC(15,2), meta_minima NUMERIC(15,2),
                beg_processo_id BIGINT, hgr_ges_cad_tend_id BIGINT,
                hgr_ges_cad_unidade_id BIGINT, responsavel_id BIGINT,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ges_reg_meta (
                id BIGSERIAL PRIMARY KEY, hgr_ges_cad_meta_id BIGINT NOT NULL,
                periodo DATE, valor_realizado NUMERIC(15,4), valor_meta NUMERIC(15,4),
                observacao TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), created_by VARCHAR(100))""",
        ]:
            cur.execute(sql)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_reg_meta_meta ON public.hgr_ges_reg_meta(hgr_ges_cad_meta_id);")
        conn.commit()
        logger.info("Tabelas de indicadores verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas indicadores: {e}")
    finally:
        cur.close()
        conn.close()


# --- CRUD Metas ---
@router.get("/", dependencies=[Depends(require_permission('GES'))])
async def listar_metas(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    ativo: Optional[str] = 'S', usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT m.*,
                   COALESCE(m.responsavel_id, m.hgr_usuario_id) as _responsavel_id,
                   u.name as responsavel_nome, p.nome as processo_nome,
                   un.sigla as unidade_sigla, t.descricao as tendencia
            FROM public.hgr_ges_cad_meta m
            LEFT JOIN public.users u ON u.id = COALESCE(m.responsavel_id, m.hgr_usuario_id)
            LEFT JOIN public.beg_processo p ON p.id = COALESCE(m.beg_processo_id, m.hgr_cad_processo_id)
            LEFT JOIN public.hgr_ges_cad_unidade un ON un.id = m.hgr_ges_cad_unidade_id
            LEFT JOIN public.hgr_ges_cad_tend t ON t.id = m.hgr_ges_cad_tend_id
            WHERE 1=1
        """
        params = []
        if ativo:
            query += " AND COALESCE(m.ativo, 'S') = %s"
            params.append(ativo)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'm',
            empresa_col='hgr_cad_empresa_id', filial_col='hgr_cad_filial_id')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY m.descricao LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/dashboard", dependencies=[Depends(require_permission('GES'))])
async def dashboard_indicadores(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Metas com último apontamento
        cur.execute("""
            SELECT m.id, m.descricao,
                   COALESCE(m.sigla, m.key) as sigla,
                   COALESCE(m.meta_valor, m.valor_alvo) as meta_valor,
                   m.meta_minima,
                   m.frequencia, un.sigla as unidade,
                   COALESCE(rm.valor_realizado, rm.realizado) as valor_realizado,
                   COALESCE(rm.periodo, rm.dt_meta::date) as periodo,
                   CASE
                     WHEN COALESCE(rm.valor_realizado, rm.realizado) IS NULL THEN 'sem_dados'
                     WHEN COALESCE(rm.valor_realizado, rm.realizado) >= COALESCE(m.meta_valor, m.valor_alvo) THEN 'verde'
                     WHEN m.meta_minima IS NOT NULL AND COALESCE(rm.valor_realizado, rm.realizado) >= m.meta_minima THEN 'amarelo'
                     ELSE 'vermelho'
                   END as semaforo
            FROM public.hgr_ges_cad_meta m
            LEFT JOIN public.beg_processo p ON p.id = COALESCE(m.beg_processo_id, m.hgr_cad_processo_id)
            LEFT JOIN public.hgr_ges_cad_unidade un ON un.id = m.hgr_ges_cad_unidade_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(valor_realizado, realizado) as valor_realizado,
                       realizado,
                       COALESCE(periodo, dt_meta::date) as periodo,
                       dt_meta
                FROM public.hgr_ges_reg_meta
                WHERE hgr_ges_cad_meta_id = m.id
                ORDER BY COALESCE(periodo, dt_meta::date) DESC LIMIT 1
            ) rm ON true
            WHERE COALESCE(m.ativo, m.tipo_meta) IS NOT NULL
            ORDER BY m.descricao
        """)
        metas = cur.fetchall()
        resumo = {"verde": 0, "amarelo": 0, "vermelho": 0, "sem_dados": 0}
        for m in metas:
            resumo[m.get("semaforo", "sem_dados")] += 1
        return {"metas": metas, "resumo": resumo}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('GES'))])
async def obter_meta(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT m.*,
                   COALESCE(m.responsavel_id, m.hgr_usuario_id) as _responsavel_id,
                   u.name as responsavel_nome
            FROM public.hgr_ges_cad_meta m
            LEFT JOIN public.users u ON u.id = COALESCE(m.responsavel_id, m.hgr_usuario_id)
            WHERE m.id = %s
        """, (id,))
        meta = cur.fetchone()
        if not meta:
            raise HTTPException(404, "Meta não encontrada")
        # Apontamentos
        cur.execute("""
            SELECT *,
                   COALESCE(periodo, dt_meta::date) as _periodo,
                   COALESCE(valor_realizado, realizado) as _valor_realizado,
                   COALESCE(valor_meta, planejado) as _valor_meta
            FROM public.hgr_ges_reg_meta
            WHERE hgr_ges_cad_meta_id = %s ORDER BY COALESCE(periodo, dt_meta::date) DESC
        """, (id,))
        meta["apontamentos"] = cur.fetchall()
        return meta
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_meta(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_ges_cad_meta
                (descricao, sigla, formula, unidade, frequencia, meta_valor, meta_minima,
                 beg_processo_id, hgr_ges_cad_tend_id, hgr_ges_cad_unidade_id, responsavel_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.get("descricao"), data.get("sigla"), data.get("formula"),
              data.get("unidade"), data.get("frequencia"), data.get("meta_valor"),
              data.get("meta_minima"), data.get("beg_processo_id"),
              data.get("hgr_ges_cad_tend_id"), data.get("hgr_ges_cad_unidade_id"),
              data.get("responsavel_id")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('GES', 'M'))])
async def atualizar_meta(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_ges_cad_meta SET
                descricao=COALESCE(%s,descricao), sigla=COALESCE(%s,sigla),
                meta_valor=COALESCE(%s,meta_valor), meta_minima=COALESCE(%s,meta_minima),
                frequencia=COALESCE(%s,frequencia), responsavel_id=COALESCE(%s,responsavel_id),
                ativo=COALESCE(%s,ativo), updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (data.get("descricao"), data.get("sigla"), data.get("meta_valor"),
              data.get("meta_minima"), data.get("frequencia"), data.get("responsavel_id"),
              data.get("ativo"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Meta não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Apontamentos ---
@router.post("/{meta_id}/apontamentos", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_apontamento_meta(meta_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_ges_reg_meta
                (hgr_ges_cad_meta_id, periodo, valor_realizado, valor_meta, observacao, created_by)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
        """, (meta_id, data.get("periodo"), data.get("valor_realizado"),
              data.get("valor_meta"), data.get("observacao"), str(usuario_id)))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Custo Homem-Hora (hgr_cust_cad_rem_hr) ---
@router.get("/custo-hora", dependencies=[Depends(require_permission('GES'))])
async def listar_custo_hora(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_cust_cad_rem_hr (
                id BIGSERIAL PRIMARY KEY, usuario_id BIGINT,
                valor_hora NUMERIC(10,2), dt_vigencia DATE,
                ativo VARCHAR(1) DEFAULT 'S')
        """)
        conn.commit()
        cur.execute("""SELECT c.*, u.name as usuario_nome FROM public.hgr_cust_cad_rem_hr c
            LEFT JOIN public.users u ON u.id = COALESCE(c.usuario_id, c.hgr_usuario_id)
            WHERE c.ativo = 'S' ORDER BY u.name NULLS LAST""")
        return {"items": cur.fetchall()}
    except Exception:
        conn.rollback()
        return {"items": []}
    finally:
        cur.close()
        conn.close()


@router.post("/custo-hora", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_custo_hora(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_cust_cad_rem_hr (usuario_id, valor_hora, dt_vigencia)
            VALUES (%s, %s, %s) RETURNING *""",
            (data.get("usuario_id"), data.get("valor_hora"), data.get("dt_vigencia")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Unidades de Medida
# ============================================================
@router.get("/unidades", dependencies=[Depends(require_permission('GES'))])
async def listar_unidades(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_ges_cad_unidade WHERE ativo='S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/unidades", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_unidade(data: dict, usuario_id: int = Depends(require_user)):
    descricao = (data.get("descricao") or "").strip()
    if not descricao:
        raise HTTPException(400, "descricao obrigatória")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ges_cad_unidade (descricao, sigla, ativo)
            VALUES (%s, %s, 'S') RETURNING *""",
            (descricao, (data.get("sigla") or "").strip() or None))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/unidades/{uid}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_unidade(uid: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_ges_cad_unidade SET ativo='N' WHERE id=%s", (uid,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Tendências
# ============================================================
@router.get("/tendencias", dependencies=[Depends(require_permission('GES'))])
async def listar_tendencias(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_ges_cad_tend WHERE ativo='S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/tendencias", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_tendencia(data: dict, usuario_id: int = Depends(require_user)):
    descricao = (data.get("descricao") or "").strip()
    if not descricao:
        raise HTTPException(400, "descricao obrigatória")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ges_cad_tend (descricao, tipo, ativo)
            VALUES (%s, %s, 'S') RETURNING *""",
            (descricao, (data.get("tipo") or "CRESCENTE")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/tendencias/{tid}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_tendencia(tid: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_ges_cad_tend SET ativo='N' WHERE id=%s", (tid,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Semáforos (Ranges de Indicador)
# ============================================================
@router.get("/semaforos", dependencies=[Depends(require_permission('GES'))])
async def listar_semaforos(meta_id: Optional[int] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        q = "SELECT * FROM public.hgr_ges_cad_semaforo WHERE ativo='S'"
        params = []
        if meta_id:
            q += " AND (meta_id=%s OR meta_id IS NULL)"
            params.append(meta_id)
        q += " ORDER BY vlr_min"
        cur.execute(q, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/semaforos", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_semaforo(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Add meta_id column if not exists
        cur.execute("ALTER TABLE public.hgr_ges_cad_semaforo ADD COLUMN IF NOT EXISTS meta_id BIGINT")
        cur.execute("""INSERT INTO public.hgr_ges_cad_semaforo (descricao, cor, vlr_min, vlr_max, meta_id, ativo)
            VALUES (%s, %s, %s, %s, %s, 'S') RETURNING *""",
            (data.get("descricao"), data.get("cor", "verde"),
             data.get("vlr_min"), data.get("vlr_max"), data.get("meta_id")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/semaforos/{sid}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_semaforo(sid: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_ges_cad_semaforo SET ativo='N' WHERE id=%s", (sid,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Ano Fiscal
# ============================================================
@router.get("/ano-fiscal", dependencies=[Depends(require_permission('GES'))])
async def listar_anos_fiscais(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ges_cad_ano_fiscal (
            id BIGSERIAL PRIMARY KEY, ano INTEGER NOT NULL UNIQUE,
            dt_inicio DATE, dt_fim DATE,
            ativo VARCHAR(1) DEFAULT 'S', created_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        conn.commit()
        cur.execute("SELECT * FROM public.hgr_ges_cad_ano_fiscal WHERE ativo='S' ORDER BY ano DESC")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/ano-fiscal", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_ano_fiscal(data: dict, usuario_id: int = Depends(require_user)):
    ano = data.get("ano")
    if not ano:
        raise HTTPException(400, "ano obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ges_cad_ano_fiscal (ano, dt_inicio, dt_fim, ativo)
            VALUES (%s, %s, %s, 'S') RETURNING *""",
            (int(ano), data.get("dt_inicio"), data.get("dt_fim")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/ano-fiscal/{af_id}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_ano_fiscal(af_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_ges_cad_ano_fiscal SET ativo='N' WHERE id=%s", (af_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Distribuição de Metas (por usuário / trimestre / vertical)
# ============================================================
@router.get("/{meta_id}/distribuicao", dependencies=[Depends(require_permission('GES'))])
async def listar_distribuicao(meta_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ges_reg_dist_meta (
            id BIGSERIAL PRIMARY KEY, meta_id BIGINT NOT NULL,
            tipo VARCHAR(20) NOT NULL, -- USUARIO, TRIMESTRE, VERTICAL
            referencia VARCHAR(100), -- usuario_id, '1T', 'VENDAS', etc.
            percentual NUMERIC(5,2), valor_meta NUMERIC(15,4),
            created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER
        )""")
        conn.commit()
        cur.execute("""SELECT d.*, u.name as usuario_nome
            FROM public.hgr_ges_reg_dist_meta d
            LEFT JOIN public.users u ON u.id::text = d.referencia AND d.tipo = 'USUARIO'
            WHERE d.meta_id = %s ORDER BY d.tipo, d.referencia""", (meta_id,))
        rows = cur.fetchall()
        # Agregar por tipo
        by_tipo = {}
        total_pct = 0
        for r in rows:
            by_tipo.setdefault(r["tipo"], []).append(r)
            total_pct += float(r.get("percentual") or 0)
        return {"items": rows, "by_tipo": by_tipo, "total_percentual": total_pct}
    finally:
        cur.close()
        conn.close()


@router.post("/{meta_id}/distribuicao", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_distribuicao(meta_id: int, data: dict, usuario_id: int = Depends(require_user)):
    tipo = (data.get("tipo") or "").upper()
    if tipo not in ("USUARIO", "TRIMESTRE", "VERTICAL"):
        raise HTTPException(400, "tipo deve ser USUARIO, TRIMESTRE ou VERTICAL")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ges_reg_dist_meta
            (meta_id, tipo, referencia, percentual, valor_meta, created_by)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
            (meta_id, tipo, str(data.get("referencia") or ""),
             data.get("percentual"), data.get("valor_meta"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{meta_id}/distribuicao/{dist_id}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_distribuicao(meta_id: int, dist_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ges_reg_dist_meta WHERE id=%s AND meta_id=%s",
                    (dist_id, meta_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 526 — Dashboard Consolidado de Indicadores
# ============================================================
@router.get("/dashboard-consolidado", dependencies=[Depends(require_permission('GES'))])
async def dashboard_consolidado(vertical: str = None, ano: int = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        ano_filtro = ano or 2025
        conds = ["m.ativo='S'"]
        params = []
        if vertical:
            conds.append("m.vertical = %s")
            params.append(vertical)

        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE m.id IS NOT NULL) as total_metas,
                COUNT(*) FILTER (WHERE m.tp_indicador = 'CRESCENTE') as crescentes,
                COUNT(*) FILTER (WHERE m.tp_indicador = 'DECRESCENTE') as decrescentes,
                COUNT(DISTINCT m.vertical) as verticais
            FROM public.hgr_ges_cad_meta m
            WHERE {' AND '.join(conds)}
        """, params)
        totais = cur.fetchone() or {}

        cur.execute(f"""
            SELECT m.id, m.descricao, m.vertical, m.vlr_meta, m.vlr_atual, m.tp_indicador,
                   CASE WHEN m.vlr_meta > 0 THEN ROUND((m.vlr_atual / m.vlr_meta * 100)::numeric, 1) ELSE 0 END as pct_realizado
            FROM public.hgr_ges_cad_meta m
            WHERE {' AND '.join(conds)}
            ORDER BY pct_realizado ASC
            LIMIT 5
        """, params)
        em_risco = cur.fetchall()

        cur.execute(f"""
            SELECT m.id, m.descricao, m.vertical, m.vlr_meta, m.vlr_atual,
                   CASE WHEN m.vlr_meta > 0 THEN ROUND((m.vlr_atual / m.vlr_meta * 100)::numeric, 1) ELSE 0 END as pct_realizado
            FROM public.hgr_ges_cad_meta m
            WHERE {' AND '.join(conds)}
            ORDER BY pct_realizado DESC
            LIMIT 5
        """, params)
        top_metas = cur.fetchall()

        cur.execute("""
            SELECT m.vertical, COUNT(*) as qtd,
                   ROUND(AVG(CASE WHEN m.vlr_meta > 0 THEN (m.vlr_atual / m.vlr_meta * 100) ELSE 0 END)::numeric, 1) as media_pct
            FROM public.hgr_ges_cad_meta m
            WHERE m.ativo='S' AND m.vertical IS NOT NULL
            GROUP BY m.vertical ORDER BY media_pct DESC
        """)
        por_vertical = cur.fetchall()

        return {
            "totais": totais,
            "em_risco": em_risco,
            "top_metas": top_metas,
            "por_vertical": por_vertical,
        }
    finally:
        cur.close()
        conn.close()


# ============================================================
# 528 — Relatório "Metas em Risco" (projeção linear vs alvo)
# ============================================================
@router.get("/relatorio-risco", dependencies=[Depends(require_permission('GES'))])
async def relatorio_metas_risco(vertical: str = None, threshold: float = 70.0, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        conds = ["m.ativo='S'", "m.vlr_meta > 0"]
        params: list = [threshold]
        if vertical:
            conds.append("m.vertical = %s")
            params.append(vertical)

        cur.execute(f"""
            SELECT m.id, m.descricao, m.vertical, m.vlr_meta, m.vlr_atual, m.tp_indicador,
                   ROUND((m.vlr_atual / m.vlr_meta * 100)::numeric, 1) as pct_realizado,
                   m.vlr_meta - m.vlr_atual as gap
            FROM public.hgr_ges_cad_meta m
            WHERE {' AND '.join(conds)}
              AND (m.vlr_atual / m.vlr_meta * 100) < %s
            ORDER BY (m.vlr_atual / m.vlr_meta * 100) ASC
        """, params)
        metas_risco = cur.fetchall()

        return {
            "total": len(metas_risco),
            "threshold": threshold,
            "metas": metas_risco,
        }
    finally:
        cur.close()
        conn.close()
