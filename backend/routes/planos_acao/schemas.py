from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PlanoStatus = Literal[
    "PENDENTE",
    "EM_ANDAMENTO",
    "CONCLUIDO",
    "IMPLEMENTADO",
    "CANCELADO",
    "AVALIACAO",
    "ABERTO",
]
TarefaPrioridade = Literal["URGENTE", "ALTA", "MEDIA", "BAIXA"]


class PlanoBaseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("*", mode="before")
    @classmethod
    def empty_strings_to_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                return None
        return value

    @field_validator("status", mode="before", check_fields=False)
    @classmethod
    def normalize_status(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("prioridade", mode="before", check_fields=False)
    @classmethod
    def normalize_prioridade(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value


class PlanoCreate(PlanoBaseSchema):
    titulo: str = Field(..., min_length=1, max_length=500)
    descricao: str | None = None
    responsavel_id: int | None = Field(None, gt=0)
    dt_prazo: date | None = None
    status: PlanoStatus = "PENDENTE"
    origem_tipo: str | None = Field(None, max_length=20)
    origem_id: int | None = Field(None, gt=0)
    metodo: str | None = None
    local: str | None = Field(None, max_length=300)
    custo: Decimal | None = Field(None, ge=0)
    custo_realizado: Decimal | None = Field(None, ge=0)
    tempo_execucao: Decimal | None = Field(None, ge=0)
    dt_reagendamento: date | None = None
    justificativa_reagendamento: str | None = None
    aval_implementacao: str | None = None
    criterio_aceitacao: str | None = None
    motivo_cancelamento: str | None = None
    percentual: int | None = Field(None, ge=0, le=100)
    beg_processo_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class PlanoUpdate(PlanoBaseSchema):
    titulo: str | None = Field(None, min_length=1, max_length=500)
    descricao: str | None = None
    responsavel_id: int | None = Field(None, gt=0)
    dt_prazo: date | None = None
    status: PlanoStatus | None = None
    origem_tipo: str | None = Field(None, max_length=20)
    origem_id: int | None = Field(None, gt=0)
    metodo: str | None = None
    local: str | None = Field(None, max_length=300)
    custo: Decimal | None = Field(None, ge=0)
    custo_realizado: Decimal | None = Field(None, ge=0)
    tempo_execucao: Decimal | None = Field(None, ge=0)
    dt_reagendamento: date | None = None
    justificativa_reagendamento: str | None = None
    aval_implementacao: str | None = None
    criterio_aceitacao: str | None = None
    motivo_cancelamento: str | None = None
    percentual: int | None = Field(None, ge=0, le=100)
    beg_processo_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class PlanoTarefaLinkCreate(PlanoBaseSchema):
    hgr_tar_cad_tarefa_id: int = Field(..., gt=0)


class PlanoTarefaCreate(PlanoBaseSchema):
    titulo: str = Field(..., min_length=1, max_length=500)
    descricao: str | None = None
    dt_previsao: date | None = None
    responsavel_id: int | None = Field(None, gt=0)
    prioridade: TarefaPrioridade = "MEDIA"


class PlanoEquipeCreate(PlanoBaseSchema):
    usuario_id: str | int = Field(...)

    @field_validator("usuario_id", mode="before")
    @classmethod
    def normalize_usuario_id(cls, value):
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                raise ValueError("usuario_id obrigatorio")
            return normalized
        return value


class PlanoEvidenciaCreate(PlanoBaseSchema):
    observacoes: str = Field(..., min_length=1)
