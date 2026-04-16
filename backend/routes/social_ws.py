# -*- coding: utf-8 -*-
"""WebSocket para notificacoes sociais em tempo real."""

import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.auth.utils import authenticate_websocket
from backend.core.config import logger

router = APIRouter()

# Active connections: user_id -> list of WebSocket
_connections: dict[int, list[WebSocket]] = {}


def get_online_user_ids() -> set[int]:
    """Return the set of currently connected user IDs."""
    return set(_connections.keys())


async def notify_user(user_id: int, event_type: str, data: dict = None):
    """Send a real-time event to all connections of a user."""
    sockets = _connections.get(user_id, [])
    if not sockets:
        return
    payload = json.dumps({"type": event_type, "data": data or {}})
    dead = []
    for ws in sockets:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            sockets.remove(ws)
        except ValueError:
            pass


@router.websocket("/ws/social")
async def websocket_social(websocket: WebSocket):
    try:
        usuario_id = await authenticate_websocket(websocket)
    except Exception:
        return

    await websocket.accept()

    if usuario_id not in _connections:
        _connections[usuario_id] = []
    _connections[usuario_id].append(websocket)

    logger.info(f"Social WS conectado | usuario_id={usuario_id}")

    try:
        # Send initial connected event
        await websocket.send_text(json.dumps({"type": "connected", "data": {"user_id": usuario_id}}))

        # Keep alive and handle client events
        while True:
            data = await websocket.receive_text()
            # Client can send ping
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue
            # Handle JSON events from client
            try:
                event = json.loads(data)
                if event.get("type") == "dm_typing":
                    # Forward typing indicator to the other user
                    target_id = event.get("data", {}).get("to_user_id")
                    conv_id = event.get("data", {}).get("conversation_id")
                    if target_id and conv_id:
                        await notify_user(int(target_id), "dm_typing", {
                            "conversation_id": conv_id,
                            "user_id": usuario_id,
                        })
                elif event.get("type") == "comment_typing":
                    payload = event.get("data", {})
                    post_id = payload.get("post_id")
                    if post_id:
                        # Notify post author and other commenters
                        await notify_user(int(payload.get("target_user_id", 0)), "comment_typing", {
                            "post_id": post_id,
                            "user_id": usuario_id,
                            "username": payload.get("username", ""),
                        })
            except (json.JSONDecodeError, ValueError):
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"Social WS error: {e}")
    finally:
        if usuario_id in _connections:
            try:
                _connections[usuario_id].remove(websocket)
            except ValueError:
                pass
            if not _connections[usuario_id]:
                del _connections[usuario_id]
        logger.info(f"Social WS desconectado | usuario_id={usuario_id}")
