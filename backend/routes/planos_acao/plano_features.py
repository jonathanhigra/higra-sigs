# -*- coding: utf-8 -*-
"""
Plano de Ação — Tarefas vinculadas, Equipe Envolvida, Evidências.
Tables: HGR_GAC_REG_TAR_LINK, BEG_RQ80_REG_USU, BEG_RQ80_EVID
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from pydantic import BaseModel
from backend.routes.planos_acao.schemas import (
    PlanoEquipeCreate,
    PlanoTarefaCreate,
    PlanoTarefaLinkCreate,
)


class PlanoMultiLinkCreate(BaseModel):
    tarefa_ids: list[int]
router = APIRouter()


def _normalize_source(source: Optional[str]) -> Optional[str]:
    if source is None:
        return None
    normalized = str(source).strip().upper()
    if not normalized:
        return None
    if normalized not in {"GAC", "RQ80"}:
        raise HTTPException(400, "Fonte de plano invalida")
    return normalized


def _require_gac_source(source: Optional[str]) -> None:
    if _normalize_source(source) == "RQ80":
        raise HTTPException(400, "Tarefas vinculadas estao disponiveis apenas para planos GAC")


def _require_rq80_source(source: Optional[str]) -> None:
    if _normalize_source(source) == "GAC":
        raise HTTPException(400, "Equipe e evidencias estao disponiveis apenas para planos RQ80")


# ============================================================
# TAREFAS vinculadas (HGR_GAC_REG_TAR_LINK)
# ============================================================
@router.get("/{plano_id}/tarefas/disponiveis", dependencies=[Depends(require_permission('GACO'))])
async def listar_tarefas_disponiveis(plano_id: int, search: Optional[str] = None, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    """Tarefas não vinculadas a este plano, pesquisáveis por título (#17)."""
    _require_gac_source(source)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        params = [plano_id]
        q = """
            SELECT t.id, t.titulo, t.status, t.dt_previsao, u.name AS responsavel_nome
            FROM public.hgr_tar_cad_tarefa t
            LEFT JOIN public.users u ON u.id = t.responsavel_id
            WHERE t.id NOT IN (
                SELECT hgr_tar_cad_tarefa_id FROM public.hgr_gac_reg_tar_link WHERE hgr_gac_cad_acao_id = %s
            )
        """
        if search:
            q += " AND t.titulo ILIKE %s"
            params.append(f"%{search}%")
        q += " ORDER BY t.created_at DESC LIMIT 50"
        cur.execute(q, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/{plano_id}/tarefas", dependencies=[Depends(require_permission('GACO'))])
async def listar_tarefas_plano(plano_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_gac_source(source)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.id, t.titulo, t.descricao, t.status, t.prioridade,
                   t.dt_previsao, t.dt_entrega, t.feedback, t.percentual,
                   u.name as responsavel_nome, link.id as link_id,
                   COALESCE(link.ordem, 0) as ordem
            FROM public.hgr_gac_reg_tar_link link
            JOIN public.hgr_tar_cad_tarefa t ON t.id = link.hgr_tar_cad_tarefa_id
            LEFT JOIN public.users u ON u.id = t.responsavel_id
            WHERE link.hgr_gac_cad_acao_id = %s
            ORDER BY COALESCE(link.ordem, 0) ASC, t.dt_previsao ASC NULLS LAST
        """, (plano_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{plano_id}/tarefas/vincular", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def vincular_tarefa(plano_id: int, data: PlanoTarefaLinkCreate, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_gac_source(source)
    _ensure_tables()
    payload = data.model_dump(exclude_unset=True)
    tarefa_id = payload.get("hgr_tar_cad_tarefa_id")
    if not tarefa_id:
        raise HTTPException(400, "ID da tarefa obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_gac_reg_tar_link (hgr_gac_cad_acao_id, hgr_tar_cad_tarefa_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING *""", (plano_id, tarefa_id))
        conn.commit()
        return cur.fetchone() or {"message": "Tarefa já vinculada"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{plano_id}/tarefas/vincular-multiplos", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def vincular_multiplas_tarefas(plano_id: int, data: PlanoMultiLinkCreate, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_gac_source(source)
    if not data.tarefa_ids:
        raise HTTPException(400, "Lista de IDs vazia")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        added = 0
        for tid in data.tarefa_ids:
            cur.execute("""INSERT INTO public.hgr_gac_reg_tar_link (hgr_gac_cad_acao_id, hgr_tar_cad_tarefa_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING""", (plano_id, tid))
            added += cur.rowcount
        conn.commit()
        return {"message": f"{added} tarefa(s) vinculada(s)"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{plano_id}/tarefas/criar", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def criar_tarefa_plano(plano_id: int, data: PlanoTarefaCreate, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_gac_source(source)
    _ensure_tables()
    payload = data.model_dump(exclude_unset=True)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_tar_cad_tarefa
            (titulo, descricao, dt_previsao, responsavel_id, prioridade, status, created_by)
            VALUES (%s, %s, %s, %s, %s, 'ABERTA', %s) RETURNING id""",
            (payload.get("titulo"), payload.get("descricao"), payload.get("dt_previsao"),
             payload.get("responsavel_id"), payload.get("prioridade", "MEDIA"), usuario_id))
        tarefa = cur.fetchone()
        cur.execute("""INSERT INTO public.hgr_gac_reg_tar_link (hgr_gac_cad_acao_id, hgr_tar_cad_tarefa_id)
            VALUES (%s, %s)""", (plano_id, tarefa["id"]))
        conn.commit()
        return {"tarefa_id": tarefa["id"], "message": "Tarefa criada e vinculada"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{plano_id}/tarefas/{link_id}", dependencies=[Depends(require_permission('GACO', 'M'))])
async def desvincular_tarefa(plano_id: int, link_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_gac_source(source)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_gac_reg_tar_link WHERE id = %s AND hgr_gac_cad_acao_id = %s", (link_id, plano_id))
        conn.commit()
        return {"message": "Tarefa desvinculada"}
    finally:
        cur.close()
        conn.close()


# ============================================================
# EQUIPE ENVOLVIDA (BEG_RQ80_REG_USU)
# ============================================================
@router.get("/{plano_id}/equipe", dependencies=[Depends(require_permission('GACO'))])
async def listar_equipe(plano_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_rq80_source(source)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT ru.id, ru.beg_usuarios_id as usuario_id, u.name as nome, u.email
            FROM public.beg_rq80_reg_usu ru
            LEFT JOIN public.users u ON u.id = ru.beg_usuarios_id
            WHERE ru.beg_rq80_id = %s ORDER BY u.name""", (plano_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{plano_id}/equipe", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def adicionar_membro(plano_id: int, data: PlanoEquipeCreate, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_rq80_source(source)
    _ensure_tables()
    payload = data.model_dump(exclude_unset=True)
    user_ids = str(payload.get("usuario_id", ""))
    ids = user_ids.split(':') if ':' in user_ids else [user_ids]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        added = 0
        for uid in ids:
            if uid.strip():
                cur.execute("""INSERT INTO public.beg_rq80_reg_usu (beg_rq80_id, beg_usuarios_id)
                    VALUES (%s, %s) ON CONFLICT DO NOTHING""", (plano_id, int(uid.strip())))
                added += cur.rowcount
        conn.commit()
        return {"message": f"{added} membro(s) adicionado(s)"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{plano_id}/equipe/{membro_id}", dependencies=[Depends(require_permission('GACO', 'M'))])
async def remover_membro(plano_id: int, membro_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_rq80_source(source)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.beg_rq80_reg_usu WHERE id = %s AND beg_rq80_id = %s", (membro_id, plano_id))
        conn.commit()
        return {"message": "Membro removido"}
    finally:
        cur.close()
        conn.close()


# ============================================================
# EVIDÊNCIAS (BEG_RQ80_EVID)
# ============================================================
@router.get("/{plano_id}/evidencias", dependencies=[Depends(require_permission('GACO'))])
async def listar_evidencias(plano_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_rq80_source(source)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT id, dt_cad_evid, observacoes, filename, mimetype,
                   CASE WHEN anexo IS NOT NULL THEN TRUE ELSE FALSE END as tem_anexo
            FROM public.beg_rq80_evid WHERE beg_rq80_id = %s ORDER BY dt_cad_evid DESC""", (plano_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{plano_id}/evidencias", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def criar_evidencia(
    plano_id: int,
    source: Optional[str] = None,
    usuario_id: int = Depends(require_user),
    observacoes: str = Form(...),
    arquivo: Optional[UploadFile] = File(None),
):
    _require_rq80_source(source)
    arquivo_bytes = await arquivo.read() if arquivo and arquivo.filename else None
    mimetype = arquivo.content_type if arquivo_bytes else None
    filename = arquivo.filename if arquivo_bytes else None
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_rq80_evid (beg_rq80_id, observacoes, anexo, mimetype, filename)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, dt_cad_evid, observacoes, filename, mimetype,
                      CASE WHEN anexo IS NOT NULL THEN TRUE ELSE FALSE END AS tem_anexo
        """, (plano_id, observacoes, arquivo_bytes, mimetype, filename))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{plano_id}/evidencias/{evid_id}/anexo", dependencies=[Depends(require_permission('GACO'))])
async def baixar_anexo_evidencia(plano_id: int, evid_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT anexo, mimetype, filename
            FROM public.beg_rq80_evid
            WHERE id = %s AND beg_rq80_id = %s AND anexo IS NOT NULL
        """, (evid_id, plano_id))
        ev = cur.fetchone()
        if not ev:
            raise HTTPException(404, "Anexo não encontrado")
        return Response(
            content=bytes(ev['anexo']),
            media_type=ev['mimetype'] or 'application/octet-stream',
            headers={'Content-Disposition': f'attachment; filename="{ev["filename"] or "anexo"}"'},
        )
    finally:
        cur.close()
        conn.close()


@router.delete("/{plano_id}/evidencias/{evid_id}", dependencies=[Depends(require_permission('GACO', 'M'))])
async def excluir_evidencia(plano_id: int, evid_id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    _require_rq80_source(source)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.beg_rq80_evid WHERE id = %s AND beg_rq80_id = %s", (evid_id, plano_id))
        conn.commit()
        return {"message": "Evidência excluída"}
    finally:
        cur.close()
        conn.close()
