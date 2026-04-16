from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TarefaStatus = Literal["ABERTA", "EM_ANDAMENTO", "EM_ESPERA", "CONCLUIDA", "CANCELADA", "A", "E", "C", "X"]
TarefaPrioridade = Literal["URGENTE", "ALTA", "MEDIA", "BAIXA"]


class TarefaBaseSchema(BaseModel):
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


class TarefaCreate(TarefaBaseSchema):
    titulo: str = Field(..., min_length=1, max_length=500)
    descricao: str | None = None
    codigo: str | None = Field(None, max_length=50)
    dt_inicio: date | None = None
    dt_previsao: date | None = None
    prioridade: TarefaPrioridade = "MEDIA"
    status: TarefaStatus = "ABERTA"
    responsavel_id: int | None = Field(None, gt=0)
    hgr_tar_cad_etp_id: int | None = Field(None, gt=0)
    hgr_tar_cad_etp_kbn_id: int | None = Field(None, gt=0)
    beg_processo_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class TarefaUpdate(TarefaBaseSchema):
    titulo: str | None = Field(None, min_length=1, max_length=500)
    descricao: str | None = None
    codigo: str | None = Field(None, max_length=50)
    dt_inicio: date | None = None
    dt_previsao: date | None = None
    dt_entrega: date | None = None
    prioridade: TarefaPrioridade | None = None
    status: TarefaStatus | None = None
    feedback: str | None = None
    percentual: Decimal | None = Field(None, ge=0, le=100)
    responsavel_id: int | None = Field(None, gt=0)
    hgr_tar_cad_etp_id: int | None = Field(None, gt=0)
    hgr_tar_cad_etp_kbn_id: int | None = Field(None, gt=0)
    beg_processo_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class TarefaApontamentoCreate(TarefaBaseSchema):
    tempo_minutos: int = Field(..., gt=0)
    descricao: str | None = None
    dt_apontamento: date | None = None


class TarefaKanbanMove(TarefaBaseSchema):
    hgr_tar_cad_etp_kbn_id: int = Field(..., gt=0)
