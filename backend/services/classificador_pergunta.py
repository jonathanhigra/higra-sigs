# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Classificador simples de perguntas (sem LLM).
Retorna tipo, uso de RAG, nível técnico e motivo para debug.
"""

import re
from backend.core.config import logger


def _normalizar(texto: str) -> str:
    if not texto:
        return ""
    return texto.casefold()


def classificar_pergunta(pergunta: str, dominio_forcado: str | None = None) -> dict:
    texto = pergunta or ""
    texto_norm = _normalizar(texto)

    has_numbers = bool(re.search(r"\d", texto_norm))

    kws_conceitual = [
        "o que e", "o que é", "o que eh", "defina", "conceito", "princípio", "principio",
        "como funciona", "para que serve", "diferença", "diferenca", "diferença entre", "diferenca entre",
    ]
    kws_catalogo = [
        "catalogo", "catálogo", "modelo", "linha", "curva", "curvas", "tabela",
        "especificacao", "especificação", "dimensao", "dimensão", "diametro", "diâmetro",
        "pressao", "pressão", "vazao", "vazão", "altura", "npsh", "rotor",
        "potencia", "potência", "rpm", "rendimento", "m3/h", "mca", "mm",
        "polegada", "serie", "série", "paralelo",
    ]
    kws_diagnostico = [
        "erro", "falha", "problema", "nao funciona", "não funciona", "nao liga", "não liga",
        "vibrando", "vibracao", "vibração", "ruido", "ruído", "aquec", "aquecimento",
        "vazamento", "cavitacao", "cavitação", "pressao baixa", "pressão baixa",
        "perda", "entup", "entupimento", "trava",
        "menor que o esperado", "baixa vazao", "baixa vazão", "vazao menor", "vazão menor",
        "o que pode ser", "o que esta acontecendo", "o que está acontecendo",
        "esta", "está", "ficou", "parou",
    ]
    kws_diagnostico_contexto = [
        "minha", "meu", "esta com", "está com", "estou com", "apresenta",
        "ocorrendo", "sofre", "sintoma", "anomalia",
    ]
    kws_calculo = [
        "calcule", "calcular", "dimensionar", "estim", "quanto",
        "qual a perda", "perda de carga", "npsh", "vazao", "vazão",
        "altura", "mca", "m3/h", "kpa", "bar", "diametro", "diâmetro",
    ]
    kws_procedimento = [
        "como instalar", "como montar", "passo a passo", "procedimento",
        "manual", "configurar", "ajustar", "setup", "comissionamento",
        "partida", "manutencao", "manutenção",
    ]

    def _tem(termos: list[str]) -> bool:
        return any(t in texto_norm for t in termos)

    # ------------------------------------------------------------------
    # INTENCAO PRIORITARIA: SELECAO DE BOMBA (verbo + vazao + altura)
    # ------------------------------------------------------------------
    tem_verbo_selecao = any(
        v in texto_norm
        for v in [
            "selecionar",
            "selecionar uma bomba",
            "escolher uma bomba",
            "escolher bomba",
            "qual bomba",
            "bomba adequada",
            "preciso de uma bomba",
            "selecao",
            "seleção",
        ]
    )
    tem_vazao_num = bool(
        re.search(r"\d+[\.,]?\d*\s*(m3/h|m³/h|m3h|m³h|l/s|lps)", texto_norm)
    )
    tem_altura = bool(re.search(r"\d+[\.,]?\d*\s*(mca|m)(\s*(hmt|total|manometrica|manométrica))?", texto_norm))

    dominio_prefixo = None
    match = re.search(r"@\s*(npsh|perda\s*de\s*carga|perda_carga|seletor)", texto_norm)
    if match:
        token = match.group(1).replace(" ", "_")
        if token == "npsh":
            dominio_prefixo = "hidraulica_npsh"
        elif token in ["perda_de_carga", "perda_carga"]:
            dominio_prefixo = "hidraulica_perda_carga"
        elif token == "seletor":
            dominio_prefixo = "selecao_equipamento"

    # Regra de ouro: seleção tem prioridade absoluta
    if tem_verbo_selecao and tem_vazao_num and tem_altura:
        logger.info("[CLASSIFICADOR] Intenção detectada: SELECAO_DE_BOMBA")
        dominio = dominio_forcado or dominio_prefixo
        return {
            "tipo": "calculo",
            "subtipo": "seletor",
            "dominio": dominio,
            "usa_rag": False,
            "nivel": "tecnico",
            "motivo": "Intenção de seleção detectada com vazão e altura.",
            "dominio_sugerido": "selecao_bombas",
        }

    tipo = "conceitual"
    motivo = "Default: pergunta geral sem sinais de catálogo/cálculo/diagnóstico."
    subtipo = None

    # PRIORIDADE 1: SELECAO (vazão + altura sempre força seletor)
    if tem_vazao_num and tem_altura:
        tipo = "calculo"
        subtipo = "seletor"
        motivo = "Intenção de seleção detectada com vazão e altura."
        logger.info("[CLASSIFICADOR] Intenção detectada: SELECAO_DE_BOMBA")

    if _tem(kws_calculo) or (has_numbers and _tem(kws_catalogo)):
        if subtipo != "seletor":
            tipo = "calculo"
            motivo = "Detectado vocabulário de cálculo com números ou termos técnicos."
    elif _tem(kws_diagnostico) or _tem(kws_diagnostico_contexto):
        if subtipo != "seletor":
            tipo = "diagnostico"
            motivo = "Detectado vocabulário de falha/diagnóstico."
    elif _tem(kws_conceitual) and not _tem(kws_diagnostico_contexto):
        tipo = "conceitual"
        motivo = "Pergunta conceitual detectada."
    elif _tem(kws_catalogo):
        tipo = "catalogo"
        motivo = "Detectado vocabulário de catálogo/modelos/especificações."
    elif _tem(kws_procedimento):
        tipo = "procedimento"
        motivo = "Detectado vocabulário de procedimento/instalação."
    elif _tem(kws_conceitual):
        tipo = "conceitual"
        motivo = "Detectado vocabulário conceitual."

    # RAG ativo para qualquer pergunta que possa se beneficiar dos manuais técnicos
    # Desativado para: seletor (banco de bombas), NPSH (handler), saudações, perguntas curtas genéricas
    usa_rag = tipo in ["catalogo", "procedimento", "conceitual", "diagnostico", "calculo"]
    if subtipo in ("seletor", "npsh"):
        usa_rag = False
    _SAUDACOES = {"oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "obrigado",
                  "obrigada", "valeu", "vlw", "ok", "certo", "entendi", "tudo bem"}
    if texto_norm in _SAUDACOES or len(texto_norm.split()) <= 2 and not has_numbers:
        usa_rag = False

    nivel = "basico"
    advanced_terms = [
        "npsh", "cavitacao", "cavitação", "reynolds", "darcy", "colebrook",
        "perda distribuida", "perda distribuída", "perda localizada", "rugosidade",
        "fator de atrito",
    ]
    if _tem(advanced_terms):
        nivel = "avancado"
    elif has_numbers or _tem(kws_calculo) or _tem(kws_catalogo):
        nivel = "tecnico"
    elif _tem(kws_conceitual):
        nivel = "basico"

    dominio = dominio_forcado or dominio_prefixo

    dominio_sugerido = None
    if subtipo != "seletor" and any(k in texto_norm for k in ["npsh", "cavitacao", "cavitação", "sucção", "sucao", "pressao vapor", "pressão vapor"]):
        subtipo = subtipo or "npsh"
        dominio_sugerido = "hidraulica_npsh"
    elif any(k in texto_norm for k in ["perda de carga", "darcy", "hazen", "hazen-williams", "colebrook"]):
        dominio_sugerido = "hidraulica_perda_carga"
    elif subtipo == "seletor" or any(k in texto_norm for k in ["selecao", "seleção", "modelo", "bomba", "curva de bomba"]):
        dominio_sugerido = "selecao_bombas"

    return {
        "tipo": tipo,
        "subtipo": subtipo,
        "dominio": dominio,
        "usa_rag": bool(usa_rag),
        "nivel": nivel,
        "motivo": motivo,
        "dominio_sugerido": dominio_sugerido,
    }
