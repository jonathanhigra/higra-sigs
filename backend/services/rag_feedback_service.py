from __future__ import annotations
# backend/services/rag_feedback_service.py
"""
Registro simples de perguntas sem resposta (fallbacks).
"""

import os
import json
from datetime import datetime
from backend.core.config import logger

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

FALLBACKS_PATH = os.path.join(DATA_DIR, "rag_fallbacks.json")


def _load():
    if not os.path.exists(FALLBACKS_PATH):
        return []
    with open(FALLBACKS_PATH, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return []


def _save(items):
    with open(FALLBACKS_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def registrar_fallback(pergunta: str, categoria: str | None = None):
    items = _load()
    items.append({
        "pergunta": pergunta,
        "categoria": categoria,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })
    _save(items)
    logger.info("[RAG] fallback registrado")


def listar_fallbacks(limit: int = 100):
    items = _load()
    return items[-limit:]


def get_fallback_stats():
    items = _load()
    total = len(items)
    por_categoria = {}
    for it in items:
        cat = it.get("categoria") or "desconhecida"
        por_categoria[cat] = por_categoria.get(cat, 0) + 1
    return {
        "total": total,
        "by_category": por_categoria
    }
