# -*- coding: utf-8 -*-
"""
616 — RQ94: Analise de Mudanca (Change Analysis) — tabelas hgr_rq94_* ou beg_rq94_*.
APEX key: RQ94 (usa beg_rq94_cad e beg_rq94_reg similares ao RQ80).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()


def create_rq94_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_rq94_cad (
            id BIGSERIAL PRIMARY KEY,
            titulo VARCHAR(500) NOT NULL,
            descricao TEXT,
            tipo_mudanca VARCHAR(100),
            status VARCHAR(20) DEFAULT 'ABERTO',
            responsavel_id BIGINT,
            area_afetada VARCHAR(200),
            impacto VARCHAR(20) DEFAULT 'BAIXO',
            dt_prevista DATE,
            dt_implementacao DATE,
            justificativa TEXT,
            ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_rq94_reg_acao (
            id BIGSERIAL PRIMARY KEY,
            hgr_rq94_cad_id BIGINT NOT NULL,
            descricao TEXT NOT NULL,
            responsavel_id BIGINT,
            status VARCHAR(20) DEFAULT 'ABERTO',
            dt_prazo DATE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_rq94_reg_hist (
            id BIGSERIAL PRIMARY KEY,
            hgr_rq94_cad_id BIGINT NOT NULL,
            status_anterior VARCHAR(20),
            status_novo VARCHAR(20),
            observacao TEXT,
            usuario_id BIGINT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        conn.commit()
        logger.info("Tabelas RQ94 verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas RQ94: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/rq94", dependencies=[Depends(require_permission('QLDD'))])
async def listar_rq94(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    impacto: Optional[str] = None,
    q: Optional[str] = None,
    usuario_id: int = Depends(require_user)
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        conds = ["r.ativo='S'"]
        params = []
        if status:
            conds.append("r.status = %s")
            params.append(status)
        if impacto:
            conds.append("r.impacto = %s")
            params.append(impacto)
        if q:
            conds.append("(r.titulo ILIKE %s OR r.descricao ILIKE %s)")
            params.extend([f"%{q}%", f"%{q}%"])

        where = " AND ".join(conds)
        cur.execute(f"SELECT COUNT(*) as total FROM public.hgr_rq94_cad r WHERE {where}", params)
        total = cur.fetchone()["total"]

        params_q = params + [per_page, offset]
        cur.execute(f"""SELECT r.*, u.name as responsavel_nome
            FROM public.hgr_rq94_cad r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            WHERE {where}
            ORDER BY r.created_at DESC NULLS LAST
            LIMIT %s OFFSET %s""", params_q)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/rq94", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def criar_rq94(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq94_cad
            (titulo, descricao, tipo_mudanca, responsavel_id, area_afetada,
             impacto, dt_prevista, justificativa, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("tipo_mudanca"),
             data.get("responsavel_id"), data.get("area_afetada"),
             data.get("impacto", "BAIXO"), data.get("dt_prevista"),
             data.get("justificativa"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/rq94/{id}", dependencies=[Depends(require_permission('QLDD'))])
async def obter_rq94(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT r.*, u.name as responsavel_nome
            FROM public.hgr_rq94_cad r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            WHERE r.id = %s""", (id,))
        rq = cur.fetchone()
        if not rq:
            raise HTTPException(404, "RQ94 nao encontrado")
        cur.execute("""SELECT a.*, u.name as responsavel_nome
            FROM public.hgr_rq94_reg_acao a
            LEFT JOIN public.users u ON u.id = a.responsavel_id
            WHERE a.hgr_rq94_cad_id = %s ORDER BY a.created_at""", (id,))
        rq["acoes"] = cur.fetchall()
        cur.execute("""SELECT h.*, u.name as usuario_nome
            FROM public.hgr_rq94_reg_hist h
            LEFT JOIN public.users u ON u.id = h.usuario_id
            WHERE h.hgr_rq94_cad_id = %s ORDER BY h.created_at DESC""", (id,))
        rq["historico"] = cur.fetchall()
        return rq
    finally:
        cur.close()
        conn.close()


@router.patch("/rq94/{id}/status", dependencies=[Depends(require_permission('QLDD', 'M'))])
async def alterar_status_rq94(id: int, data: dict, usuario_id: int = Depends(require_user)):
    novo_status = data.get("status")
    if not novo_status:
        raise HTTPException(400, "status obrigatorio")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT status FROM public.hgr_rq94_cad WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ94 nao encontrado")
        cur.execute("""INSERT INTO public.hgr_rq94_reg_hist
            (hgr_rq94_cad_id, status_anterior, status_novo, observacao, usuario_id)
            VALUES (%s,%s,%s,%s,%s)""",
            (id, row["status"], novo_status, data.get("observacao"), usuario_id))
        cur.execute("UPDATE public.hgr_rq94_cad SET status=%s, updated_at=NOW() WHERE id=%s RETURNING *",
                    (novo_status, id))
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


@router.post("/rq94/{id}/acoes", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def add_acao_rq94(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq94_reg_acao
            (hgr_rq94_cad_id, descricao, responsavel_id, dt_prazo, created_by)
            VALUES (%s,%s,%s,%s,%s) RETURNING *""",
            (id, data.get("descricao"), data.get("responsavel_id"),
             data.get("dt_prazo"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
