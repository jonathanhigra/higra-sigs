# -*- coding: utf-8 -*-
"""
Gestão de usuários SIGS — atribuição de tipo, empresa, filial, processo.
Apenas admin (tipo A) pode alterar.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_tipo

router = APIRouter()


@router.get("/")
async def listar_usuarios(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    tipo_usuario: Optional[str] = None,
    empresa_id: Optional[int] = None,
    filial_id: Optional[int] = None,
    ativo: Optional[str] = None,
    usuario_id: int = Depends(require_tipo('A', 'D')),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT u.id, u.username, u.email, u.name, u.is_admin,
                   u.sth_cad_empresa_id, u.sth_cad_filial_id, u.beg_processo_id,
                   u.hgr_stm_cad_tipo_usu_id, u.ativo, u.created_at,
                   t.hgr_vlr_retorno as tipo_usuario,
                   t.hgr_descricao as tipo_descricao,
                   e.descricao as empresa_descricao,
                   f.descricao as filial_descricao,
                   p.nome as processo_nome
            FROM public.users u
            LEFT JOIN public.hgr_stm_cad_tipo_usu t ON t.id = u.hgr_stm_cad_tipo_usu_id
            LEFT JOIN public.sth_cad_empresa e ON e.id = u.sth_cad_empresa_id
            LEFT JOIN public.sth_cad_filial f ON f.id = u.sth_cad_filial_id
            LEFT JOIN public.beg_processo p ON p.id = u.beg_processo_id
            WHERE 1=1
        """
        params = []
        if tipo_usuario:
            query += " AND t.hgr_vlr_retorno = %s"
            params.append(tipo_usuario)
        if empresa_id:
            query += " AND u.sth_cad_empresa_id = %s"
            params.append(empresa_id)
        if filial_id:
            query += " AND u.sth_cad_filial_id = %s"
            params.append(filial_id)
        if ativo:
            query += " AND u.ativo = %s"
            params.append(ativo)

        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY u.name LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.put("/{id}/sigs", dependencies=[Depends(require_tipo('A'))])
async def atualizar_usuario_sigs(id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Atualiza dados SIGS do usuário (tipo, empresa, filial, processo)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.users
            SET hgr_stm_cad_tipo_usu_id = COALESCE(%s, hgr_stm_cad_tipo_usu_id),
                sth_cad_empresa_id = COALESCE(%s, sth_cad_empresa_id),
                sth_cad_filial_id = COALESCE(%s, sth_cad_filial_id),
                beg_processo_id = COALESCE(%s, beg_processo_id),
                ativo = COALESCE(%s, ativo)
            WHERE id = %s RETURNING id, name, email
        """, (
            data.get("hgr_stm_cad_tipo_usu_id"),
            data.get("sth_cad_empresa_id"),
            data.get("sth_cad_filial_id"),
            data.get("beg_processo_id"),
            data.get("ativo"),
            id,
        ))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Usuário não encontrado")
        return {"message": "Dados SIGS atualizados", **row}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/tipos")
async def listar_tipos_usuario(usuario_id: int = Depends(require_user)):
    """Lista todos os tipos de usuário disponíveis."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT id, hgr_vlr_retorno as codigo, hgr_descricao as descricao, ativo
            FROM public.hgr_stm_cad_tipo_usu
            WHERE ativo = 'S'
            ORDER BY id
        """)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()
