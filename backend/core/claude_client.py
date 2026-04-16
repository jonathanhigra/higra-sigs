# -*- coding: utf-8 -*-
"""Cliente Claude API para o Nexus."""

from __future__ import annotations

from backend.core.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, logger

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

_client = None
AnthropicAPIError = anthropic.APIError if anthropic is not None else Exception
CLAUDE_UNAVAILABLE_MESSAGE = (
    "O servico de IA via Claude esta temporariamente indisponivel. "
    "Tente novamente em instantes."
)


def get_claude_client():
    global _client
    if anthropic is None:
        raise RuntimeError("Pacote 'anthropic' nao instalado no ambiente Python.")
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY nao configurada no ambiente.")
    if _client is None:
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        logger.info(f"[CLAUDE] Client inicializado | modelo={CLAUDE_MODEL}")
    return _client


def gerar_resposta_claude(
    system_prompt: str,
    user_message: str,
    historico: list[dict] | None = None,
    max_tokens: int = 2048,
    temperature: float = 0.3,
) -> str:
    """
    Gera resposta via Claude API.

    Args:
        system_prompt: System prompt com instruções do especialista.
        user_message: Pergunta do usuário.
        historico: Lista de mensagens anteriores [{"role": "user"/"assistant", "content": "..."}]
        max_tokens: Máximo de tokens na resposta.
        temperature: Temperatura de geração (0.0 = determinístico, 1.0 = criativo).

    Returns:
        Texto da resposta em português.
    """
    try:
        client = get_claude_client()
    except RuntimeError as e:
        logger.warning(f"[CLAUDE] {e}")
        return CLAUDE_UNAVAILABLE_MESSAGE

    messages = []
    if historico:
        messages.extend(historico)
    messages.append({"role": "user", "content": user_message})

    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=messages,
        )
        texto = response.content[0].text
        logger.info(
            "[CLAUDE] Resposta gerada | tokens_in=%d tokens_out=%d",
            response.usage.input_tokens,
            response.usage.output_tokens,
        )
        return texto.strip()
    except AnthropicAPIError as e:
        logger.error(f"[CLAUDE] Erro na API: {e}")
        return ""
    except Exception as e:
        logger.exception(f"[CLAUDE] Erro inesperado: {e}")
        return ""


def comprimir_contexto(query: str, context: str, max_tokens: int = 800) -> str:
    """Contextual compression: extract only query-relevant parts from RAG context.

    Uses a fast, cheap model call to filter out irrelevant content.
    """
    if not context or len(context) < 500:
        return context
    try:
        client = get_claude_client()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=max_tokens,
            temperature=0.0,
            system=(
                "Você é um filtro de contexto. Extraia APENAS os trechos do contexto "
                "que são diretamente relevantes para responder a pergunta. "
                "Mantenha o texto original sem modificar. Omita trechos irrelevantes. "
                "Se nada for relevante, retorne vazio."
            ),
            messages=[{
                "role": "user",
                "content": f"Pergunta: {query}\n\nContexto:\n{context}",
            }],
        )
        compressed = response.content[0].text.strip()
        if compressed:
            logger.info(
                f"[COMPRESSION] {len(context)} → {len(compressed)} chars "
                f"({100 - len(compressed)*100//len(context)}% redução)"
            )
            return compressed
    except Exception as e:
        logger.warning(f"[COMPRESSION] Falha, usando contexto original: {e}")
    return context


def gerar_resposta_claude_stream(
    system_prompt: str,
    user_message: str,
    historico: list[dict] | None = None,
    max_tokens: int = 2048,
    temperature: float = 0.3,
):
    """
    Gera resposta via Claude API com streaming.
    Yields chunks de texto conforme são gerados.
    """
    try:
        client = get_claude_client()
    except RuntimeError as e:
        logger.warning(f"[CLAUDE] {e}")
        yield CLAUDE_UNAVAILABLE_MESSAGE
        return

    messages = []
    if historico:
        messages.extend(historico)
    messages.append({"role": "user", "content": user_message})

    try:
        with client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text
    except AnthropicAPIError as e:
        logger.error(f"[CLAUDE] Erro na API (stream): {e}")
        yield ""
    except Exception as e:
        logger.exception(f"[CLAUDE] Erro inesperado (stream): {e}")
        yield ""
