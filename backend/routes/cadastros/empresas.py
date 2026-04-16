# -*- coding: utf-8 -*-
"""CRUD de Empresas (sth_cad_empresa)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission

router = APIRouter()


@router.get("/")
async def listar_empresas(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    ativo: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = "SELECT * FROM public.sth_cad_empresa WHERE 1=1"
        params = []
        if ativo:
            query += " AND ativo = %s"
            params.append(ativo)
        # Total
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY descricao LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}")
async def obter_empresa(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.sth_cad_empresa WHERE id = %s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Empresa não encontrada")
        return row
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('CRM', 'M'))])
async def criar_empresa(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_cad_empresa (descricao, cnpj, ativo)
            VALUES (%s, %s, %s) RETURNING *
        """, (data.get("descricao"), data.get("cnpj"), data.get("ativo", "S")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('CRM', 'M'))])
async def atualizar_empresa(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.sth_cad_empresa
            SET descricao = COALESCE(%s, descricao),
                cnpj = COALESCE(%s, cnpj),
                ativo = COALESCE(%s, ativo),
                updated_at = NOW()
            WHERE id = %s RETURNING *
        """, (data.get("descricao"), data.get("cnpj"), data.get("ativo"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Empresa não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
