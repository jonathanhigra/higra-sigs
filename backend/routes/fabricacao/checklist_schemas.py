from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ChecklistStatus = Literal["ABERTO", "EM_PRODUCAO", "CONCLUIDO", "CANCELADO"]


class ChecklistBaseSchema(BaseModel):
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


class ChecklistCreate(ChecklistBaseSchema):
    pv: str = Field(..., min_length=1, max_length=50)
    nr_serie: str | None = Field(None, max_length=100)
    cliente: str | None = Field(None, max_length=300)
    equipamento: str | None = Field(None, max_length=300)
    modelo: str | None = Field(None, max_length=200)
    responsavel_id: int | None = Field(None, gt=0)


class ChecklistUpdate(ChecklistBaseSchema):
    status: ChecklistStatus | None = None
    hgr_fab_ckl_cad_etp_id: int | None = Field(None, gt=0)
    observacoes: str | None = None


class ChecklistOcorrenciaCreate(ChecklistBaseSchema):
    descricao: str = Field(..., min_length=1)
    tipo: str | None = Field(None, max_length=20)
    gravidade: str | None = Field(None, max_length=20)
    responsavel_id: int | None = Field(None, gt=0)


class InstrumentoCreate(ChecklistBaseSchema):
    descricao: str = Field(..., min_length=1, max_length=300)
    codigo: str | None = Field(None, max_length=50)
    fabricante: str | None = Field(None, max_length=200)
    modelo: str | None = Field(None, max_length=200)
    nr_serie: str | None = Field(None, max_length=100)
    dt_calibracao: date | None = None
    dt_prox_calibracao: date | None = None
    localizacao: str | None = Field(None, max_length=200)
