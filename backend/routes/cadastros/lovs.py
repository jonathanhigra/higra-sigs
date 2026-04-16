# -*- coding: utf-8 -*-
"""
LOVs (List of Values) — equivalente às 265 LOVs do Oracle APEX.
Endpoints de dropdown para popular SELECT/POPUP_LOV nos formulários.
Implementa cascading LOVs (parent-child).

APEX patterns:
- TABLE LOV: simple table lookup (BEG_USUARIOS.NOME, STH_CAD_FILIAL.DESCRICAO)
- SQL LOV: custom query with filters (LV_ASS_USUARIOS, LV_CRM_*)
- STATIC LOV: hardcoded values
- Cascading: P204_HGR_USUARIO_ID → sets empresa/filial/processo (3 DAs)
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import get_user_scope

router = APIRouter()


# ============================================================
# Usuários (TABLE LOV: BEG_USUARIOS.NOME)
# ============================================================
@router.get("/usuarios")
async def lov_usuarios(
    ativo: Optional[str] = 'S',
    tipo: Optional[str] = None,
    empresa_id: Optional[int] = None,
    filial_id: Optional[int] = None,
    search: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """LOV de usuários com filtros cascading. APEX: LV_USUARIOS, LV_ASS_USUARIOS."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT u.id as value, u.name as label,
                   u.email, u.sth_cad_empresa_id, u.sth_cad_filial_id, u.beg_processo_id,
                   t.hgr_vlr_retorno as tipo_usuario
            FROM public.users u
            LEFT JOIN public.hgr_stm_cad_tipo_usu t ON t.id = u.hgr_stm_cad_tipo_usu_id
            WHERE COALESCE(u.ativo, 'S') = 'S'
        """
        params = []
        if tipo:
            query += " AND t.hgr_vlr_retorno = %s"
            params.append(tipo)
        if empresa_id:
            query += " AND u.sth_cad_empresa_id = %s"
            params.append(empresa_id)
        if filial_id:
            query += " AND u.sth_cad_filial_id = %s"
            params.append(filial_id)
        if search:
            query += " AND (u.name ILIKE %s OR u.email ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        query += " ORDER BY u.name LIMIT 100"
        cur.execute(query, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Cascading LOV: usuario → empresa/filial/processo
# APEX pg 204: CHANGE_EMP, CHANGE_FIL, CHANGE_PROC DAs
# ============================================================
@router.get("/usuarios/{user_id}/contexto")
async def lov_usuario_contexto(user_id: int, usuario_id: int = Depends(require_user)):
    """Retorna empresa/filial/processo do usuário. APEX cascading LOV."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT u.sth_cad_empresa_id, u.sth_cad_filial_id, u.beg_processo_id,
                   e.descricao as empresa_nome, f.descricao as filial_nome, p.nome as processo_nome
            FROM public.users u
            LEFT JOIN public.sth_cad_empresa e ON e.id = u.sth_cad_empresa_id
            LEFT JOIN public.sth_cad_filial f ON f.id = u.sth_cad_filial_id
            LEFT JOIN public.beg_processo p ON p.id = u.beg_processo_id
            WHERE u.id = %s
        """, (user_id,))
        row = cur.fetchone()
        return row or {}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Filiais acessíveis pelo usuário logado (#43)
# ============================================================
@router.get("/minhas-filiais")
async def lov_minhas_filiais(usuario_id: int = Depends(require_user)):
    """Retorna apenas filiais que o user pode acessar (para selector de contexto)."""
    scope = get_user_scope(usuario_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if scope.get('bypass'):
            cur.execute("""SELECT id as value, descricao as label, sigla, color, color_text
                FROM public.sth_cad_filial WHERE COALESCE(ativo, 'S') = 'S' ORDER BY descricao""")
        elif scope['filial_ids']:
            placeholders = ','.join(['%s'] * len(scope['filial_ids']))
            cur.execute(f"""SELECT id as value, descricao as label, sigla, color, color_text
                FROM public.sth_cad_filial WHERE id IN ({placeholders}) ORDER BY descricao""",
                scope['filial_ids'])
        else:
            return {"items": []}
        return {"items": cur.fetchall(), "bypass": scope.get('bypass', False)}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Empresas (TABLE LOV: STH_CAD_EMPRESA.DESCRICAO)
# ============================================================
@router.get("/empresas")
async def lov_empresas(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id as value, descricao as label FROM public.sth_cad_empresa WHERE COALESCE(ativo, 'S') = 'S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Filiais (TABLE LOV: STH_CAD_FILIAL.DESCRICAO) — cascading por empresa
# ============================================================
@router.get("/filiais")
async def lov_filiais(empresa_id: Optional[int] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = "SELECT id as value, descricao as label, sth_cad_empresa_id FROM public.sth_cad_filial WHERE COALESCE(ativo, 'S') = 'S'"
        params = []
        if empresa_id:
            query += " AND sth_cad_empresa_id = %s"
            params.append(empresa_id)
        query += " ORDER BY descricao"
        cur.execute(query, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Processos (TABLE LOV: BEG_PROCESSO.NOME)
# ============================================================
@router.get("/processos")
async def lov_processos(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id as value, nome as label FROM public.beg_processo WHERE COALESCE(ativo, 'S') = 'S' ORDER BY nome")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Domínios (SQL LOV: BEG_VALOR_DOMINIO — pattern mais usado no APEX)
# APEX: SELECT D.VLR_EXIBICAO, D.VLR_RETORNO FROM BEG_VALOR_DOMINIO D, BEG_DOMINIO M WHERE M.NOME = '<LOV_NAME>'
# ============================================================
@router.get("/dominios/{dominio_nome}")
async def lov_dominio(dominio_nome: str, usuario_id: int = Depends(require_user)):
    """LOV genérica por nome de domínio. APEX: BEG_VALOR_DOMINIO pattern."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT d.id as value, d.vlr_exibicao as label, d.vlr_retorno as code
            FROM public.beg_valor_dominio d
            JOIN public.beg_dominio m ON m.id = d.beg_dominio_id
            WHERE m.nome = %s AND COALESCE(d.ativo, 'S') = 'S'
            ORDER BY d.ordem, d.vlr_exibicao
        """, (dominio_nome,))
        return {"items": cur.fetchall()}
    except Exception:
        return {"items": []}
    finally:
        cur.close()
        conn.close()


# ============================================================
# LOVs estáticas (STATIC LOV do APEX)
# ============================================================
@router.get("/static/{lov_name}")
async def lov_static(lov_name: str, usuario_id: int = Depends(require_user)):
    """LOVs estáticas. APEX: STATIC LOVs."""
    LOVS = {
        "prioridade": [
            {"value": "URGENTE", "label": "Urgente"},
            {"value": "ALTA", "label": "Alta"},
            {"value": "MEDIA", "label": "Média"},
            {"value": "BAIXA", "label": "Baixa"},
        ],
        "status_tarefa": [
            {"value": "ABERTA", "label": "Aberta"},
            {"value": "EM_ANDAMENTO", "label": "Em andamento"},
            {"value": "CONCLUIDA", "label": "Concluída"},
            {"value": "CANCELADA", "label": "Cancelada"},
        ],
        "status_projeto": [
            {"value": "ABERTO", "label": "Aberto"},
            {"value": "EM_ANDAMENTO", "label": "Em andamento"},
            {"value": "PARALISADO", "label": "Paralisado"},
            {"value": "FINALIZADO", "label": "Finalizado"},
        ],
        "status_reuniao": [
            {"value": "AGENDADA", "label": "Agendada"},
            {"value": "EM_ANDAMENTO", "label": "Em andamento"},
            {"value": "ENCERRADA", "label": "Encerrada"},
            {"value": "CANCELADA", "label": "Cancelada"},
        ],
        "frequencia_meta": [
            {"value": "MENSAL", "label": "Mensal"},
            {"value": "TRIMESTRAL", "label": "Trimestral"},
            {"value": "SEMESTRAL", "label": "Semestral"},
            {"value": "ANUAL", "label": "Anual"},
        ],
        "tipo_rq03": [
            {"value": "EXTERNA", "label": "Externa (cliente)"},
            {"value": "INTERNA", "label": "Interna"},
            {"value": "SST", "label": "SST (acidente)"},
        ],
        "acesso_usuario": [
            {"value": "C", "label": "Consulta"},
            {"value": "M", "label": "Manutenção"},
            {"value": "R", "label": "Revogado"},
        ],
    }
    items = LOVS.get(lov_name, [])
    return {"items": items}
