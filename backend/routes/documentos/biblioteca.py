# -*- coding: utf-8 -*-
"""Biblioteca (APEX pg 74 — IR de documentos compartilhados/públicos)."""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission

router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission('BIBL'))])
async def listar_biblioteca(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    tipo_id: Optional[int] = None, search: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """Biblioteca pública de documentos — APEX pg 74."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT d.id, d.titulo, d.codigo, d.revisao_atual, d.status, d.filename, d.created_at,
                   t.descricao as tipo, u.name as responsavel_nome, p.nome as processo_nome
            FROM public.beg_cad_documento d
            LEFT JOIN public.sth_doc_cad_tipo t ON t.id = d.sth_doc_cad_tipo_id
            LEFT JOIN public.users u ON u.id = d.responsavel_id
            LEFT JOIN public.beg_processo p ON p.id = d.beg_processo_id
            WHERE d.status = 'VIGENTE'
        """
        params = []
        if tipo_id:
            query += " AND d.sth_doc_cad_tipo_id = %s"
            params.append(tipo_id)
        if search:
            query += " AND (d.titulo ILIKE %s OR d.codigo ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY d.titulo LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()
