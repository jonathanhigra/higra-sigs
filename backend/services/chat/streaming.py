# -*- coding: utf-8 -*-
"""Streaming de respostas via Claude API."""

from __future__ import annotations

import re

from backend.core.config import logger
from backend.core.claude_client import gerar_resposta_claude_stream, comprimir_contexto
from backend.services.classificador_pergunta import classificar_pergunta
from backend.services.memoria_tecnica_service import obter_memoria_tecnica
from backend.services.historico_chat_service import (
    salvar_historico_chat,
    obter_historico_chat,
)
from backend.services.memoria_tecnica_service import atualizar_memoria_tecnica

from .prompts import montar_system_prompt
from .validators import (
    normalizar_texto,
    _detectar_conceito_ancora,
    detectar_categoria,
)
from .constants import ANCHOR_CONCEPTS

_RAG_IMPORT_WARNED = False
_FEED_RAG_IMPORT_WARNED = False

# Limites de contexto (em caracteres) para evitar exceder budget de tokens
MAX_HISTORICO_CHARS = 6000
MAX_MEMORIA_CHARS = 3000
MAX_CONTEXTO_RAG_CHARS = 4000

# Padrões para detecção de saudação (mais inteligente que match exato)
_SAUDACAO_PATTERNS = re.compile(
    r"^(oi|ol[aá]|hey|eae?|e a[ií]|fala|salve|"
    r"bom dia|boa tarde|boa noite|"
    r"oi tudo bem|ol[aá] tudo bem|oi como vai|"
    r"oi boa tarde|oi bom dia|oi boa noite)"
    r"[!?.,\s]*$",
    re.IGNORECASE,
)


def _is_saudacao(texto: str) -> bool:
    """Detecção inteligente de saudação — aceita variações naturais."""
    texto_limpo = texto.strip().rstrip("!?.,:;")
    if len(texto_limpo.split()) > 6:
        return False
    return bool(_SAUDACAO_PATTERNS.match(texto_limpo))


def _trim_text(text: str, max_chars: int) -> str:
    """Corta texto no limite de caracteres preservando palavras completas."""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0]
    return cut + "\n[...truncado]"


def _buscar_contexto_relevante_safe(pergunta: str, k: int = 5, metadata_filter: dict | None = None):
    """Consulta RAG de forma segura em runtime.

    Em deploy degradado (sem stack local de IA), evita falha de import no startup.
    """
    global _RAG_IMPORT_WARNED
    try:
        from backend.services.rag_pipeline import buscar_contexto_relevante_com_fontes
    except Exception as e:
        if not _RAG_IMPORT_WARNED:
            logger.warning("[STREAM] RAG indisponivel no ambiente atual: %s", e)
            _RAG_IMPORT_WARNED = True
        return "", []

    try:
        return buscar_contexto_relevante_com_fontes(pergunta, k=k, metadata_filter=metadata_filter)
    except Exception as e:
        logger.warning("[STREAM] Falha ao consultar RAG: %s", e)
        return "", []


def _buscar_artigos_comunidade_safe(pergunta: str, k: int = 2):
    """Busca artigos do feed sem quebrar o chat se RAG local estiver ausente."""
    global _FEED_RAG_IMPORT_WARNED
    try:
        from backend.services.feed_rag_service import buscar_artigos_comunidade
    except Exception as e:
        if not _FEED_RAG_IMPORT_WARNED:
            logger.warning("[STREAM] Feed RAG indisponivel no ambiente atual: %s", e)
            _FEED_RAG_IMPORT_WARNED = True
        return "", []

    try:
        return buscar_artigos_comunidade(pergunta, k=k)
    except Exception as e:
        logger.warning("[STREAM] Falha ao consultar artigos da comunidade: %s", e)
        return "", []


async def chat_higra_expert_stream(
    pergunta: str,
    usuario_id: int,
    conversa_id: int,
    dominio_forcado: str | None = None,
    mensagem_inicial: str | None = None,
    result_meta: dict | None = None,
    fonte_filter: str | None = None,
):
    """
    Async generator que yield chunks de texto conforme Claude gera.
    Para respostas determinísticas (seletor, NPSH, perda de carga), yield o texto completo de uma vez.
    """
    pergunta_norm = normalizar_texto(pergunta.lower().strip())
    classificacao = classificar_pergunta(pergunta, dominio_forcado)

    tipo = classificacao.get("tipo", "conceitual")
    dominio_ativo = classificacao.get("dominio") or "dominio_neutro"

    # Saudações — detecção inteligente
    if _is_saudacao(pergunta_norm):
        resposta = (
            "Olá! Sou o **Arquimedes**, engenheiro virtual da HIGRA. "
            "Posso ajudar com:\n\n"
            "- **Diagnóstico** — problemas em sistemas hidráulicos\n"
            "- **Aeração e geração de energia** — turbinas e aeradores\n\n"
            "Como posso ajudar?"
        )
        _salvar_conversa(usuario_id, conversa_id, pergunta, resposta, dominio_ativo, mensagem_inicial)
        yield resposta
        return

    # Memória técnica (com trimming)
    memoria_tecnica = ""
    if conversa_id:
        try:
            memoria_tecnica = obter_memoria_tecnica(usuario_id, conversa_id, dominio_ativo)
            if memoria_tecnica:
                memoria_tecnica = _trim_text(memoria_tecnica, MAX_MEMORIA_CHARS)
        except Exception:
            pass

    # Histórico (com limite de tamanho)
    historico = []
    if conversa_id:
        try:
            mensagens = obter_historico_chat(usuario_id, conversa_id, limite=10)
            total_chars = 0
            for msg in mensagens:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content.strip():
                    msg_len = len(content)
                    if total_chars + msg_len > MAX_HISTORICO_CHARS:
                        # Trim last message to fit
                        remaining = MAX_HISTORICO_CHARS - total_chars
                        if remaining > 100:
                            historico.append({"role": role, "content": _trim_text(content, remaining)})
                        break
                    historico.append({"role": role, "content": content})
                    total_chars += msg_len
        except Exception:
            pass

    # RAG — busca nos manuais técnicos HIGRA
    contexto_rag = ""
    fontes_rag = []
    if classificacao.get("usa_rag"):
        # Build metadata filter
        meta_filter = {}
        if fonte_filter:
            meta_filter["source"] = fonte_filter
        else:
            categoria = detectar_categoria(pergunta_norm)
            if categoria:
                meta_filter["category"] = categoria

        contexto_rag, fontes_rag = _buscar_contexto_relevante_safe(
            pergunta, k=6, metadata_filter=meta_filter if meta_filter else None
        )

    # Buscar artigos da comunidade (feed) como contexto complementar
    contexto_comunidade = ""
    fontes_comunidade = []
    if classificacao.get("usa_rag"):
        try:
            contexto_comunidade, fontes_comunidade = _buscar_artigos_comunidade_safe(pergunta, k=2)
        except Exception:
            pass

    if contexto_comunidade:
        contexto_rag = f"{contexto_rag}\n\n## Artigos da comunidade HIGRA\n{contexto_comunidade}" if contexto_rag else contexto_comunidade
        fontes_rag = fontes_rag + fontes_comunidade

    # Contextual compression: extract only relevant parts to reduce tokens
    if contexto_rag and len(contexto_rag) > 1500:
        try:
            contexto_rag = comprimir_contexto(pergunta, contexto_rag)
        except Exception:
            pass

    # Enforce max RAG context size
    if contexto_rag and len(contexto_rag) > MAX_CONTEXTO_RAG_CHARS:
        contexto_rag = _trim_text(contexto_rag, MAX_CONTEXTO_RAG_CHARS)

    # RAG quality assessment
    rag_quality = "good"
    if classificacao.get("usa_rag"):
        if not fontes_rag:
            rag_quality = "none"
        elif all(f.get("score", 0) < 0.45 for f in fontes_rag):
            rag_quality = "low"

    # Exportar fontes RAG para o caller
    if result_meta is not None:
        if fontes_rag:
            result_meta["fontes"] = fontes_rag
        result_meta["rag_quality"] = rag_quality

    # Conceito âncora
    conceito_chave = _detectar_conceito_ancora(pergunta_norm) if tipo == "conceitual" else None
    conceito = ANCHOR_CONCEPTS.get(conceito_chave) if conceito_chave else None

    # Montar system prompt
    system = montar_system_prompt(tipo, dominio_ativo, memoria_tecnica, contexto_rag)

    # Inject quality caveat if RAG results are poor
    if rag_quality == "none":
        system += (
            "\n\n**AVISO INTERNO**: Nenhum documento relevante foi encontrado na base de conhecimento. "
            "Responda com base no seu conhecimento geral, mas avise o usuário que a resposta "
            "não é baseada em documentação técnica HIGRA específica."
        )
    elif rag_quality == "low":
        system += (
            "\n\n**AVISO INTERNO**: Os documentos encontrados têm baixa relevância para esta pergunta. "
            "Use-os com cautela e indique ao usuário que a resposta pode ser parcial."
        )

    user_msg = pergunta
    if conceito and conceito.get("definicao"):
        user_msg = f"[Definição técnica de referência: {conceito['definicao']}]\n\n{pergunta}"

    # Stream via Claude
    full_text = ""
    try:
        for chunk in gerar_resposta_claude_stream(
            system_prompt=system,
            user_message=user_msg,
            historico=historico,
            max_tokens=2048,
            temperature=0.3,
        ):
            if chunk:
                full_text += chunk
                yield chunk
    except Exception as e:
        logger.exception(f"[STREAM] Erro: {e}")
        if not full_text:
            full_text = "Desculpe, ocorreu um erro ao gerar a resposta. Tente novamente."
            yield full_text

    # Salvar no histórico após streaming completo
    _salvar_conversa(usuario_id, conversa_id, pergunta, full_text, dominio_ativo, mensagem_inicial)


def _salvar_conversa(usuario_id, conversa_id, pergunta, resposta, dominio_ativo, mensagem_inicial):
    """Salva pergunta e resposta no histórico."""
    try:
        salvar_historico_chat(usuario_id, conversa_id, pergunta, resposta)
    except Exception as e:
        logger.error(f"[STREAM] Erro ao salvar histórico: {e}")

    try:
        atualizar_memoria_tecnica(
            usuario_id=usuario_id,
            conversa_id=conversa_id,
            dominio=dominio_ativo,
            pergunta=pergunta,
            resposta=resposta,
        )
    except Exception as e:
        logger.error(f"[STREAM] Erro ao atualizar memória técnica: {e}")
