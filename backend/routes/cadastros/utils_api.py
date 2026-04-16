# -*- coding: utf-8 -*-
"""
API de funções utilitárias — expõe as functions PL/SQL como endpoints REST.
Usado pelo frontend para avatares, semáforos, progress bars, etc.
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from backend.auth.utils import require_user
from backend.services.sigs_functions import (
    fnc_return_usuario, prc_avatar, prc_profile,
    fnc_semaforo, fnc_semaforo_color, fnc_progress,
    fnc_tar_num, fnc_tar_tmp, fnc_dias_uteis,
    fnc_read_only_tar, fnc_read_only_rq03, fnc_read_only_rq49,
    fnc_calc_xp,
)
from datetime import date

router = APIRouter()


@router.get("/avatar/{user_id}")
async def api_avatar(user_id: int, usuario_id: int = Depends(require_user)):
    """PCK_HGR_GAM.PRC_AVATAR — Avatar data."""
    return prc_avatar(user_id)


@router.get("/profile/{user_id}")
async def api_profile(user_id: int, usuario_id: int = Depends(require_user)):
    """PCK_HGR_GAM.PRC_PROFILE — Full profile with XP."""
    return prc_profile(user_id)


@router.get("/usuario-nome/{user_id}")
async def api_usuario_nome(user_id: int, usuario_id: int = Depends(require_user)):
    """PCK_STH_STM.FNC_RETURN_USUARIO — User display name."""
    return {"name": fnc_return_usuario(user_id)}


@router.get("/semaforo/{meta_id}")
async def api_semaforo(meta_id: int, usuario_id: int = Depends(require_user)):
    """FNC_SEMAFORO + FNC_SEMAFORO_COLOR — KPI traffic light."""
    status = fnc_semaforo(meta_id)
    return {"status": status, "color": fnc_semaforo_color(meta_id)}


@router.get("/progress")
async def api_progress(valor: float = Query(0), usuario_id: int = Depends(require_user)):
    """FNC_PROGRESS — Progress bar data."""
    return fnc_progress(valor)


@router.get("/tarefas-stats")
async def api_tarefas_stats(
    etapa_id: Optional[int] = None,
    projeto_id: Optional[int] = None,
    usuario_id: int = Depends(require_user),
):
    """FNC_TAR_NUM + FNC_TAR_TMP — Task count and time for a stage."""
    return {
        "count": fnc_tar_num(etapa_id, projeto_id),
        "tempo_minutos": fnc_tar_tmp(etapa_id, projeto_id),
    }


@router.get("/dias-uteis")
async def api_dias_uteis(
    dt_inicio: str = Query(...),
    dt_fim: str = Query(...),
    usuario_id: int = Depends(require_user),
):
    """FNC_DIAS_UTEIS — Business days between dates."""
    try:
        d1 = date.fromisoformat(dt_inicio)
        d2 = date.fromisoformat(dt_fim)
        return {"dias_uteis": fnc_dias_uteis(d1, d2)}
    except ValueError:
        return {"dias_uteis": 0, "error": "Invalid date format"}


@router.get("/read-only/tarefa/{id}")
async def api_read_only_tarefa(id: int, usuario_id: int = Depends(require_user)):
    """PCK_STH_TAR.FNC_READ_ONLY_TAR"""
    return {"read_only": fnc_read_only_tar(id)}


@router.get("/read-only/rq03/{id}")
async def api_read_only_rq03(id: int, usuario_id: int = Depends(require_user)):
    """BEG_PCK_APEX.FNC_READ_ONLY_RNC"""
    return {"read_only": fnc_read_only_rq03(id)}


@router.get("/read-only/rq49/{id}")
async def api_read_only_rq49(id: int, usuario_id: int = Depends(require_user)):
    """BEG_PCK_APEX.FNC_READ_ONLY_NO"""
    return {"read_only": fnc_read_only_rq49(id)}
