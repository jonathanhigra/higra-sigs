# -*- coding: utf-8 -*-
from __future__ import annotations
"""Montagem, formatação e registro de respostas do chat."""

import re
from backend.core.config import logger
from backend.services.historico_chat_service import salvar_historico_chat
from backend.services.memoria_tecnica_service import atualizar_memoria_tecnica
from .constants import FALLBACK
from .validators import _detectar_hipoteses


def formatar_texto_tecnico(texto: str) -> str:
    if not texto:
        return texto

    frases = [f.strip().rstrip(".") + "." for f in texto.split(".") if f.strip()]

    p1 = []
    p2 = []
    p3 = []

    for frase in frases:
        f = frase.lower()
        if any(k in f for k in ["é um equipamento", "é uma bomba", "bomba anfíbia"]):
            p1.append(frase)
        elif any(
            k in f
            for k in [
                "princípio de bombeamento",
                "rotores",
                "fluxo",
                "estágio",
                "montadas em série",
                "montadas em paralelo",
                "sucção",
            ]
        ):
            p2.append(frase)
        elif any(
            k in f
            for k in [
                "anfibismo",
                "consequência",
                "garantindo",
                "excelente",
                "troca térmica",
                "desempenho",
            ]
        ):
            p3.append(frase)
        else:
            p2.append(frase)

    paragrafos = []
    if p1:
        paragrafos.append(" ".join(p1))
    if p2:
        paragrafos.append(" ".join(p2))
    if p3:
        paragrafos.append(" ".join(p3))

    return "\n\n".join(paragrafos)


def extrair_setores_higra(contexto: str) -> str | None:
    texto = contexto.lower()
    setores_oficiais = [
        "captação de água",
        "irrigação",
        "saneamento básico",
        "mineração",
        "indústrias",
    ]
    encontrados = [s for s in setores_oficiais if s in texto]
    if not encontrados:
        return None
    return "A HIGRA atua nos setores de " + ", ".join(encontrados) + "."


def extrair_historia_higra(contexto: str) -> str | None:
    frases_validas = []
    chaves_historia = [
        "fundada",
        "fundação",
        "anos de experiência",
        "experiência acumulada",
        "ramo",
        "segmento de bombeio",
    ]
    for linha in contexto.split("\n"):
        linha = linha.strip()
        if any(c in linha.lower() for c in chaves_historia):
            frases_validas.append(linha)
    if not frases_validas:
        return None
    return " ".join(frases_validas)


def extrair_produto_bomba_anfibia(contexto: str) -> str | None:
    frases_validas = []
    chaves_produto = [
        "bomba anfíbia",
        "bombeamento centrífugo",
        "rotores",
        "fluxo",
        "dentro quanto fora da água",
        "dentro e fora da água",
        "montadas em série",
        "montadas em paralelo",
    ]

    for linha in contexto.split("\n"):
        linha = linha.strip()
        if any(c in linha.lower() for c in chaves_produto):
            frases_validas.append(linha)

    if not frases_validas:
        return None

    texto = " ".join(frases_validas)

    return (
        "A **Bomba Anfíbia da HIGRA** é um equipamento de **bombeamento centrífugo** "
        "projetado para operar **tanto dentro quanto fora da água**. "
        + texto
    )


def _anexar_fontes(resposta: str, fontes: list[dict]) -> str:
    if resposta.strip() == FALLBACK:
        return resposta
    if not fontes:
        return resposta
    linhas = []
    for fonte in fontes:
        source = fonte.get("source") or "desconhecida"
        page = fonte.get("page")
        if page:
            linhas.append(f"- {source} (pag {page})")
        else:
            linhas.append(f"- {source}")
    if not linhas:
        return resposta
    return f"{resposta}\n\nFontes:\n" + "\n".join(linhas)


def _formatar_fontes(fontes: list[dict]) -> list[str]:
    resultado = []
    for fonte in fontes:
        source = fonte.get("source") or "desconhecida"
        page = fonte.get("page")
        if page:
            resultado.append(f"{source} (pag {page})")
        else:
            resultado.append(source)
    return resultado


def _calcular_confianca(usa_rag: bool, contexto_rag: str, tem_hipoteses: bool, erro: bool = False) -> float:
    if erro:
        return 0.2
    score = 0.5
    if usa_rag and contexto_rag:
        score += 0.3
    if tem_hipoteses:
        score -= 0.1
    return round(max(0.1, min(1.0, score)), 2)


def _formatar_resposta_final(texto: str, tipo: str) -> str:
    if not texto:
        return texto

    texto = re.sub(r"\n{3,}", "\n\n", texto)
    texto = texto.strip()

    linhas = texto.split("\n")
    linhas_formatadas = []
    for linha in linhas:
        linha = linha.strip()
        if not linha:
            linhas_formatadas.append("")
            continue

        if re.match(r"^(\d+[\.\)]\s)", linha):
            linhas_formatadas.append(linha)
        elif re.match(r"^[-•]\s", linha):
            linhas_formatadas.append(linha)
        elif re.match(r"^(#{1,3}\s)", linha):
            linhas_formatadas.append(linha)
        else:
            linhas_formatadas.append(linha)

    return "\n".join(linhas_formatadas)


def _montar_resposta(texto: str, classificacao: dict, fontes: list[dict], contexto_rag: str, erro: bool = False, memoria_tecnica: str = "") -> dict:
    tipo = classificacao.get("tipo", "conceitual")
    texto_formatado = _formatar_resposta_final(texto, tipo)

    usa_rag = classificacao.get("usa_rag", False)
    tem_hipoteses = _detectar_hipoteses(texto)
    confianca = _calcular_confianca(usa_rag, contexto_rag, tem_hipoteses, erro)
    fontes_formatadas = _formatar_fontes(fontes)

    return {
        "type": "resposta",
        "subtype": tipo,
        "resposta": texto_formatado,
        "fontes": fontes_formatadas,
        "confianca": confianca,
        "classificacao": classificacao,
        "usa_rag": usa_rag,
        "memoria_tecnica": memoria_tecnica,
    }


def _registrar_e_retornar_resposta(
    usuario_id: int,
    conversa_id: int,
    pergunta: str,
    resposta: str,
    classificacao: dict,
    fontes: list[dict],
    contexto_rag: str,
    erro: bool,
    memoria_tecnica: str,
    dominio_ativo: str,
    mensagem_inicial: str | None,
) -> dict:
    resultado = _montar_resposta(resposta, classificacao, fontes, contexto_rag, erro, memoria_tecnica)

    try:
        salvar_historico_chat(usuario_id, conversa_id, pergunta, resultado["resposta"])
    except Exception as e:
        logger.error(f"[CHAT] Erro ao salvar historico: {e}")

    try:
        atualizar_memoria_tecnica(
            usuario_id=usuario_id,
            conversa_id=conversa_id,
            dominio=dominio_ativo,
            pergunta=pergunta,
            resposta=resultado["resposta"],
        )
    except Exception as e:
        logger.error(f"[CHAT] Erro ao atualizar memoria tecnica: {e}")

    return resultado
