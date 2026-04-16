# -*- coding: utf-8 -*-
from __future__ import annotations
"""Adapter de chat para fluxo externo no n8n."""

import os
from typing import Any

import httpx

from backend.core.config import logger
from backend.services.classificador_pergunta import classificar_pergunta
from backend.services.historico_chat_service import salvar_historico_chat
from backend.services.memoria_tecnica_service import atualizar_memoria_tecnica


def _extract_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload.strip()

    if isinstance(payload, list):
        if not payload:
            return ""
        first = payload[0]
        if isinstance(first, dict) and "json" in first:
            return _extract_text(first.get("json"))
        return _extract_text(first)

    if isinstance(payload, dict):
        for key in ("texto", "resposta", "answer", "message", "content", "output"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        if isinstance(payload.get("data"), (dict, list, str)):
            return _extract_text(payload.get("data"))
        if isinstance(payload.get("result"), (dict, list, str)):
            return _extract_text(payload.get("result"))

    return ""


def _extract_sources(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []

    raw = payload.get("fontes") or payload.get("sources") or []
    if isinstance(raw, list):
        normalized = []
        for item in raw:
            if isinstance(item, str) and item.strip():
                normalized.append(item.strip())
            elif isinstance(item, dict):
                src = item.get("source") or item.get("nome") or item.get("title")
                page = item.get("page")
                if src and page:
                    normalized.append(f"{src} (pag {page})")
                elif src:
                    normalized.append(str(src))
        return normalized

    return []


def _extract_confidence(payload: Any) -> float:
    if not isinstance(payload, dict):
        return 0.7

    conf = payload.get("confianca")
    try:
        if conf is not None:
            conf_float = float(conf)
            return max(0.1, min(1.0, conf_float))
    except Exception:
        pass
    return 0.7


async def chat_higra_expert(
    pergunta: str,
    usuario_id: int,
    conversa_id: int,
    dominio_forcado: str | None = None,
    mensagem_inicial: str | None = None,
) -> dict:
    webhook_url = os.getenv("N8N_CHAT_WEBHOOK_URL", "").strip()
    bearer_token = os.getenv("N8N_CHAT_BEARER_TOKEN", "").strip()
    timeout_s = float(os.getenv("N8N_CHAT_TIMEOUT_SECONDS", "60"))

    classificacao = classificar_pergunta(pergunta, dominio_forcado)
    dominio_ativo = classificacao.get("dominio") or "dominio_neutro"

    if not webhook_url:
        texto = "Fluxo n8n nao configurado. Defina N8N_CHAT_WEBHOOK_URL no backend/.env."
        return {
            "texto": texto,
            "resposta": texto,
            "tipo": classificacao.get("tipo", "conceitual"),
            "subtype": classificacao.get("tipo", "conceitual"),
            "fontes": [],
            "confianca": 0.2,
            "classificacao": classificacao,
            "usa_rag": False,
            "memoria_tecnica": "",
        }

    payload = {
        "mensagem": pergunta,
        "pergunta": pergunta,
        "usuario_id": usuario_id,
        "conversa_id": conversa_id,
        "dominio": dominio_ativo,
        "classificacao": classificacao,
        "mensagem_inicial": mensagem_inicial,
    }

    headers = {"Content-Type": "application/json"}
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.post(webhook_url, json=payload, headers=headers)
            response.raise_for_status()
            try:
                body: Any = response.json()
            except ValueError:
                body = response.text
    except Exception as exc:
        logger.exception(f"[CHAT][N8N] Falha ao consultar webhook: {exc}")
        texto = "Nao foi possivel consultar o fluxo externo no momento. Tente novamente em instantes."
        return {
            "texto": texto,
            "resposta": texto,
            "tipo": classificacao.get("tipo", "conceitual"),
            "subtype": classificacao.get("tipo", "conceitual"),
            "fontes": [],
            "confianca": 0.2,
            "classificacao": classificacao,
            "usa_rag": False,
            "memoria_tecnica": "",
        }

    texto = _extract_text(body)
    if not texto:
        texto = "Fluxo n8n respondeu sem texto utilizavel."

    fontes = _extract_sources(body)
    confianca = _extract_confidence(body)

    try:
        salvar_historico_chat(usuario_id, conversa_id, pergunta, texto)
    except Exception as exc:
        logger.error(f"[CHAT][N8N] Falha ao salvar historico: {exc}")

    try:
        atualizar_memoria_tecnica(
            usuario_id=usuario_id,
            conversa_id=conversa_id,
            dominio=dominio_ativo,
            linha_inicial=mensagem_inicial,
        )
    except Exception as exc:
        logger.error(f"[CHAT][N8N] Falha ao atualizar memoria tecnica: {exc}")

    return {
        "texto": texto,
        "resposta": texto,
        "tipo": classificacao.get("tipo", "conceitual"),
        "subtype": classificacao.get("tipo", "conceitual"),
        "fontes": fontes,
        "confianca": confianca,
        "classificacao": classificacao,
        "usa_rag": False,
        "memoria_tecnica": "",
    }
