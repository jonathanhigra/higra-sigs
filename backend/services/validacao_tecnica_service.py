# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Validacao tecnica deterministica da resposta.
Nao altera texto, apenas classifica risco e observacoes.
"""

import re
import unicodedata


UNIDADES = [
    "m", "mca", "m3/h", "mÂ³/h", "bar", "kpa", "kw", "cv", "rpm", "%", "mm"
]

ANCHOR_CHECKS = {
    "cavitacao": [["pressao", "pressão"], "vapor", ["bolha", "bolhas"], ["colapso", "colapsam", "colapsar"]],
    "cavitação": [["pressao", "pressão"], "vapor", ["bolha", "bolhas"], ["colapso", "colapsam", "colapsar"]],
    "npsh": ["npsh", ["pressao", "pressão"], "vapor", ["succao", "sucção", "sucao"]],
    "perda de carga": ["perda", "carga", "atrito", "energia"],
    "escoamento turbulento": ["turbulento", "reynolds"],
    "turbulento": ["turbulento", "reynolds"],
    "numero de reynolds": ["reynolds", ["viscosidade"], ["inercia", "inércia"]],
    "número de reynolds": ["reynolds", ["viscosidade"], ["inercia", "inércia"]],
    "reynolds": ["reynolds", ["viscosidade"], ["inercia", "inércia"]],
    "pressao de vapor": [["pressao", "pressão"], "vapor", "temperatura"],
    "pressão de vapor": [["pressao", "pressão"], "vapor", "temperatura"],
}


def _tem_numero(texto: str) -> bool:
    return bool(re.search(r"\d", texto or ""))


def _tem_unidade(texto: str) -> bool:
    texto_lower = (texto or "").lower()
    return any(u in texto_lower for u in UNIDADES)


def _tem_relacao_sintoma_causa(texto: str) -> bool:
    texto_lower = (texto or "").lower()
    return any(k in texto_lower for k in ["causa", "provavel", "provável", "devido", "porque", "resulta", "origem"])


def _tem_definicao_conceitual(texto: str) -> bool:
    texto_lower = (texto or "").casefold()
    marcadores = [
        " eh ", " é ", " consiste", " trata-se", " refere-se", " define-se",
        " significa", " caracteriza", " é um ", " é uma ", " é o ", " é a ",
    ]
    return any(m in texto_lower for m in marcadores)


def _tem_fenomeno_fisico(texto: str) -> bool:
    texto_lower = (texto or "").lower()
    marcadores = [
        "ocorre", "quando", "devido", "causado", "pressao", "pressão", "temperatura",
        "energia", "escoamento", "vapor", "bolha", "colapso", "fluxo",
    ]
    return any(m in texto_lower for m in marcadores)


def _valores_extremos(texto: str) -> list[str]:
    observacoes = []
    texto_lower = (texto or "").lower()
    # eficiencia > 100%
    for m in re.findall(r"(\d{2,3})\s*%", texto_lower):
        try:
            val = float(m)
            if val > 100:
                observacoes.append("EficiÃªncia acima de 100% Ã© fisicamente inviÃ¡vel.")
        except Exception:
            pass
    # NPSH negativo
    if "npsh" in texto_lower and re.search(r"npsh[^\\d-]*-\\d", texto_lower):
        observacoes.append("NPSH negativo Ã© fisicamente improvÃ¡vel sem condiÃ§Ãµes extremas.")
    return observacoes


def validar_resposta(texto: str, tipo: str, nivel: str, memoria_tecnica: str, dominio: str | None = None) -> dict:
    observacoes = []
    status = "ok"
    texto_lower = (texto or "").casefold()

    if tipo == "calculo":
        if not _tem_numero(texto):
            observacoes.append("Resposta de calculo sem numeros pode estar incompleta.")
        if not _tem_unidade(texto):
            observacoes.append("Resposta de calculo sem unidades pode gerar ambiguidade.")

    if tipo == "diagnostico":
        if not _tem_relacao_sintoma_causa(texto):
            observacoes.append("Diagnostico sem relacao clara entre sintomas e causas.")
        termos_diag = [
            ["cavitacao", "cavitação"],
            ["succao", "sucção", "sucao"],
            "ponto de operacao",
            "ponto de operação",
            "entrada de ar",
            "perda de carga",
            "desalinhamento",
            "rolamento",
            "rolamentos",
        ]
        encontrados = 0
        for t in termos_diag:
            if isinstance(t, (list, tuple, set)):
                if any(var in texto_lower for var in t):
                    encontrados += 1
            else:
                if t in texto_lower:
                    encontrados += 1
        if encontrados < 2:
            observacoes.append("Diagnostico sem termos tecnicos essenciais suficientes.")

    if tipo == "conceitual":
        if not _tem_definicao_conceitual(texto) or not _tem_fenomeno_fisico(texto):
            observacoes.append(
                "Resposta conceitual sem definicao clara e explicacao do fenomeno fisico."
            )
        for conceito, termos in ANCHOR_CHECKS.items():
            if conceito in texto_lower:
                ok = True
                for t in termos:
                    if isinstance(t, (list, tuple, set)):
                        if not any(var in texto_lower for var in t):
                            ok = False
                            break
                    else:
                        if t not in texto_lower:
                            ok = False
                            break
                if not ok:
                    observacoes.append(
                        f"Resposta conceitual sobre {conceito} sem termos essenciais."
                    )

        dominio_norm = (dominio or "").casefold()
        if dominio_norm == "hidraulica_npsh":
            if not any(
                termo in texto_lower
                for termo in ["npsh", "sucção", "sucao", "succao", "npsh disponivel", "npsh requerido"]
            ):
                observacoes.append(
                    "Resposta conceitual em domínio NPSH sem menção explícita a NPSH ou sucção."
                )

    observacoes.extend(_valores_extremos(texto))

    if observacoes:
        status = "alerta"
        if any("inviavel" in o.lower() or "improvavel" in o.lower() for o in observacoes):
            status = "inconsistente"
        if tipo == "conceitual" and any("conceitual" in o.lower() for o in observacoes):
            status = "inconsistente"
        if tipo == "diagnostico" and any("diagnostico" in o.lower() for o in observacoes):
            status = "inconsistente"

    return {
        "status": status,
        "observacoes": observacoes,
    }
