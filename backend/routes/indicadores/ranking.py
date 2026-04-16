# -*- coding: utf-8 -*-
"""
Ranking de Gamificação — APEX pg 21 (Ranking de Usuários)
"""

from fastapi import APIRouter, Depends, Query
from backend.auth.utils import require_user
from backend.services.gamificacao import get_ranking, get_user_xp

router = APIRouter()


@router.get("/ranking")
async def listar_ranking(limit: int = Query(20, ge=1, le=100), usuario_id: int = Depends(require_user)):
    """Ranking de XP. APEX pg 21."""
    ranking = get_ranking(limit)
    return {"items": ranking}


@router.get("/meu-xp")
async def meu_xp(usuario_id: int = Depends(require_user)):
    """XP do usuário logado."""
    return get_user_xp(usuario_id)
