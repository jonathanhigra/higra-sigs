# -*- coding: utf-8 -*-
"""WebSocket do Chat HIGRA Sigs — streaming via Claude API."""

from __future__ import annotations

import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.auth.utils import authenticate_websocket
from backend.services.chat.streaming import chat_higra_expert_stream
from backend.services.classificador_pergunta import classificar_pergunta
from backend.services.memoria_tecnica_service import mensagem_inicial_por_dominio
from backend.services.historico_chat_service import salvar_mensagem_sistema
from backend.services.historico_conversas_service import (
    criar_conversa,
    conversa_existe,
    obter_titulo,
    atualizar_titulo,
)
from backend.core.config import logger

router = APIRouter()

# Timeout para streaming (segundos)
STREAM_TIMEOUT = 60


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    logger.info("Cliente tentando conectar ao WebSocket do Chat...")

    try:
        usuario_id = await authenticate_websocket(websocket)
    except Exception as e:
        logger.warning(f"WebSocket rejeitado: {e}")
        return

    await websocket.accept()
    logger.info(f"WebSocket conectado | usuario_id={usuario_id}")
    current_conversa_id = None
    last_message_ts = 0
    stop_event = asyncio.Event()

    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"Mensagem recebida: {data}")

            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "erro",
                    "mensagem": "JSON inválido. Use: {\"mensagem\": \"sua pergunta\"}"
                }, ensure_ascii=False))
                continue

            # Handle stop signal
            if payload.get("type") == "stop":
                logger.info("[WS] Stop signal recebido")
                stop_event.set()
                continue

            pergunta = payload.get("mensagem", "").strip()
            conversa_id = payload.get("conversa_id")
            dominio_forcado = payload.get("dominio")
            fonte_filter = payload.get("fonte_filter")

            if not pergunta:
                continue

            now = int(time.time() * 1000)
            if now - last_message_ts < 300:
                await websocket.send_text(json.dumps({
                    "type": "erro",
                    "mensagem": "Aguarde um momento antes de enviar outra mensagem."
                }, ensure_ascii=False))
                continue
            last_message_ts = now

            try:
                conversa_id = int(conversa_id) if conversa_id is not None else None
            except (TypeError, ValueError):
                conversa_id = None

            conversa_criada = False
            if conversa_id and not conversa_existe(conversa_id, usuario_id):
                conversa_id = None

            if not conversa_id:
                titulo = pergunta[:80].strip()
                conversa_id = criar_conversa(usuario_id, titulo if titulo else None)
                conversa_criada = True
            else:
                titulo_atual = obter_titulo(conversa_id)
                if titulo_atual == "Nova conversa":
                    novo_titulo = pergunta[:80].strip()
                    if novo_titulo:
                        atualizar_titulo(conversa_id, novo_titulo)

            current_conversa_id = conversa_id

            mensagem_inicial = None
            dominio_ativo = dominio_forcado
            if not dominio_ativo:
                dominio_ativo = classificar_pergunta(pergunta).get("dominio") or "dominio_neutro"

            if conversa_criada:
                mensagem_inicial = mensagem_inicial_por_dominio(dominio_ativo)
                salvar_mensagem_sistema(usuario_id, conversa_id, mensagem_inicial)
                await websocket.send_text(json.dumps({
                    "type": "conversa",
                    "conversa_id": conversa_id,
                    "mensagem_inicial": mensagem_inicial,
                    "dominio": dominio_ativo
                }, ensure_ascii=False))

            # Reset stop event before starting new stream
            stop_event.clear()

            await _handle_streaming(
                websocket, pergunta, usuario_id, conversa_id,
                dominio_forcado, mensagem_inicial, fonte_filter,
                stop_event=stop_event,
            )

    except WebSocketDisconnect:
        logger.info(f"Cliente desconectado | usuario_id={usuario_id}")
    except Exception as e:
        logger.exception(f"Erro no WebSocket: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


async def _handle_streaming(
    websocket, pergunta, usuario_id, conversa_id,
    dominio_forcado, mensagem_inicial, fonte_filter=None,
    stop_event=None,
):
    """Envia resposta em streaming (chunk por chunk) via WebSocket."""
    await websocket.send_text(json.dumps({
        "type": "stream_start",
        "conversa_id": conversa_id,
    }, ensure_ascii=False))

    full_text = ""
    result_meta = {}
    stopped = False
    timed_out = False

    try:
        stream = chat_higra_expert_stream(
            pergunta, usuario_id, conversa_id, dominio_forcado, mensagem_inicial,
            result_meta=result_meta, fonte_filter=fonte_filter,
        )

        start_time = time.monotonic()
        async for chunk in stream:
            # Check stop signal
            if stop_event and stop_event.is_set():
                logger.info("[STREAM] Parando stream por solicitação do cliente")
                stopped = True
                break

            # Check timeout
            if time.monotonic() - start_time > STREAM_TIMEOUT:
                logger.warning(f"[STREAM] Timeout de {STREAM_TIMEOUT}s atingido")
                timed_out = True
                break

            if chunk:
                full_text += chunk
                await websocket.send_text(json.dumps({
                    "type": "stream_chunk",
                    "texto": chunk,
                    "conversa_id": conversa_id,
                }, ensure_ascii=False))

    except Exception as e:
        logger.exception(f"[STREAM] Erro durante streaming: {e}")

    if timed_out:
        full_text += "\n\n*[Resposta interrompida por timeout]*"
        await websocket.send_text(json.dumps({
            "type": "stream_chunk",
            "texto": "\n\n*[Resposta interrompida por timeout]*",
            "conversa_id": conversa_id,
        }, ensure_ascii=False))

    fontes = result_meta.get("fontes", [])
    rag_quality = result_meta.get("rag_quality", "good")

    end_payload = {
        "type": "stream_end",
        "conversa_id": conversa_id,
        "fontes": fontes,
        "rag_quality": rag_quality,
        "conteudo": {
            "type": "resposta",
            "resposta": full_text,
            "confianca": 0.8,
        },
    }

    await websocket.send_text(json.dumps(end_payload, ensure_ascii=False, default=str))
