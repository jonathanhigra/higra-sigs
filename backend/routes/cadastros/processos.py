# -*- coding: utf-8 -*-
"""CRUD de Processos/Setores (beg_processo)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission

router = APIRouter()


@router.get("/")
async def listar_processos(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    ativo: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = "SELECT * FROM public.beg_processo WHERE 1=1"
        params = []
        if ativo:
            query += " AND ativo = %s"
            params.append(ativo)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY nome LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}")
async def obter_processo(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.beg_processo WHERE id = %s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Processo não encontrado")
        return row
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('CRM', 'M'))])
async def criar_processo(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_processo (nome, descricao, ativo)
            VALUES (%s, %s, %s) RETURNING *
        """, (data.get("nome"), data.get("descricao"), data.get("ativo", "S")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('CRM', 'M'))])
async def atualizar_processo(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_processo
            SET nome = COALESCE(%s, nome),
                descricao = COALESCE(%s, descricao),
                ativo = COALESCE(%s, ativo),
                updated_at = NOW()
            WHERE id = %s RETURNING *
        """, (data.get("nome"), data.get("descricao"), data.get("ativo"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Processo não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
