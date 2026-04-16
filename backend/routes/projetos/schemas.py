from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ProjetoStatus = Literal["ABERTO", "EM_ANDAMENTO", "PARALISADO", "FINALIZADO", "CANCELADO", "A", "E", "P", "F", "C"]
ProjetoPrioridade = Literal["URGENTE", "ALTA", "MEDIA", "BAIXA", "1", "2", "3", "4", "5"]


class ProjetoBaseSchema(BaseModel):
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


class ProjetoCreate(ProjetoBaseSchema):
    titulo: str = Field(..., min_length=1, max_length=500)
    codigo: str | None = Field(None, max_length=50)
    descricao: str | None = None
    objetivo: str | None = None
    status: ProjetoStatus = "ABERTO"
    prioridade: ProjetoPrioridade | None = None
    dt_inicio: date | None = None
    dt_prev_termino: date | None = None
    vlr_orc: Decimal | None = Field(None, ge=0)
    hgr_prj_cad_cat_id: int | None = Field(None, gt=0)
    responsavel_id: int | None = Field(None, gt=0)
    beg_processo_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class ProjetoUpdate(ProjetoBaseSchema):
    titulo: str | None = Field(None, min_length=1, max_length=500)
    codigo: str | None = Field(None, max_length=50)
    descricao: str | None = None
    objetivo: str | None = None
    status: ProjetoStatus | None = None
    prioridade: ProjetoPrioridade | None = None
    dt_inicio: date | None = None
    dt_prev_termino: date | None = None
    dt_entrega: date | None = None
    vlr_orc: Decimal | None = Field(None, ge=0)
    hgr_prj_cad_cat_id: int | None = Field(None, gt=0)
    responsavel_id: int | None = Field(None, gt=0)
    beg_processo_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class ProjetoEtapaCreate(ProjetoBaseSchema):
    titulo: str = Field(..., min_length=1, max_length=200)
    descricao: str | None = None
    ordem: int | None = Field(None, ge=1)
    dt_inicio: date | None = None
    dt_fim: date | None = None
    responsavel_id: int | None = Field(None, gt=0)
    marco: str | None = Field(None, max_length=1)


class ProjetoEtapaUpdate(ProjetoBaseSchema):
    titulo: str | None = Field(None, min_length=1, max_length=200)
    descricao: str | None = None
    status: str | None = Field(None, max_length=20)
    ordem: int | None = Field(None, ge=1)
    dt_inicio: date | None = None
    dt_fim: date | None = None
    responsavel_id: int | None = Field(None, gt=0)
    marco: str | None = Field(None, max_length=1)


class ProjetoAnotacaoCreate(ProjetoBaseSchema):
    descricao: str = Field(..., min_length=1)


class ProjetoParticipanteCreate(ProjetoBaseSchema):
    usuario_id: int = Field(..., gt=0)
    papel: str | None = Field("COLABORADOR", max_length=20)


class ProjetoParticipanteUpdate(ProjetoBaseSchema):
    papel: str = Field(..., max_length=20)


class ProjetoGastoCreate(ProjetoBaseSchema):
    descricao: str = Field(..., min_length=1, max_length=500)
    valor: Decimal | None = Field(None, ge=0)
    dt_gasto: date | None = None
    categoria: str | None = Field(None, max_length=100)
    fornecedor: str | None = Field(None, max_length=300)
    nota_fiscal: str | None = Field(None, max_length=100)
    justificativa: str | None = None


# --- Focco ERP (read-only) ---

class FoccoPVVincular(BaseModel):
    """Vincula um PV do Focco a um projeto."""
    model_config = ConfigDict(extra="forbid")
    focco_pv: str = Field(..., min_length=1, max_length=50)
