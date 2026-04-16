# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Rotas REST relacionadas ao historico do sistema.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
from backend.services.historico_conversas_service import (
    criar_conversa,
    listar_conversas,
    renomear_conversa,
    excluir_conversa,
)
from backend.services.historico_chat_service import obter_historico_chat
from backend.services.rag_feedback_service import listar_fallbacks, get_fallback_stats
from backend.auth.utils import require_user
from backend.core.config import logger

router = APIRouter(prefix="/historico", tags=["Historico"])


@router.get("/conversa")
async def listar_conversas_usuario(usuario_id: int = Depends(require_user)):
    """
    Alias para listar conversas do chat (compatibilidade).
    """
    try:
        registros = listar_conversas(usuario_id)
        total = len(registros) if registros else 0
        logger.info(f"Conversas listadas | usuario_id={usuario_id} | total={total}")
        return {"conversa": registros}
    except Exception as e:
        logger.exception(f"Erro ao listar conversas do usuario {usuario_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar conversas.")


@router.post("/conversas")
async def criar_conversa_chat(
    titulo: Optional[str] = Body(default=None, embed=True),
    usuario_id: int = Depends(require_user),
):
    try:
        conversa_id = criar_conversa(usuario_id, titulo)
        return {"conversa_id": conversa_id}
    except Exception as e:
        logger.exception(f"Erro ao criar conversa: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar conversa.")


@router.get("/conversas")
async def listar_conversas_chat(usuario_id: int = Depends(require_user)):
    try:
        registros = listar_conversas(usuario_id)
        total = len(registros) if registros else 0
        logger.info(f"Conversas listadas | usuario_id={usuario_id} | total={total}")
        return {"conversas": registros}
    except Exception as e:
        logger.exception(f"Erro ao listar conversas do usuario {usuario_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar conversas.")


@router.get("/conversas/{conversa_id}/mensagens")
async def listar_mensagens_conversa(
    conversa_id: int,
    usuario_id: int = Depends(require_user),
):
    try:
        mensagens = obter_historico_chat(usuario_id, conversa_id, incluir_system=True)
        return {"mensagens": mensagens}
    except Exception as e:
        logger.exception(f"Erro ao listar mensagens: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar mensagens.")


class RenomearConversaPayload(BaseModel):
    titulo: str = ""


@router.patch("/conversas/{conversa_id}/rename")
async def renomear_conversa_chat(
    conversa_id: int,
    payload: RenomearConversaPayload,
    usuario_id: int = Depends(require_user),
):
    await renomear_conversa(conversa_id, usuario_id, payload.titulo)
    logger.info(
        "Conversa renomeada | usuario_id=%s | id=%s | titulo=%s",
        usuario_id,
        conversa_id,
        payload.titulo,
    )
    return {"status": "ok", "id": conversa_id, "titulo": payload.titulo}


@router.delete("/conversas/{conversa_id}")
async def excluir_conversa_chat(
    conversa_id: int,
    usuario_id: int = Depends(require_user),
):
    try:
        deleted = excluir_conversa(conversa_id, usuario_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Erro ao excluir conversa: {e}")
        raise HTTPException(status_code=500, detail="Erro ao excluir conversa.")


@router.get("/ping")
def ping():
    return {"status": "ok", "mensagem": "Servico de historico ativo."}


@router.get("/fallbacks")
async def listar_fallbacks_rag(limit: int = 100):
    try:
        return {"fallbacks": listar_fallbacks(limit)}
    except Exception as e:
        logger.exception(f"Erro ao listar fallbacks: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar fallbacks.")


@router.get("/fallbacks/status")
async def fallbacks_status():
    try:
        return {"status": "ok", "stats": get_fallback_stats()}
    except Exception as e:
        logger.exception(f"Erro ao ler stats de fallbacks: {e}")
        raise HTTPException(status_code=500, detail="Erro ao ler stats de fallbacks.")
