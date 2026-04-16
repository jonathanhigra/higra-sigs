# -*- coding: utf-8 -*-
"""Gestão de Permissões (APEX pg 112) — CRUD tipos de usuário + permissões por módulo."""

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_tipo

router = APIRouter()


@router.get("/tipos")
async def listar_tipos(usuario_id: int = Depends(require_tipo('A'))):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.*, (SELECT COUNT(*) FROM public.users WHERE hgr_stm_cad_tipo_usu_id = t.id) as qtd_usuarios
            FROM public.hgr_stm_cad_tipo_usu t ORDER BY t.id
        """)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/tipos/{tipo_id}/permissoes")
async def obter_permissoes_tipo(tipo_id: int, usuario_id: int = Depends(require_tipo('A'))):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_stm_perm_menu WHERE hgr_stm_cad_tipo_usu_id = %s ORDER BY modulo_key", (tipo_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.put("/tipos/{tipo_id}/permissoes")
async def salvar_permissoes_tipo(tipo_id: int, data: dict, usuario_id: int = Depends(require_tipo('A'))):
    """Salva permissões de um tipo de usuário. data.permissoes: {mod_key: 'C'|'M'|'R'|null}"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        permissoes = data.get("permissoes", {})
        # Deletar existentes
        cur.execute("DELETE FROM public.hgr_stm_perm_menu WHERE hgr_stm_cad_tipo_usu_id = %s", (tipo_id,))
        # Inserir novas
        for mod_key, acesso in permissoes.items():
            if acesso and acesso in ('C', 'M'):
                cur.execute("""
                    INSERT INTO public.hgr_stm_perm_menu (hgr_stm_cad_tipo_usu_id, modulo_key, acesso)
                    VALUES (%s, %s, %s)
                """, (tipo_id, mod_key, acesso))
        conn.commit()
        return {"message": "Permissões salvas", "tipo_id": tipo_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- CRUD Tipos de Usuário ---
@router.post("/tipos", status_code=201)
async def criar_tipo(data: dict, usuario_id: int = Depends(require_tipo('A'))):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_stm_cad_tipo_usu (hgr_descricao, hgr_vlr_retorno)
            VALUES (%s, %s) RETURNING *""",
            (data.get("hgr_descricao"), data.get("hgr_vlr_retorno")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/tipos/{tipo_id}")
async def atualizar_tipo(tipo_id: int, data: dict, usuario_id: int = Depends(require_tipo('A'))):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_stm_cad_tipo_usu SET
            hgr_descricao=COALESCE(%s,hgr_descricao), ativo=COALESCE(%s,ativo)
            WHERE id=%s RETURNING *""",
            (data.get("hgr_descricao"), data.get("ativo"), tipo_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tipo não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
