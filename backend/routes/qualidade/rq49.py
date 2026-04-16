# -*- coding: utf-8 -*-
"""
RQ49 — Notas de Oportunidade (melhoria interna)
APEX novo: Cards listing (pg 329) + Cards+Tabs detail (pg 319) + Modal criar (pg 320)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter, get_user_tipo
from backend.core.config import logger
from backend.services.sigs_notifications import notify_no_aberta

router = APIRouter()


def create_rq49_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_rq49_reg_prj (
            id BIGSERIAL PRIMARY KEY,
            beg_rq49_id BIGINT NOT NULL,
            hgr_prj_cad_prj_id BIGINT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER,
            UNIQUE(beg_rq49_id, hgr_prj_cad_prj_id))""")
        cur.execute("ALTER TABLE public.beg_rq49 ADD COLUMN IF NOT EXISTS implementacao TEXT")
        cur.execute("ALTER TABLE public.beg_rq49 ADD COLUMN IF NOT EXISTS verificacao_final TEXT")
        cur.execute("ALTER TABLE public.beg_rq49 ADD COLUMN IF NOT EXISTS impl_data DATE")
        cur.execute("ALTER TABLE public.beg_rq49 ADD COLUMN IF NOT EXISTS verif_data DATE")
        cur.execute("ALTER TABLE public.beg_rq49 ADD COLUMN IF NOT EXISTS verif_eficaz CHAR(1)")
        cur.execute("ALTER TABLE public.beg_rq49_reg_anx ADD COLUMN IF NOT EXISTS legenda VARCHAR(500)")
        cur.execute("ALTER TABLE public.beg_rq49_reg_anx ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'ANEXO'")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_rq49_reg_tar (
            id BIGSERIAL PRIMARY KEY,
            beg_rq49_id BIGINT NOT NULL,
            sth_com_reg_tar_id BIGINT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER,
            UNIQUE(beg_rq49_id, sth_com_reg_tar_id))""")
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_rq49_cad_orig (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                sigla VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq49_cad_cla_pri (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                sigla VARCHAR(20), cor VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.beg_rq49 (
                id BIGSERIAL PRIMARY KEY, codigo VARCHAR(50),
                titulo VARCHAR(500), descricao TEXT, analise TEXT,
                status VARCHAR(20) DEFAULT 'ABERTA', result_analise VARCHAR(20),
                dt_abertura DATE DEFAULT CURRENT_DATE, dt_fechamento DATE,
                beg_processo_id BIGINT, responsavel_id BIGINT,
                hgr_rq49_cad_orig_id BIGINT, hgr_rq49_cad_cla_pri_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.beg_rq49_reg_usu (
                id BIGSERIAL PRIMARY KEY, beg_rq49_id BIGINT NOT NULL,
                usuario_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq49_reg_ant (
                id BIGSERIAL PRIMARY KEY, beg_rq49_id BIGINT NOT NULL,
                descricao TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq49_reg_aval (
                id BIGSERIAL PRIMARY KEY, beg_rq49_id BIGINT NOT NULL,
                avaliacao TEXT, nota INTEGER, dt_avaliacao DATE,
                usuario_id BIGINT, acao_tomada TEXT, eficaz VARCHAR(1),
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        conn.commit()
        # Migration: adiciona colunas gravidade/ocorrencia se ausentes
        for col, typ in [("gravidade", "SMALLINT"), ("ocorrencia", "SMALLINT")]:
            cur.execute(f"""
                ALTER TABLE public.beg_rq49
                ADD COLUMN IF NOT EXISTS {col} {typ}
            """)
        conn.commit()
        logger.info("Tabelas RQ49 verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas RQ49: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/form-options", dependencies=[Depends(require_permission('CMNA'))])
async def rq49_form_options(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, descricao, sigla FROM public.hgr_rq49_cad_orig WHERE ativo='S' ORDER BY descricao")
        origens = cur.fetchall()
        cur.execute("SELECT id, descricao, sigla, cor FROM public.hgr_rq49_cad_cla_pri WHERE ativo='S' ORDER BY descricao")
        classificacoes = cur.fetchall()
        cur.execute("SELECT id, nome as descricao FROM public.beg_processo WHERE ativo='S' ORDER BY nome")
        processos = cur.fetchall()
        cur.execute("SELECT id, name as nome FROM public.users WHERE is_active=true ORDER BY name LIMIT 200")
        usuarios = cur.fetchall()
        return {"origens": origens, "classificacoes": classificacoes, "processos": processos, "usuarios": usuarios}
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('CMNA'))])
async def listar_rq49(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT r.*,
                   r.num_rq::text as codigo,
                   COALESCE(r.dt_abertura, r.data) as dt_abertura,
                   COALESCE(r.responsavel_id, r.beg_usuario_id) as responsavel_id,
                   COALESCE(r.status,
                       CASE WHEN r.enc_analise = 'S' AND r.res_matriz = 'NAO PROCEDENTE' THEN 'IMPROCEDENTE'
                            WHEN r.enc_analise = 'S' AND r.res_matriz IS NOT NULL THEN 'PROCEDENTE'
                            WHEN r.enc_analise = 'S' THEN 'FECHADA'
                            WHEN r.dt_analise IS NOT NULL THEN 'EM_ANALISE'
                            ELSE 'ABERTA'
                       END) as status,
                   u.name as responsavel_nome, o.descricao as origem,
                   c.descricao as classificacao, c.cor as classificacao_cor
            FROM public.beg_rq49 r
            LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
            LEFT JOIN public.hgr_rq49_cad_orig o ON o.id = r.hgr_rq49_cad_orig_id
            LEFT JOIN public.hgr_rq49_cad_cla_pri c ON c.id = r.hgr_rq49_cad_cla_pri_id
            WHERE 1=1
        """
        params = []
        if status:
            query += """ AND COALESCE(r.status,
                CASE WHEN r.enc_analise = 'S' AND r.res_matriz = 'NAO PROCEDENTE' THEN 'IMPROCEDENTE'
                     WHEN r.enc_analise = 'S' AND r.res_matriz IS NOT NULL THEN 'PROCEDENTE'
                     WHEN r.enc_analise = 'S' THEN 'FECHADA'
                     WHEN r.dt_analise IS NOT NULL THEN 'EM_ANALISE'
                     ELSE 'ABERTA'
                END) = %s"""
            params.append(status)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'r')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY COALESCE(r.dt_abertura, r.data) DESC NULLS LAST LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/dashboard", dependencies=[Depends(require_permission('CMNA'))])
async def dashboard_rq49(
    periodo_meses: int = Query(6, ge=1, le=36),
    usuario_id: int = Depends(require_user)
):
    """Dashboard RQ49: abertas, em análise, procedentes/improcedentes, fechadas por período."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='ABERTA') AS abertas,
                COUNT(*) FILTER (WHERE status='EM_ANALISE') AS em_analise,
                COUNT(*) FILTER (WHERE status='PROCEDENTE') AS procedentes,
                COUNT(*) FILTER (WHERE status='IMPROCEDENTE') AS improcedentes,
                COUNT(*) FILTER (WHERE status='FECHADA') AS fechadas,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='FECHADA' AND verif_eficaz='S') AS eficazes,
                COUNT(*) FILTER (WHERE status='FECHADA' AND verif_eficaz IS NOT NULL) AS avaliadas
            FROM public.beg_rq49
            WHERE created_at >= NOW() - INTERVAL '%s months'
        """, (periodo_meses,))
        totais = cur.fetchone()
        cur.execute("""
            SELECT
                DATE_TRUNC('month', created_at) AS mes,
                COUNT(*) FILTER (WHERE status='FECHADA') AS fechadas,
                COUNT(*) FILTER (WHERE status='ABERTA' OR status='EM_ANALISE') AS abertas
            FROM public.beg_rq49
            WHERE created_at >= NOW() - INTERVAL '%s months'
            GROUP BY 1 ORDER BY 1
        """, (periodo_meses,))
        historico = cur.fetchall()
        cur.execute("""
            SELECT r.id, r.codigo, r.titulo, r.status, r.dt_fechamento,
                   r.verif_eficaz, r.verif_data,
                   u.name AS responsavel_nome,
                   (SELECT COUNT(*) FROM public.hgr_rq49_reg_aval a WHERE a.beg_rq49_id=r.id) AS total_avaliacoes
            FROM public.beg_rq49 r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            WHERE r.status = 'FECHADA' AND r.verif_eficaz IS NULL
            ORDER BY r.dt_fechamento ASC NULLS LAST LIMIT 10
        """)
        pendentes_avaliacao = cur.fetchall()
        return {
            "totais": totais,
            "historico_mensal": historico,
            "pendentes_avaliacao": pendentes_avaliacao,
            "periodo_meses": periodo_meses,
        }
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('CMNA'))])
async def obter_rq49(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.*,
                   r.num_rq::text as codigo,
                   COALESCE(r.dt_abertura, r.data) as dt_abertura,
                   COALESCE(r.responsavel_id, r.beg_usuario_id) as responsavel_id,
                   u.name as responsavel_nome, o.descricao as origem,
                   c.descricao as classificacao, c.cor as classificacao_cor
            FROM public.beg_rq49 r
            LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
            LEFT JOIN public.hgr_rq49_cad_orig o ON o.id = r.hgr_rq49_cad_orig_id
            LEFT JOIN public.hgr_rq49_cad_cla_pri c ON c.id = r.hgr_rq49_cad_cla_pri_id
            WHERE r.id = %s
        """, (id,))
        rq = cur.fetchone()
        if not rq:
            raise HTTPException(404, "RQ49 não encontrada")

        # Scope validation
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = rq.get('sth_cad_filial_id') or rq.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")

        cur.execute("""SELECT pa.*, u.name as usuario_nome FROM public.beg_rq49_reg_usu pa
            LEFT JOIN public.users u ON u.id = pa.usuario_id WHERE pa.beg_rq49_id = %s""", (id,))
        rq["equipe"] = cur.fetchall()
        cur.execute("""SELECT a.*, u.name as autor FROM public.hgr_rq49_reg_ant a
            LEFT JOIN public.users u ON u.id = a.created_by WHERE a.beg_rq49_id = %s ORDER BY a.created_at DESC""", (id,))
        rq["anotacoes"] = cur.fetchall()
        cur.execute("SELECT * FROM public.hgr_rq49_reg_aval WHERE beg_rq49_id = %s ORDER BY dt_avaliacao DESC", (id,))
        rq["avaliacoes"] = cur.fetchall()
        return rq
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def criar_rq49(data: dict, usuario_id: int = Depends(require_user)):
    # Auto-fill empresa/filial from logged-in user
    user_data = get_user_tipo(usuario_id)
    if user_data:
        if not data.get('sth_cad_empresa_id'):
            data['sth_cad_empresa_id'] = user_data.get('sth_cad_empresa_id')
        if not data.get('sth_cad_filial_id'):
            data['sth_cad_filial_id'] = user_data.get('sth_cad_filial_id')
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_rq49
                (titulo, descricao, beg_processo_id, responsavel_id,
                 hgr_rq49_cad_orig_id, hgr_rq49_cad_cla_pri_id,
                 sth_cad_empresa_id, sth_cad_filial_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.get("titulo"), data.get("descricao"), data.get("beg_processo_id"),
              data.get("responsavel_id"), data.get("hgr_rq49_cad_orig_id"),
              data.get("hgr_rq49_cad_cla_pri_id"),
              data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id"), usuario_id))
        conn.commit()
        row = cur.fetchone()
        try:
            resp_id = data.get("responsavel_id")
            if resp_id and resp_id != usuario_id:
                notify_no_aberta(row['id'], str(row.get('id', '')), resp_id, usuario_id)
        except Exception:
            pass
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('CMNA', 'M'))])
async def atualizar_rq49(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq49 SET
                titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
                analise=COALESCE(%s,analise), status=COALESCE(%s,status),
                result_analise=COALESCE(%s,result_analise),
                responsavel_id=COALESCE(%s,responsavel_id),
                implementacao=COALESCE(%s,implementacao),
                verificacao_final=COALESCE(%s,verificacao_final),
                impl_data=COALESCE(%s,impl_data),
                verif_data=COALESCE(%s,verif_data),
                verif_eficaz=COALESCE(%s,verif_eficaz),
                updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (data.get("titulo"), data.get("descricao"), data.get("analise"),
              data.get("status"), data.get("result_analise"),
              data.get("responsavel_id"),
              data.get("implementacao"), data.get("verificacao_final"),
              data.get("impl_data") or None, data.get("verif_data") or None,
              data.get("verif_eficaz"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ49 não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Anotações e Equipe ---
@router.post("/{rq49_id}/anotacoes", status_code=201, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def add_anotacao(rq49_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_rq49_reg_ant (beg_rq49_id, descricao, created_by) VALUES (%s,%s,%s) RETURNING *",
                    (rq49_id, data.get("descricao"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Análise de Significância (APEX pg 319 DA res_matriz_gravidade/ocorrencia) ---
@router.put("/{rq49_id}/analise-significancia", dependencies=[Depends(require_permission('CMNA', 'M'))])
async def analise_significancia(rq49_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """
    Calcula resultado da matriz de significância: Gravidade × Ocorrência.
    APEX: BEG_PCK_APEX.FNC_P2_DYNAC_RES_MAT(GRAVIDADE, OCORRENCIA)
    Auto-encerra análise quando resultado é definido (ENC_ANALISE='S').
    """
    gravidade = data.get("gravidade")
    ocorrencia = data.get("ocorrencia")

    # Matriz de significância (APEX FNC_P2_DYNAC_RES_MAT)
    MATRIZ = {
        (1, 1): 'DESPREZIVEL', (1, 2): 'DESPREZIVEL', (1, 3): 'MENOR', (1, 4): 'MODERADO', (1, 5): 'SIGNIFICATIVO',
        (2, 1): 'DESPREZIVEL', (2, 2): 'MENOR', (2, 3): 'MODERADO', (2, 4): 'SIGNIFICATIVO', (2, 5): 'SIGNIFICATIVO',
        (3, 1): 'MENOR', (3, 2): 'MODERADO', (3, 3): 'MODERADO', (3, 4): 'SIGNIFICATIVO', (3, 5): 'CRITICO',
        (4, 1): 'MODERADO', (4, 2): 'SIGNIFICATIVO', (4, 3): 'SIGNIFICATIVO', (4, 4): 'CRITICO', (4, 5): 'CRITICO',
        (5, 1): 'SIGNIFICATIVO', (5, 2): 'SIGNIFICATIVO', (5, 3): 'CRITICO', (5, 4): 'CRITICO', (5, 5): 'CRITICO',
    }

    resultado = None
    if gravidade and ocorrencia:
        resultado = MATRIZ.get((int(gravidade), int(ocorrencia)), 'INDETERMINADO')

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq49 SET
                gravidade = %s, ocorrencia = %s,
                result_analise = %s, updated_at = NOW()
            WHERE id = %s RETURNING id, gravidade, ocorrencia, result_analise, status
        """, (gravidade, ocorrencia, resultado, rq49_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ49 não encontrada")
        return {**row, "gravidade": gravidade, "ocorrencia": ocorrencia, "resultado": resultado}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Avaliação (modal) ---
@router.post("/{rq49_id}/avaliacoes", status_code=201, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def add_avaliacao(rq49_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq49_reg_aval
            (beg_rq49_id, avaliacao, nota, dt_avaliacao, usuario_id, acao_tomada, eficaz)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (rq49_id, data.get("avaliacao"), data.get("nota"),
             data.get("dt_avaliacao"), usuario_id,
             data.get("acao_tomada"), data.get("eficaz")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Projetos associados (tarefa 275) ---
@router.get("/{rq49_id}/projetos", dependencies=[Depends(require_permission('CMNA'))])
async def listar_projetos_rq49(rq49_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT rp.id, rp.hgr_prj_cad_prj_id, p.titulo, p.codigo, p.status, rp.created_at
            FROM public.hgr_rq49_reg_prj rp
            JOIN public.hgr_prj_cad_prj p ON p.id = rp.hgr_prj_cad_prj_id
            WHERE rp.beg_rq49_id = %s
            ORDER BY rp.created_at DESC
        """, (rq49_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{rq49_id}/projetos", status_code=201, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def associar_projeto_rq49(rq49_id: int, data: dict, usuario_id: int = Depends(require_user)):
    prj_id = data.get("hgr_prj_cad_prj_id")
    if not prj_id:
        raise HTTPException(400, "hgr_prj_cad_prj_id obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_rq49_reg_prj (beg_rq49_id, hgr_prj_cad_prj_id, created_by)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING id
        """, (rq49_id, prj_id, usuario_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            return {"message": "Projeto já associado"}
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{rq49_id}/projetos/{reg_id}", status_code=204, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def desassociar_projeto_rq49(rq49_id: int, reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_rq49_reg_prj WHERE id=%s AND beg_rq49_id=%s", (reg_id, rq49_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Vínculo não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/buscar-projetos", dependencies=[Depends(require_permission('CMNA'))])
async def buscar_projetos(q: str = "", usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT id, titulo, codigo, status
            FROM public.hgr_prj_cad_prj
            WHERE (LOWER(titulo) LIKE LOWER(%s) OR LOWER(codigo) LIKE LOWER(%s))
            ORDER BY titulo LIMIT 20
        """, (f'%{q}%', f'%{q}%'))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# --- Tarefas associadas (tarefa 276) ---
@router.get("/{rq49_id}/tarefas", dependencies=[Depends(require_permission('CMNA'))])
async def listar_tarefas_rq49(rq49_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT rt.id, rt.sth_com_reg_tar_id, t.titulo, t.status, t.dt_prazo, rt.created_at,
                   u.name as responsavel_nome
            FROM public.hgr_rq49_reg_tar rt
            JOIN public.sth_com_reg_tar t ON t.id = rt.sth_com_reg_tar_id
            LEFT JOIN public.users u ON u.id = t.responsavel_id
            WHERE rt.beg_rq49_id = %s
            ORDER BY rt.created_at DESC
        """, (rq49_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{rq49_id}/tarefas", status_code=201, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def associar_tarefa_rq49(rq49_id: int, data: dict, usuario_id: int = Depends(require_user)):
    tar_id = data.get("sth_com_reg_tar_id")
    if not tar_id:
        raise HTTPException(400, "sth_com_reg_tar_id obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_rq49_reg_tar (beg_rq49_id, sth_com_reg_tar_id, created_by)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING id
        """, (rq49_id, tar_id, usuario_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            return {"message": "Tarefa já associada"}
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{rq49_id}/tarefas/{reg_id}", status_code=204, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def desassociar_tarefa_rq49(rq49_id: int, reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_rq49_reg_tar WHERE id=%s AND beg_rq49_id=%s", (reg_id, rq49_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Vínculo não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/buscar-tarefas", dependencies=[Depends(require_permission('CMNA'))])
async def buscar_tarefas(q: str = "", usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.id, t.titulo, t.status, t.dt_prazo, u.name as responsavel_nome
            FROM public.sth_com_reg_tar t
            LEFT JOIN public.users u ON u.id = t.responsavel_id
            WHERE LOWER(t.titulo) LIKE LOWER(%s)
            ORDER BY t.created_at DESC LIMIT 20
        """, (f'%{q}%',))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# --- Anexos / Gráficos (tarefa 277) ---
@router.get("/{rq49_id}/anexos", dependencies=[Depends(require_permission('CMNA'))])
async def listar_anexos_rq49(rq49_id: int, tipo: Optional[str] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        sql = """SELECT id, titulo, filename, mimetype, tipo, legenda, created_at
                 FROM public.beg_rq49_reg_anx WHERE beg_rq49_id = %s"""
        params = [rq49_id]
        if tipo:
            sql += " AND tipo = %s"
            params.append(tipo)
        sql += " ORDER BY created_at ASC"
        cur.execute(sql, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{rq49_id}/anexos", status_code=201, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def upload_anexo_rq49(
    rq49_id: int,
    file: UploadFile = File(...),
    tipo: str = Form("GRAFICO"),
    titulo: str = Form(""),
    legenda: str = Form(""),
    usuario_id: int = Depends(require_user),
):
    conteudo = await file.read()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_rq49_reg_anx
                (beg_rq49_id, titulo, arquivo, filename, mimetype, tipo, legenda, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, titulo, filename, mimetype, tipo, legenda, created_at
        """, (rq49_id, titulo or file.filename, conteudo, file.filename,
              file.content_type, tipo, legenda or None, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{rq49_id}/anexos/{anx_id}/imagem", dependencies=[Depends(require_permission('CMNA'))])
async def get_anexo_imagem(rq49_id: int, anx_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT arquivo, mimetype FROM public.beg_rq49_reg_anx WHERE id=%s AND beg_rq49_id=%s", (anx_id, rq49_id))
        row = cur.fetchone()
        if not row or not row[0]:
            raise HTTPException(404)
        return Response(content=bytes(row[0]), media_type=row[1] or "image/png")
    finally:
        cur.close()
        conn.close()


@router.delete("/{rq49_id}/anexos/{anx_id}", status_code=204, dependencies=[Depends(require_permission('CMNA', 'M'))])
async def delete_anexo_rq49(rq49_id: int, anx_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.beg_rq49_reg_anx WHERE id=%s AND beg_rq49_id=%s", (anx_id, rq49_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
