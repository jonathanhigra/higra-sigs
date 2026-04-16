# -*- coding: utf-8 -*-
"""RQ80 — Auditorias + RQ94 — Análise de Mudança."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()


def create_rq80_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.beg_rq80 (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500), descricao TEXT,
                dt_auditoria DATE, auditor_id BIGINT, status VARCHAR(20) DEFAULT 'PLANEJADA',
                tipo VARCHAR(20), beg_processo_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.beg_rq80_reg_usu (
                id BIGSERIAL PRIMARY KEY, beg_rq80_id BIGINT NOT NULL,
                usuario_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.beg_rq94 (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500), descricao TEXT,
                justificativa TEXT, impacto TEXT,
                status VARCHAR(20) DEFAULT 'ABERTA', dt_abertura DATE DEFAULT CURRENT_DATE,
                responsavel_id BIGINT, beg_processo_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.beg_rq80_checklist (
                id BIGSERIAL PRIMARY KEY,
                beg_rq80_id BIGINT NOT NULL,
                questao TEXT NOT NULL,
                resposta VARCHAR(20) DEFAULT 'N_AVALIADO',
                observacao TEXT,
                ordem INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq80_cad_checklist (
                id BIGSERIAL PRIMARY KEY,
                titulo VARCHAR(300) NOT NULL,
                questoes JSONB,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.beg_rq80_constatacao (
                id BIGSERIAL PRIMARY KEY,
                beg_rq80_id BIGINT NOT NULL,
                descricao TEXT NOT NULL,
                tipo VARCHAR(20) DEFAULT 'OBSERVACAO',
                gera_rq03 VARCHAR(1) DEFAULT 'N',
                beg_rq03_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER)""",
        ]:
            cur.execute(sql)
        # Novas colunas beg_rq80
        for col_sql in [
            "ALTER TABLE public.beg_rq80 ADD COLUMN IF NOT EXISTS escopo TEXT",
            "ALTER TABLE public.beg_rq80 ADD COLUMN IF NOT EXISTS auditado_id BIGINT",
            "ALTER TABLE public.beg_rq80 ADD COLUMN IF NOT EXISTS dt_inicio DATE",
            "ALTER TABLE public.beg_rq80 ADD COLUMN IF NOT EXISTS dt_fim DATE",
            "ALTER TABLE public.beg_rq80 ADD COLUMN IF NOT EXISTS relatorio TEXT",
            "ALTER TABLE public.beg_rq80 ADD COLUMN IF NOT EXISTS conclusao TEXT",
            # Novas colunas beg_rq94
            "ALTER TABLE public.beg_rq94 ADD COLUMN IF NOT EXISTS aprovadores JSONB",
            "ALTER TABLE public.beg_rq94 ADD COLUMN IF NOT EXISTS riscos TEXT",
            "ALTER TABLE public.beg_rq94 ADD COLUMN IF NOT EXISTS dt_aprovacao DATE",
            "ALTER TABLE public.beg_rq94 ADD COLUMN IF NOT EXISTS aprovado_por INTEGER",
            "ALTER TABLE public.beg_rq94 ADD COLUMN IF NOT EXISTS planos_acao JSONB",
        ]:
            cur.execute(col_sql)
        conn.commit()
        logger.info("Tabelas RQ80/RQ94 verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas RQ80/RQ94: {e}")
    finally:
        cur.close()
        conn.close()


# --- RQ80 Auditorias ---
@router.get("/rq80", dependencies=[Depends(require_permission('QLDD'))])
async def listar_rq80(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                      usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.beg_rq80")
        total = cur.fetchone()["total"]
        cur.execute("""
            SELECT r.*,
                   r.beg_usuario_id as auditor_id,
                   r.sth_cad_processo_id as beg_processo_id,
                   u.name as auditor_nome
            FROM public.beg_rq80 r
            LEFT JOIN public.users u ON u.id = r.beg_usuario_id
            ORDER BY COALESCE(r.created_at, r.created) DESC NULLS LAST LIMIT %s OFFSET %s
        """, (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/rq80", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def criar_rq80(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.beg_rq80 (titulo, descricao, dt_auditoria, auditor_id, tipo, beg_processo_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("dt_auditoria"),
             data.get("auditor_id"), data.get("tipo"), data.get("beg_processo_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/rq80/{id}", dependencies=[Depends(require_permission('QLDD', 'M'))])
async def atualizar_rq80(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.beg_rq80 SET titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
            status=COALESCE(%s,status), updated_at=NOW() WHERE id=%s RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("status"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ80 não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- RQ94 Análise de Mudança ---
@router.get("/rq94", dependencies=[Depends(require_permission('QLDD'))])
async def listar_rq94(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                      usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.beg_rq94")
        total = cur.fetchone()["total"]
        cur.execute("""
            SELECT r.*, u.name as responsavel_nome FROM public.beg_rq94 r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            ORDER BY r.created_at DESC LIMIT %s OFFSET %s
        """, (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/rq80/cronograma", dependencies=[Depends(require_permission('QLDD'))])
async def cronograma_auditorias(ano: int = Query(None), usuario_id: int = Depends(require_user)):
    import datetime
    ano = ano or datetime.date.today().year
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.id, r.titulo, r.tipo, r.status,
                   r.dt_inicio, r.dt_fim, r.dt_auditoria,
                   u.name AS auditor_nome,
                   au.name AS auditado_nome
            FROM public.beg_rq80 r
            LEFT JOIN public.users u ON u.id = r.beg_usuario_id
            LEFT JOIN public.users au ON au.id = r.auditado_id
            WHERE EXTRACT(YEAR FROM COALESCE(r.dt_inicio, r.dt_auditoria, r.created_at)) = %s
            ORDER BY COALESCE(r.dt_inicio, r.dt_auditoria) ASC NULLS LAST
        """, (ano,))
        return {"items": cur.fetchall(), "ano": ano}
    finally:
        cur.close(); conn.close()


@router.get("/rq80/{id}", dependencies=[Depends(require_permission('QLDD'))])
async def obter_rq80(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.*, u.name AS auditor_nome,
                   au.name AS auditado_nome
            FROM public.beg_rq80 r
            LEFT JOIN public.users u ON u.id = r.beg_usuario_id
            LEFT JOIN public.users au ON au.id = r.auditado_id
            WHERE r.id = %s
        """, (id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Auditoria não encontrada")
        cur.execute("SELECT * FROM public.beg_rq80_checklist WHERE beg_rq80_id=%s ORDER BY ordem", (id,))
        row["checklist"] = cur.fetchall()
        cur.execute("""
            SELECT c.*, u.name AS autor_nome
            FROM public.beg_rq80_constatacao c
            LEFT JOIN public.users u ON u.id = c.created_by
            WHERE c.beg_rq80_id=%s ORDER BY c.created_at
        """, (id,))
        row["constatacoes"] = cur.fetchall()
        cur.execute("SELECT * FROM public.beg_rq80_reg_usu WHERE beg_rq80_id=%s", (id,))
        row["equipe"] = cur.fetchall()
        return row
    finally:
        cur.close()
        conn.close()


@router.post("/rq80/{id}/checklist-item", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def add_checklist_item(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_rq80_checklist (beg_rq80_id, questao, resposta, observacao, ordem)
            VALUES (%s,%s,%s,%s,%s) RETURNING *
        """, (id, data.get("questao"), data.get("resposta","N_AVALIADO"), data.get("observacao"), data.get("ordem",0)))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.put("/rq80/{id}/checklist-item/{item_id}", dependencies=[Depends(require_permission('QLDD', 'M'))])
async def update_checklist_item(id: int, item_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq80_checklist
            SET resposta=COALESCE(%s,resposta), observacao=COALESCE(%s,observacao)
            WHERE id=%s AND beg_rq80_id=%s RETURNING *
        """, (data.get("resposta"), data.get("observacao"), item_id, id))
        conn.commit()
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    except HTTPException: raise
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.post("/rq80/{id}/constatacoes", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def add_constatacao(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_rq80_constatacao (beg_rq80_id, descricao, tipo, gera_rq03, created_by)
            VALUES (%s,%s,%s,%s,%s) RETURNING *
        """, (id, data.get("descricao"), data.get("tipo","OBSERVACAO"), data.get("gera_rq03","N"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


# --- RQ94 workflow ---
@router.put("/rq94/{id}", dependencies=[Depends(require_permission('QLDD', 'M'))])
async def atualizar_rq94(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq94
            SET titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
                justificativa=COALESCE(%s,justificativa), impacto=COALESCE(%s,impacto),
                riscos=COALESCE(%s,riscos), status=COALESCE(%s,status), updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (data.get("titulo"), data.get("descricao"), data.get("justificativa"),
              data.get("impacto"), data.get("riscos"), data.get("status"), id))
        conn.commit()
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    except HTTPException: raise
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.get("/rq94/{id}", dependencies=[Depends(require_permission('QLDD'))])
async def obter_rq94(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.*, u.name AS responsavel_nome
            FROM public.beg_rq94 r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            WHERE r.id=%s
        """, (id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    finally:
        cur.close(); conn.close()


@router.post("/rq94/{id}/aprovar", dependencies=[Depends(require_permission('QLDD', 'M'))])
async def aprovar_rq94(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        import datetime
        cur.execute("""
            UPDATE public.beg_rq94
            SET status='APROVADA', dt_aprovacao=%s, aprovado_por=%s, updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (datetime.date.today(), usuario_id, id))
        conn.commit()
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    except HTTPException: raise
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.post("/rq94", status_code=201, dependencies=[Depends(require_permission('QLDD', 'M'))])
async def criar_rq94(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.beg_rq94 (titulo, descricao, justificativa, impacto,
            responsavel_id, beg_processo_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("justificativa"),
             data.get("impacto"), data.get("responsavel_id"), data.get("beg_processo_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
