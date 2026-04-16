# -*- coding: utf-8 -*-
"""Service / Laudos Técnicos (APEX: 9 tabelas)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.core.config import logger

router = APIRouter()


def create_laudos_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_srv_reg_lau (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500),
                descricao TEXT, tipo VARCHAR(50),
                hgr_ass_cad_atn_id BIGINT, cliente VARCHAR(300),
                nr_serie VARCHAR(100), modelo VARCHAR(200),
                status VARCHAR(20) DEFAULT 'ABERTO',
                tecnico_id BIGINT, dt_laudo DATE DEFAULT CURRENT_DATE,
                conclusao TEXT, recomendacao TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_srv_reg_lau_etp (
                id BIGSERIAL PRIMARY KEY, hgr_srv_reg_lau_id BIGINT NOT NULL,
                descricao TEXT, ordem INTEGER, status VARCHAR(20),
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_serv_cad_tipo_garan (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_serv_cad_tec (
                id BIGSERIAL PRIMARY KEY, nome VARCHAR(200), especialidade VARCHAR(200),
                ativo VARCHAR(1) DEFAULT 'S')""",
        ]:
            cur.execute(sql)
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS assinatura_cliente TEXT")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS assinatura_nome VARCHAR(200)")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS assinatura_dt TIMESTAMPTZ")
        # Novas colunas hgr_srv_reg_lau
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS tipo_servico_id BIGINT")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS custo_estimado NUMERIC(14,2)")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS custo_real NUMERIC(14,2)")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS garantia_tipo_id BIGINT")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS dt_expedicao DATE")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS rq03_id BIGINT")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS observacao_interna TEXT")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS pesquisa_satisfacao SMALLINT")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS dt_encerramento DATE")
        cur.execute("ALTER TABLE public.hgr_srv_reg_lau ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT")
        # Novas tabelas auxiliares
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_serv_cad_tp_srv (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_serv_cad_aut (
            id BIGSERIAL PRIMARY KEY, nome VARCHAR(300) NOT NULL, cnpj VARCHAR(20),
            cidade VARCHAR(150), estado VARCHAR(2), ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_serv_reg_tec_aut (
            id BIGSERIAL PRIMARY KEY, hgr_serv_cad_aut_id BIGINT NOT NULL,
            nome VARCHAR(200), especialidade VARCHAR(200),
            dt_validade_cert DATE, ativo VARCHAR(1) DEFAULT 'S')""")
        conn.commit()
        logger.info("Tabelas de laudos verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas laudos: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/")
async def listar_laudos(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                        status: Optional[str] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """SELECT l.*, u.name as tecnico_nome,
                ts.descricao as tipo_servico, tg.descricao as garantia_tipo,
                l.tipo_servico_id, l.custo_estimado, l.custo_real
            FROM public.hgr_srv_reg_lau l
            LEFT JOIN public.users u ON u.id = l.tecnico_id
            LEFT JOIN public.hgr_serv_cad_tp_srv ts ON ts.id = l.tipo_servico_id
            LEFT JOIN public.hgr_serv_cad_tipo_garan tg ON tg.id = l.garantia_tipo_id
            WHERE 1=1"""
        params = []
        if status:
            query += " AND l.status = %s"
            params.append(status)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY l.dt_laudo DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}")
async def obter_laudo(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT l.*, u.name as tecnico_nome FROM public.hgr_srv_reg_lau l
            LEFT JOIN public.users u ON u.id = l.tecnico_id WHERE l.id = %s""", (id,))
        lau = cur.fetchone()
        if not lau:
            raise HTTPException(404, "Laudo não encontrado")
        cur.execute("SELECT * FROM public.hgr_srv_reg_lau_etp WHERE hgr_srv_reg_lau_id = %s ORDER BY ordem", (id,))
        lau["etapas"] = cur.fetchall()
        return lau
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201)
async def criar_laudo(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_srv_reg_lau
            (titulo, descricao, tipo, cliente, nr_serie, modelo, tecnico_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("tipo"),
             data.get("cliente"), data.get("nr_serie"), data.get("modelo"),
             data.get("tecnico_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}")
async def atualizar_laudo(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_srv_reg_lau SET
            titulo=COALESCE(%s,titulo), status=COALESCE(%s,status),
            conclusao=COALESCE(%s,conclusao), recomendacao=COALESCE(%s,recomendacao)
            WHERE id=%s RETURNING *""",
            (data.get("titulo"), data.get("status"), data.get("conclusao"),
             data.get("recomendacao"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Laudo não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Tipo de Serviço ───────────────────────────────────────────────────────────
@router.get("/tipo-servico", dependencies=[Depends(require_user)])
async def listar_tipo_servico():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_serv_cad_tp_srv WHERE ativo='S' ORDER BY descricao")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/tipo-servico", status_code=201, dependencies=[Depends(require_user)])
async def criar_tipo_servico(data: dict):
    if not data.get("descricao"):
        raise HTTPException(400, "descricao obrigatoria")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_serv_cad_tp_srv (descricao) VALUES (%s) RETURNING *",
            (data["descricao"],))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Tipo de Garantia ──────────────────────────────────────────────────────────
@router.get("/tipo-garantia", dependencies=[Depends(require_user)])
async def listar_tipo_garantia():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_serv_cad_tipo_garan WHERE ativo='S' ORDER BY descricao")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/tipo-garantia", status_code=201, dependencies=[Depends(require_user)])
async def criar_tipo_garantia(data: dict):
    if not data.get("descricao"):
        raise HTTPException(400, "descricao obrigatoria")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_serv_cad_tipo_garan (descricao) VALUES (%s) RETURNING *",
            (data["descricao"],))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Autorizadas ───────────────────────────────────────────────────────────────
@router.get("/autorizadas", dependencies=[Depends(require_user)])
async def listar_autorizadas(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    ativo: str = Query("S"),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute(
            "SELECT COUNT(*) as total FROM public.hgr_serv_cad_aut WHERE ativo = %s", (ativo,))
        total = cur.fetchone()["total"]
        cur.execute(
            "SELECT * FROM public.hgr_serv_cad_aut WHERE ativo = %s ORDER BY nome LIMIT %s OFFSET %s",
            (ativo, per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/autorizadas", status_code=201, dependencies=[Depends(require_user)])
async def criar_autorizada(data: dict):
    if not data.get("nome"):
        raise HTTPException(400, "nome obrigatorio")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO public.hgr_serv_cad_aut (nome, cnpj, cidade, estado)
               VALUES (%s,%s,%s,%s) RETURNING *""",
            (data["nome"], data.get("cnpj"), data.get("cidade"), data.get("estado")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/autorizadas/{id}/tecnicos", dependencies=[Depends(require_user)])
async def listar_tecnicos_autorizada(id: int):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_serv_reg_tec_aut WHERE hgr_serv_cad_aut_id = %s ORDER BY nome",
            (id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/autorizadas/{id}/tecnicos", status_code=201, dependencies=[Depends(require_user)])
async def add_tecnico_autorizada(id: int, data: dict):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO public.hgr_serv_reg_tec_aut
               (hgr_serv_cad_aut_id, nome, especialidade, dt_validade_cert)
               VALUES (%s,%s,%s,%s) RETURNING *""",
            (id, data.get("nome"), data.get("especialidade"), data.get("dt_validade_cert")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard", dependencies=[Depends(require_user)])
async def dashboard_laudos():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_srv_reg_lau WHERE status='ABERTO'")
        total_abertos = cur.fetchone()["total"]
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_srv_reg_lau WHERE status='FECHADO'")
        total_fechados = cur.fetchone()["total"]
        cur.execute("""SELECT AVG(dt_encerramento - dt_laudo) as media
            FROM public.hgr_srv_reg_lau WHERE status='FECHADO' AND dt_encerramento IS NOT NULL""")
        row = cur.fetchone()
        tempo_medio = float(row["media"]) if row and row["media"] is not None else None
        cur.execute("""SELECT u.name as tecnico_nome, COUNT(*) as total
            FROM public.hgr_srv_reg_lau l
            LEFT JOIN public.users u ON u.id = l.tecnico_id
            GROUP BY u.name ORDER BY total DESC""")
        laudos_por_tecnico = cur.fetchall()
        cur.execute("""SELECT TO_CHAR(DATE_TRUNC('month', dt_laudo), 'YYYY-MM') as mes,
                COUNT(*) as total
            FROM public.hgr_srv_reg_lau
            WHERE dt_laudo >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
            GROUP BY mes ORDER BY mes""")
        laudos_por_mes = cur.fetchall()
        return {
            "total_abertos": total_abertos,
            "total_fechados": total_fechados,
            "tempo_medio_dias": tempo_medio,
            "laudos_por_tecnico": laudos_por_tecnico,
            "laudos_por_mes": laudos_por_mes,
        }
    finally:
        cur.close()
        conn.close()


# ── Encerrar laudo ────────────────────────────────────────────────────────────
@router.post("/{id}/encerrar", dependencies=[Depends(require_user)])
async def encerrar_laudo(id: int, data: dict, usuario_id: int = Depends(require_user)):
    satisfacao = data.get("pesquisa_satisfacao")
    if satisfacao is not None and satisfacao not in range(1, 6):
        raise HTTPException(400, "pesquisa_satisfacao deve ser entre 1 e 5")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_srv_reg_lau SET
            status='FECHADO', dt_encerramento=CURRENT_DATE,
            motivo_encerramento=COALESCE(%s, motivo_encerramento),
            pesquisa_satisfacao=COALESCE(%s, pesquisa_satisfacao)
            WHERE id=%s RETURNING *""",
            (data.get("motivo_encerramento"), satisfacao, id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Laudo não encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Assinatura digital (tarefa 252) ──────────────────────────────────────────
@router.post("/{id}/assinar", dependencies=[Depends(require_user)])
async def assinar_laudo(id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Salva assinatura digital do cliente (base64 PNG) no laudo."""
    assinatura_b64 = data.get("assinatura")
    nome = data.get("nome", "")
    if not assinatura_b64:
        raise HTTPException(400, "Assinatura obrigatoria (base64)")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_srv_reg_lau
            SET assinatura_cliente=%s, assinatura_nome=%s, assinatura_dt=NOW()
            WHERE id=%s RETURNING id, assinatura_nome, assinatura_dt""",
            (assinatura_b64, nome, id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Laudo não encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
