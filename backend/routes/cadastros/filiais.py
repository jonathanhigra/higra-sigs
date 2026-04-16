# -*- coding: utf-8 -*-
"""CRUD de Filiais (sth_cad_filial)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission

router = APIRouter()


@router.get("/")
async def listar_filiais(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    empresa_id: Optional[int] = None,
    ativo: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT f.*, e.descricao as empresa_descricao
            FROM public.sth_cad_filial f
            LEFT JOIN public.sth_cad_empresa e ON e.id = f.sth_cad_empresa_id
            WHERE 1=1
        """
        params = []
        if empresa_id:
            query += " AND f.sth_cad_empresa_id = %s"
            params.append(empresa_id)
        if ativo:
            query += " AND f.ativo = %s"
            params.append(ativo)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY f.descricao LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}")
async def obter_filial(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT f.*, e.descricao as empresa_descricao
            FROM public.sth_cad_filial f
            LEFT JOIN public.sth_cad_empresa e ON e.id = f.sth_cad_empresa_id
            WHERE f.id = %s
        """, (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Filial não encontrada")
        return row
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('CRM', 'M'))])
async def criar_filial(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_cad_filial (descricao, sth_cad_empresa_id, ativo)
            VALUES (%s, %s, %s) RETURNING *
        """, (data.get("descricao"), data.get("sth_cad_empresa_id"), data.get("ativo", "S")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('CRM', 'M'))])
async def atualizar_filial(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.sth_cad_filial
            SET descricao = COALESCE(%s, descricao),
                sth_cad_empresa_id = COALESCE(%s, sth_cad_empresa_id),
                ativo = COALESCE(%s, ativo),
                updated_at = NOW()
            WHERE id = %s RETURNING *
        """, (data.get("descricao"), data.get("sth_cad_empresa_id"), data.get("ativo"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Filial não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
