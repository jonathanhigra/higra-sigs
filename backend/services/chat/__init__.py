from __future__ import annotations
import os
from backend.core.config import logger

def _resolve_chat_provider() -> str:
    provider = (os.getenv("CHAT_PROVIDER", "") or "").strip().lower()
    if provider:
        return provider

    n8n_webhook_url = (os.getenv("N8N_CHAT_WEBHOOK_URL", "") or "").strip()
    if n8n_webhook_url:
        return "n8n"

    return "local"


CHAT_PROVIDER = _resolve_chat_provider()

if CHAT_PROVIDER == "n8n":
    from .n8n import chat_higra_expert
else:
    try:
        from .pipeline import chat_higra_expert
    except Exception as exc:
        logger.warning(
            "CHAT_PROVIDER=local, mas stack de IA local indisponivel: %s. "
            "Usando fallback temporario de chat.",
            exc,
        )

        async def chat_higra_expert(
            pergunta: str,
            usuario_id: int,
            conversa_id: int,
            dominio_forcado: str | None = None,
            mensagem_inicial: str | None = None,
        ) -> dict:
            texto = (
                "O chat tecnico com IA local esta temporariamente indisponivel nesta instancia. "
                "O restante da aplicacao permanece operacional."
            )
            return {
                "texto": texto,
                "resposta": texto,
                "tipo": "conceitual",
                "subtype": "conceitual",
                "fontes": [],
                "confianca": 0.2,
                "classificacao": {
                    "tipo": "conceitual",
                    "dominio": "dominio_neutro",
                },
                "usa_rag": False,
                "memoria_tecnica": "",
            }

__all__ = ["chat_higra_expert"]
