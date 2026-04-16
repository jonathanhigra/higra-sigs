# -*- coding: utf-8 -*-
from __future__ import annotations
"""Funções de validação, detecção de subtipo e fallbacks."""

import re
from .constants import FALLBACK_CONCEITUAL, FALLBACK_DIAGNOSTICO, ANCHOR_CONCEPTS


def validar_idioma_pt_br(texto: str) -> bool:
    termos_ingles = [
        " the ", " and ", " with ", " for ", " using ",
        " system", " developed", " designed", " based on",
        " management", " performance", " efficiency"
    ]
    texto_lower = f" {texto.lower()} "
    return not any(t in texto_lower for t in termos_ingles)


def normalizar_texto(texto: str) -> str:
    if not texto:
        return ""
    return texto.casefold()


def _decidir_proxima_acao(subtipo: str | None, tipo: str | None = None, estado: dict | None = None) -> str:
    if subtipo == "diagnostico" or tipo == "diagnostico":
        return "diagnosticar"

    return "responder_conceitual"


def _conceitual_tem_termos_proibidos(texto: str) -> bool:
    texto_lower = (texto or "").casefold()
    termos = ["catalogo", "catálogo", "manual", "modelo", "valores finais"]
    return any(t in texto_lower for t in termos)


def _diagnostico_conteudo_generico(texto: str) -> bool:
    texto_lower = (texto or "").casefold()
    termos = [
        "definicao do conceito",
        "definição do conceito",
        "uma bomba e",
        "uma bomba é",
        "dispositivo mecanico",
        "dispositivo mecânico",
        "equipamento mecanico",
        "equipamento mecânico",
        "o que e uma bomba",
        "o que é uma bomba",
    ]
    return any(t in texto_lower for t in termos)


def _diagnostico_tem_termos_essenciais(texto: str) -> bool:
    texto_lower = (texto or "").casefold()
    termos = [
        ["cavitacao", "cavitação"],
        ["succao", "sucao", "sucção"],
        "ponto de operacao",
        "ponto de operação",
        "entrada de ar",
        "perda de carga",
        "desalinhamento",
        "rolamento",
        "rolamentos",
    ]
    encontrados = 0
    for t in termos:
        if isinstance(t, (list, tuple, set)):
            if any(var in texto_lower for var in t):
                encontrados += 1
        else:
            if t in texto_lower:
                encontrados += 1
    return encontrados >= 2


def _calculo_tem_requisitos(texto: str) -> bool:
    texto_lower = (texto or "").casefold()
    tem_hipotese = any(
        termo in texto_lower
        for termo in ["assumo", "assumindo", "hipotese", "hipótese", "considero", "considerando"]
    )
    tem_metodo = any(
        termo in texto_lower
        for termo in ["darcy", "hazen", "hazen-williams", "weisbach"]
    )
    tem_estimativa = bool(re.search(r"\\d", texto_lower)) and any(
        termo in texto_lower for termo in ["mca", "m", "bar", "kpa"]
    )
    tem_condicional = "assumindo" in texto_lower or "sob essas hipoteses" in texto_lower or "resultado" in texto_lower
    return tem_hipotese and tem_metodo and tem_condicional and tem_estimativa


def _conceitual_atende_dominio(texto: str, dominio: str | None) -> bool:
    if not dominio:
        return True
    texto_lower = (texto or "").casefold()
    if dominio == "hidraulica_npsh":
        return any(
            termo in texto_lower
            for termo in ["npsh", "sucção", "sucao", "succao", "npsh disponivel", "npsh requerido"]
        )
    if dominio == "hidraulica_perda_carga":
        return "perda de carga" in texto_lower or ("perda" in texto_lower and "carga" in texto_lower)
    if dominio == "selecao_equipamento":
        return any(termo in texto_lower for termo in ["seleção", "selecao", "selecionar", "bomba"])
    return True


def _fallback_conceitual_com_dominio(conceito: dict | None, dominio: str | None) -> str:
    base = _fallback_conceitual_ancora(conceito)
    if dominio == "hidraulica_npsh":
        return (
            f"{base} No contexto de NPSH, a cavitacao ocorre quando o NPSH disponivel na succao "
            "fica abaixo do NPSH requerido pela bomba, aumentando o risco de formacao e colapso de bolhas."
        )
    if dominio == "hidraulica_perda_carga":
        return (
            f"{base} No contexto de perda de carga, a explicacao deve considerar como as perdas "
            "distribuidas e localizadas reduzem a energia disponivel no escoamento."
        )
    if dominio == "selecao_equipamento":
        return (
            f"{base} No contexto de selecao de equipamentos, a explicacao deve relacionar o conceito "
            "com criterios de escolha e implicacoes operacionais da bomba."
        )
    return base


def _fallback_diagnostico() -> str:
    return FALLBACK_DIAGNOSTICO


def _detectar_conceito_ancora(texto_norm: str) -> str | None:
    if not texto_norm:
        return None
    for chave in ANCHOR_CONCEPTS.keys():
        if chave in texto_norm:
            return chave
    return None


def _resposta_atende_ancora(texto: str, conceito: dict | None) -> bool:
    if not conceito:
        return True
    texto_lower = (texto or "").casefold()
    essenciais = conceito.get("essenciais") or []
    for e in essenciais:
        if isinstance(e, (list, tuple, set)):
            if not any(var in texto_lower for var in e):
                return False
        else:
            if e not in texto_lower:
                return False
    return True


def _fallback_conceitual_ancora(conceito: dict | None) -> str:
    if not conceito:
        return FALLBACK_CONCEITUAL
    definicao = conceito.get("definicao") or FALLBACK_CONCEITUAL
    return definicao + " Consequências típicas incluem ruído, vibração, erosão e perda de desempenho."


def detectar_categoria(pergunta_lower: str) -> str | None:
    """Detecta categoria para filtrar busca RAG por metadados.

    Retorna None quando a pergunta é genérica — nesse caso a busca RAG
    procura em TODOS os documentos indexados (sem filtro).
    """
    if any(k in pergunta_lower for k in ["historia", "história", "fundacao", "fundação", "anos de", "empresa"]):
        return "historia"
    if any(k in pergunta_lower for k in ["funcionario", "funcionarios", "equipe", "time", "diretoria", "gerente", "colaborador"]):
        return "pessoas"

    # Subcategorias de produto — mapeiam para os 4 manuais técnicos
    if any(k in pergunta_lower for k in ["anfibia", "anfíbia", "anfibias", "anfíbias", "fora d'agua", "fora d'água", "fora da agua", "fora da água"]):
        return "bomba_anfibia"
    if any(k in pergunta_lower for k in ["submersa", "submersas", "submersivel", "submersível", "submersiveis", "submersíveis"]):
        return "bomba_submersa"
    if any(k in pergunta_lower for k in ["aerador", "aeradores", "aeracao", "aeração", "oxigenio", "oxigênio", "oxigenacao", "oxigenação"]):
        return "aerador"
    if any(k in pergunta_lower for k in ["misturador", "misturadores", "mistura", "agitador", "agitacao", "agitação"]):
        return "misturador"

    # Perguntas genéricas sobre produto/bomba/HIGRA — busca sem filtro em todos os manuais
    return None


def _detectar_hipoteses(texto: str) -> bool:
    palavras_hipotese = [
        "assumindo", "hipótese", "hipotese", "estimado", "ordem de grandeza",
        "aproximado", "tipico", "típico", "referência", "referencia",
    ]
    texto_lower = (texto or "").casefold()
    return any(p in texto_lower for p in palavras_hipotese)
