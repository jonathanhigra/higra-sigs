# -*- coding: utf-8 -*-
"""Indicadores de Qualidade e FMEA."""
import datetime
from fastapi import APIRouter, Depends, Query
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()

def create_indicadores_qual_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_matriz_risco (
                id BIGSERIAL PRIMARY KEY,
                tipo_nc VARCHAR(50),
                gravidade_min SMALLINT, gravidade_max SMALLINT,
                probabilidade_min SMALLINT, probabilidade_max SMALLINT,
                nivel VARCHAR(20) DEFAULT 'MEDIO',
                cor VARCHAR(20) DEFAULT '#ff9800',
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fmea (
                id BIGSERIAL PRIMARY KEY,
                titulo VARCHAR(300) NOT NULL,
                processo VARCHAR(200),
                descricao TEXT,
                status VARCHAR(20) DEFAULT 'RASCUNHO',
                responsavel_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fmea_item (
                id BIGSERIAL PRIMARY KEY,
                hgr_fmea_id BIGINT NOT NULL,
                funcao VARCHAR(300),
                modo_falha TEXT,
                efeito TEXT,
                causa TEXT,
                ocorrencia SMALLINT DEFAULT 1,
                severidade SMALLINT DEFAULT 1,
                detectabilidade SMALLINT DEFAULT 1,
                npn INTEGER GENERATED ALWAYS AS (ocorrencia * severidade * detectabilidade) STORED,
                acao_recomendada TEXT,
                responsavel VARCHAR(200),
                prazo DATE,
                status VARCHAR(20) DEFAULT 'ABERTA',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        conn.commit()
        logger.info("Tabelas Indicadores Qualidade / FMEA verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas FMEA: {e}")
    finally:
        cur.close(); conn.close()

# --- Indicadores de Qualidade ---
@router.get("/indicadores", dependencies=[Depends(require_permission('RNCO'))])
async def indicadores_qualidade(
    periodo_meses: int = Query(12, ge=1, le=36),
    usuario_id: int = Depends(require_user)
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='FECHADA') AS fechadas,
                COUNT(*) FILTER (WHERE status='ABERTA' OR status='EM_ANALISE') AS em_aberto,
                ROUND(AVG(CASE WHEN status='FECHADA' AND dt_fechamento IS NOT NULL
                    THEN (dt_fechamento - created_at::DATE) END)) AS tempo_medio_fechamento_dias,
                COUNT(*) FILTER (WHERE efic_eficaz='S') AS eficazes,
                COUNT(*) FILTER (WHERE efic_eficaz IS NOT NULL) AS com_eficacia,
                ROUND(100.0 * COUNT(*) FILTER (WHERE efic_eficaz='S') /
                    NULLIF(COUNT(*) FILTER (WHERE efic_eficaz IS NOT NULL), 0), 1) AS indice_eficacia_pct
            FROM public.beg_rq03
            WHERE created_at >= NOW() - INTERVAL '%s months'
        """, (periodo_meses,))
        resumo = cur.fetchone()
        cur.execute("""
            SELECT
                DATE_TRUNC('month', created_at) AS mes,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='FECHADA') AS fechadas,
                COUNT(*) FILTER (WHERE tipo='S' OR ind_acidente='S') AS sst
            FROM public.beg_rq03
            WHERE created_at >= NOW() - INTERVAL '%s months'
            GROUP BY 1 ORDER BY 1
        """, (periodo_meses,))
        historico = cur.fetchall()
        cur.execute("""
            SELECT a.descricao AS agente, COUNT(*) AS total
            FROM public.beg_rq03 r
            JOIN public.hgr_rq03_cad_age_csd a ON a.id = r.hgr_rq03_cad_age_csd_id
            WHERE r.created_at >= NOW() - INTERVAL '%s months'
            GROUP BY 1 ORDER BY 2 DESC LIMIT 5
        """, (periodo_meses,))
        top_agentes = cur.fetchall()
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE dt_vencimento < CURRENT_DATE AND status NOT IN ('FECHADA','CANCELADA')) AS acoes_vencidas,
                COUNT(*) FILTER (WHERE status='ABERTA' AND created_at < NOW() - INTERVAL '30 days') AS abertas_ha_30_dias
            FROM public.beg_rq03
        """)
        alertas = cur.fetchone()
        return {
            "resumo": resumo,
            "historico_mensal": historico,
            "top_agentes_causadores": top_agentes,
            "alertas": alertas,
            "periodo_meses": periodo_meses,
        }
    finally:
        cur.close(); conn.close()

# --- Matriz de Risco ---
@router.get("/matriz-risco", dependencies=[Depends(require_permission('RNCO'))])
async def listar_matriz_risco(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_rq03_matriz_risco WHERE ativo='S' ORDER BY nivel")
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("/matriz-risco", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def criar_regra_matriz(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq03_matriz_risco
                    (tipo_nc, gravidade_min, gravidade_max, probabilidade_min, probabilidade_max, nivel, cor)
                    VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (data.get("tipo_nc"), data.get("gravidade_min"), data.get("gravidade_max"),
                     data.get("probabilidade_min"), data.get("probabilidade_max"),
                     data.get("nivel","MEDIO"), data.get("cor","#ff9800")))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# --- FMEA ---
@router.get("/fmea", dependencies=[Depends(require_permission('QLDD'))])
async def listar_fmea(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                      usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page-1)*per_page
        cur.execute("SELECT COUNT(*) AS total FROM public.hgr_fmea")
        total = cur.fetchone()["total"]
        cur.execute("""
            SELECT f.*, u.name AS responsavel_nome,
                   (SELECT COUNT(*) FROM public.hgr_fmea_item i WHERE i.hgr_fmea_id=f.id) AS total_itens
            FROM public.hgr_fmea f
            LEFT JOIN public.users u ON u.id=f.responsavel_id
            ORDER BY f.created_at DESC LIMIT %s OFFSET %s
        """, (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close(); conn.close()

@router.post("/fmea", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def criar_fmea(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_fmea (titulo, processo, descricao, responsavel_id, created_by)
                    VALUES (%s,%s,%s,%s,%s) RETURNING *""",
                    (data["titulo"], data.get("processo"), data.get("descricao"), data.get("responsavel_id"), usuario_id))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

@router.get("/fmea/{id}", dependencies=[Depends(require_permission('QLDD'))])
async def obter_fmea(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT f.*, u.name AS responsavel_nome FROM public.hgr_fmea f LEFT JOIN public.users u ON u.id=f.responsavel_id WHERE f.id=%s", (id,))
        row = cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404)
        cur.execute("SELECT * FROM public.hgr_fmea_item WHERE hgr_fmea_id=%s ORDER BY id", (id,))
        row["itens"] = cur.fetchall()
        return row
    finally:
        cur.close(); conn.close()

@router.post("/fmea/{id}/itens", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def add_fmea_item(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_fmea_item
                    (hgr_fmea_id, funcao, modo_falha, efeito, causa, ocorrencia, severidade, detectabilidade, acao_recomendada, responsavel, prazo)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (id, data.get("funcao"), data.get("modo_falha"), data.get("efeito"),
                     data.get("causa"), data.get("ocorrencia",1), data.get("severidade",1), data.get("detectabilidade",1),
                     data.get("acao_recomendada"), data.get("responsavel"), data.get("prazo")))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

@router.put("/fmea/{id}/itens/{item_id}", dependencies=[Depends(require_permission('QLDD', 'M'))])
async def update_fmea_item(id: int, item_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_fmea_item
                    SET funcao=COALESCE(%s,funcao), modo_falha=COALESCE(%s,modo_falha),
                        efeito=COALESCE(%s,efeito), causa=COALESCE(%s,causa),
                        ocorrencia=COALESCE(%s,ocorrencia), severidade=COALESCE(%s,severidade),
                        detectabilidade=COALESCE(%s,detectabilidade),
                        acao_recomendada=COALESCE(%s,acao_recomendada), status=COALESCE(%s,status)
                    WHERE id=%s AND hgr_fmea_id=%s RETURNING *""",
                    (data.get("funcao"), data.get("modo_falha"), data.get("efeito"),
                     data.get("causa"), data.get("ocorrencia"), data.get("severidade"), data.get("detectabilidade"),
                     data.get("acao_recomendada"), data.get("status"), item_id, id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404)
        return row
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()
