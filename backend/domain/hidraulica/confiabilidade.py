from __future__ import annotations
# backend/domain/hidraulica/confiabilidade.py
"""
Analisador de Confiabilidade Hidráulica – FASE 6
------------------------------------------------
Avalia se uma solução sobrevive à falha de uma bomba (N+1)
usando capacidade NOMINAL implícita por bomba.
"""

from typing import Dict
from .otimizador import Solucao


def _extrair_numeros(obj):
    """Retorna todos os valores numéricos do __dict__ do objeto."""
    return [
        v for v in vars(obj).values()
        if isinstance(v, (int, float))
    ]


def _vazao_nominal_bomba(bomba) -> float:
    valores = _extrair_numeros(bomba)
    if not valores:
        raise AttributeError("Não foi possível inferir vazão nominal da bomba.")
    return max(valores)  # vazão é o maior valor


def _altura_nominal_bomba(bomba) -> float:
    valores = _extrair_numeros(bomba)
    if not valores:
        raise AttributeError("Não foi possível inferir altura nominal da bomba.")
    return min(valores)  # altura é o menor valor


class ResultadoConfiabilidade:
    def __init__(
        self,
        sobrevive_falha: bool,
        n_operacional: int,
        n_necessario: int,
        ponto_com_falha: dict | None = None,
        aviso: str | None = None,
    ):
        self.sobrevive_falha = sobrevive_falha
        self.n_operacional = n_operacional
        self.n_necessario = n_necessario
        self.ponto_com_falha = ponto_com_falha
        self.aviso = aviso

    def to_dict(self) -> Dict:
        return {
            "sobrevive_falha": self.sobrevive_falha,
            "n_operacional": self.n_operacional,
            "n_necessario": self.n_necessario,
            "ponto_com_falha": self.ponto_com_falha,
            "aviso": self.aviso,
        }


class AnalisadorConfiabilidade:
    def __init__(self, vazao_alvo: float, altura_alvo: float):
        self.vazao_alvo = vazao_alvo
        self.altura_alvo = altura_alvo

    def avaliar_n_plus_1(self, solucao: Solucao) -> ResultadoConfiabilidade:
        n = len(solucao.bombas)

        # -------------------------
        # Simples → nunca é N+1
        # -------------------------
        if solucao.arranjo == "simples" or n <= 1:
            return ResultadoConfiabilidade(
                sobrevive_falha=False,
                n_operacional=n,
                n_necessario=n + 1,
                aviso="Sistema simples não possui redundância (N+1 impossível).",
            )

        bomba_ref = solucao.bombas[0]

        # -------------------------
        # Paralelo → vazão soma
        # -------------------------
        if solucao.arranjo == "paralelo":
            vazao_nominal = _vazao_nominal_bomba(bomba_ref)
            vazao_com_falha = (n - 1) * vazao_nominal

            if vazao_com_falha >= self.vazao_alvo:
                return ResultadoConfiabilidade(
                    sobrevive_falha=True,
                    n_operacional=n,
                    n_necessario=n - 1,
                    ponto_com_falha={
                        "q": vazao_com_falha,
                        "h": self.altura_alvo,
                    },
                )

            return ResultadoConfiabilidade(
                sobrevive_falha=False,
                n_operacional=n,
                n_necessario=n + 1,
                ponto_com_falha={
                    "q": vazao_com_falha,
                    "h": self.altura_alvo,
                },
                aviso="Sistema paralelo não mantém vazão após falha.",
            )

        # -------------------------
        # Série → altura soma
        # -------------------------
        if solucao.arranjo == "serie":
            altura_nominal = _altura_nominal_bomba(bomba_ref)
            altura_com_falha = (n - 1) * altura_nominal

            if altura_com_falha >= self.altura_alvo:
                return ResultadoConfiabilidade(
                    sobrevive_falha=True,
                    n_operacional=n,
                    n_necessario=n - 1,
                    ponto_com_falha={
                        "q": self.vazao_alvo,
                        "h": altura_com_falha,
                    },
                )

            return ResultadoConfiabilidade(
                sobrevive_falha=False,
                n_operacional=n,
                n_necessario=n + 1,
                ponto_com_falha={
                    "q": self.vazao_alvo,
                    "h": altura_com_falha,
                },
                aviso="Sistema em série não mantém altura após falha.",
            )

        return ResultadoConfiabilidade(
            sobrevive_falha=False,
            n_operacional=n,
            n_necessario=n + 1,
            aviso="Arranjo desconhecido.",
        )
