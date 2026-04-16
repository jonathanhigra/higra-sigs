# -*- coding: utf-8 -*-
"""
Rotas do Arquimedes — IA do Nexus
"""

import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from backend.auth.utils import require_user
from backend.auth.utils import verificar_admin
from backend.services.arquimedes_service import (
    gerar_post_arquimedes,
    curtir_posts_arquimedes,
    executar_ciclo_arquimedes,
    responder_comentarios_pendentes,
    limpar_posts_arquimedes,
)
from pydantic import BaseModel


class CleanupRequest(BaseModel):
    antes_de: str  # formato YYYY-MM-DD


class ConfigRequest(BaseModel):
    post_interval: Optional[int] = None      # segundos
    article_interval: Optional[int] = None   # segundos
    like_interval: Optional[int] = None      # segundos
    reply_interval: Optional[int] = None     # segundos


# Config dinâmica — lida pelo scheduler em main.py
arquimedes_config = {
    "post_interval": int(os.getenv("ARQUIMEDES_POST_INTERVAL", "43200")),
    "article_interval": int(os.getenv("ARQUIMEDES_ARTICLE_INTERVAL", "86400")),
    "like_interval": int(os.getenv("ARQUIMEDES_LIKE_INTERVAL", "14400")),
    "reply_interval": int(os.getenv("ARQUIMEDES_REPLY_INTERVAL", "1800")),
}

router = APIRouter(prefix="/arquimedes", tags=["Arquimedes IA"])


@router.post("/post")
async def trigger_post(usuario_id: int = Depends(require_user)):
    """Admin dispara um post do Arquimedes manualmente."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    post_id = await gerar_post_arquimedes()
    if not post_id:
        raise HTTPException(status_code=500, detail="Falha ao gerar post")
    return {"post_id": post_id}


@router.post("/article")
async def trigger_article(usuario_id: int = Depends(require_user)):
    """Admin dispara um artigo do Arquimedes manualmente."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    post_id = await gerar_post_arquimedes(force_article=True)
    if not post_id:
        raise HTTPException(status_code=500, detail="Falha ao gerar artigo")
    return {"post_id": post_id}


@router.post("/like")
async def trigger_likes(usuario_id: int = Depends(require_user)):
    """Admin dispara curtidas do Arquimedes manualmente."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    count = await curtir_posts_arquimedes()
    return {"likes": count}


@router.post("/reply")
async def trigger_replies(usuario_id: int = Depends(require_user)):
    """Admin dispara respostas a comentarios pendentes."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    count = await responder_comentarios_pendentes()
    return {"replies": count}


@router.post("/cleanup")
async def trigger_cleanup(body: CleanupRequest, usuario_id: int = Depends(require_user)):
    """Admin exclui posts/artigos do Arquimedes anteriores a uma data."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    result = limpar_posts_arquimedes(body.antes_de)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/config")
async def get_config(usuario_id: int = Depends(require_user)):
    """Admin consulta configuração de frequência do Arquimedes."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    return arquimedes_config


@router.put("/config")
async def update_config(body: ConfigRequest, usuario_id: int = Depends(require_user)):
    """Admin atualiza configuração de frequência do Arquimedes."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    if body.post_interval is not None:
        arquimedes_config["post_interval"] = body.post_interval
    if body.article_interval is not None:
        arquimedes_config["article_interval"] = body.article_interval
    if body.like_interval is not None:
        arquimedes_config["like_interval"] = body.like_interval
    if body.reply_interval is not None:
        arquimedes_config["reply_interval"] = body.reply_interval
    return arquimedes_config


@router.post("/cycle")
async def trigger_cycle(usuario_id: int = Depends(require_user)):
    """Admin dispara ciclo completo (post + curtidas + respostas)."""
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    result = await executar_ciclo_arquimedes()
    return result
