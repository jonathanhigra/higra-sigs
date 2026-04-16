# -*- coding: utf-8 -*-
from __future__ import annotations
"""Pipeline principal do chat — orquestrador."""

import math
from backend.core.config import logger

from backend.services.classificador_pergunta import classificar_pergunta
from backend.services.memoria_tecnica_service import obter_memoria_tecnica
from backend.services.rag_pipeline import (
    buscar_contexto_relevante_com_fontes,
    buscar_contexto_por_categoria,
)
from backend.services.rag_feedback_service import registrar_fallback
from backend.services.feed_rag_service import buscar_artigos_comunidade
from backend.services.historico_chat_service import obter_historico_chat

from .constants import FALLBACK, ANCHOR_CONCEPTS
from .prompts import gerar_resposta
from .validators import (
    normalizar_texto,
    _decidir_proxima_acao,
    _detectar_conceito_ancora,
    detectar_categoria,
)
from .response import (
    formatar_texto_tecnico,
    extrair_setores_higra,
    extrair_historia_higra,
    extrair_produto_bomba_anfibia,
    _anexar_fontes,
    _registrar_e_retornar_resposta,
)


def _carregar_historico_conversa(conversa_id: int, usuario_id: int) -> list[dict]:
    """Carrega últimas mensagens da conversa para injetar como contexto."""
    if not conversa_id:
        return []
    try:
        mensagens = obter_historico_chat(usuario_id, conversa_id, limite=10)
        historico = []
        for msg in mensagens:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content.strip():
                historico.append({"role": role, "content": content})
        return historico
    except Exception as e:
        logger.warning(f"[CHAT] Falha ao carregar histórico: {e}")
        return []


async def chat_higra_expert(
    pergunta: str,
    usuario_id: int,
    conversa_id: int,
    dominio_forcado: str | None = None,
    mensagem_inicial: str | None = None,
) -> dict:
    logger.info("=" * 70)
    logger.info(f"[CHAT] Pergunta recebida: {pergunta}")

    pergunta_lower = pergunta.lower().strip()
    pergunta_norm = normalizar_texto(pergunta_lower)
    classificacao = classificar_pergunta(pergunta, dominio_forcado)
    logger.info(f"[CHAT] Classificacao: {classificacao}")
    acao_agente = _decidir_proxima_acao(classificacao.get("subtipo"), classificacao.get("tipo"))
    logger.info(f"[AGENTE] Proxima acao decidida: {acao_agente}")

    dominio_ativo = classificacao.get("dominio") or "dominio_neutro"

    # --- Memória técnica ---
    memoria_tecnica = ""
    if conversa_id:
        memoria_tecnica = obter_memoria_tecnica(usuario_id, conversa_id, dominio_ativo)
        if memoria_tecnica:
            logger.info(f"[CHAT] Memoria tecnica carregada | linhas={len(memoria_tecnica.splitlines())}")

    # --- Histórico da conversa ---
    historico = _carregar_historico_conversa(conversa_id, usuario_id)

    # --- Saudações ---
    if pergunta_norm in ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"]:
        resposta = (
            "Olá! Sou o **Arquimedes**, engenheiro virtual da HIGRA. "
            "Posso ajudar com:\n\n"
            "- **Diagnóstico** — problemas em sistemas hidráulicos\n"
            "- **Aeração e geração de energia** — turbinas e aeradores\n\n"
            "Como posso ajudar?"
        )
        return _registrar_e_retornar_resposta(
            usuario_id, conversa_id, pergunta, resposta, classificacao,
            [], "", False, memoria_tecnica, dominio_ativo, mensagem_inicial,
        )

    # --- RAG ---
    categoria = detectar_categoria(pergunta_norm)
    contexto_rag = ""
    fontes = []
    if classificacao.get("usa_rag"):
        logger.info(f"[CHAT] RAG habilitado | tipo={classificacao.get('tipo')} | categoria={categoria}")
        if categoria:
            contexto_rag, fontes = buscar_contexto_relevante_com_fontes(
                pergunta, k=5, metadata_filter={"category": categoria}
            )
        else:
            contexto_rag, fontes = buscar_contexto_relevante_com_fontes(pergunta, k=5)
        if not contexto_rag or not contexto_rag.strip():
            logger.info("[CHAT] RAG vazio -> fallback tecnico")
            registrar_fallback(pergunta, categoria)

        # Complementar com artigos da comunidade
        try:
            ctx_comunidade, fontes_comunidade = buscar_artigos_comunidade(pergunta, k=2)
            if ctx_comunidade:
                contexto_rag = f"{contexto_rag}\n\n## Artigos da comunidade HIGRA\n{ctx_comunidade}" if contexto_rag else ctx_comunidade
                fontes = fontes + fontes_comunidade
        except Exception:
            pass
    else:
        logger.info(f"[CHAT] RAG desativado | tipo={classificacao.get('tipo')}")

    # --- Roteamento factual (sem LLM) ---
    if "setor" in pergunta_norm:
        resposta = extrair_setores_higra(contexto_rag)
        if resposta:
            texto = _anexar_fontes(resposta, fontes)
            return _registrar_e_retornar_resposta(
                usuario_id, conversa_id, pergunta, texto, classificacao,
                fontes, contexto_rag, False, memoria_tecnica, dominio_ativo, mensagem_inicial,
            )

    if "historia" in pergunta_norm or "história" in pergunta_norm:
        resposta = extrair_historia_higra(contexto_rag)
        if resposta:
            texto = _anexar_fontes(resposta, fontes)
            return _registrar_e_retornar_resposta(
                usuario_id, conversa_id, pergunta, texto, classificacao,
                fontes, contexto_rag, False, memoria_tecnica, dominio_ativo, mensagem_inicial,
            )

    if "bomba anfibia" in pergunta_norm or "bomba anfíbia" in pergunta_norm:
        contexto_produto = buscar_contexto_por_categoria("produto_descricao")
        conteudo = extrair_produto_bomba_anfibia(contexto_produto)
        if conteudo:
            resposta = formatar_texto_tecnico(conteudo)
            texto = _anexar_fontes(resposta, fontes)
            return _registrar_e_retornar_resposta(
                usuario_id, conversa_id, pergunta, texto, classificacao,
                fontes, contexto_rag, False, memoria_tecnica, dominio_ativo, mensagem_inicial,
            )

    # --- Geração LLM (Claude API) ---
    tipo = classificacao.get("tipo", "conceitual")
    conceito_chave = _detectar_conceito_ancora(pergunta_norm) if tipo == "conceitual" else None
    conceito = ANCHOR_CONCEPTS.get(conceito_chave) if conceito_chave else None

    try:
        resposta = gerar_resposta(
            pergunta=pergunta,
            tipo=tipo,
            dominio=dominio_ativo,
            memoria_tecnica=memoria_tecnica,
            contexto_rag=contexto_rag if classificacao.get("usa_rag") else "",
            historico=historico,
            conceito=conceito,
        )

        if not resposta or len(resposta) < 10:
            resposta = FALLBACK

    except Exception as e:
        logger.exception("[CHAT] Erro inesperado ao gerar resposta")
        resposta = FALLBACK

    return _registrar_e_retornar_resposta(
        usuario_id, conversa_id, pergunta, resposta, classificacao,
        fontes, contexto_rag, resposta == FALLBACK, memoria_tecnica, dominio_ativo, mensagem_inicial,
    )


