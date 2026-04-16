from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Rq03Status = Literal["ABERTA", "EM_ANALISE", "ACAO_CORRETIVA", "VERIFICACAO", "FECHADA", "CANCELADA", "A", "E", "F", "C"]
Rq03Prioridade = Literal["URGENTE", "ALTA", "MEDIA", "BAIXA"]
Rq03Tipo = Literal["EXTERNA", "INTERNA", "SST", "C", "I", "S"]


class Rq03BaseSchema(BaseModel):
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

    @field_validator("tipo", mode="before", check_fields=False)
    @classmethod
    def normalize_tipo(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("afastamento", mode="before", check_fields=False)
    @classmethod
    def normalize_afastamento(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value


class Rq03Create(Rq03BaseSchema):
    reclamante: str | None = Field(None, max_length=300)
    descricao: str = Field(..., min_length=1)
    classificacao: str | None = Field(None, max_length=50)
    prioridade: Rq03Prioridade | None = None
    tipo: Rq03Tipo = "EXTERNA"
    beg_processo_id: int | None = Field(None, gt=0)
    responsavel_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)


class Rq03Update(Rq03BaseSchema):
    reclamante: str | None = Field(None, max_length=300)
    descricao: str | None = Field(None, min_length=1)
    status: Rq03Status | None = None
    classificacao: str | None = Field(None, max_length=50)
    prioridade: Rq03Prioridade | None = None
    tipo: Rq03Tipo | None = None
    beg_processo_id: int | None = Field(None, gt=0)
    responsavel_id: int | None = Field(None, gt=0)
    sth_cad_empresa_id: int | None = Field(None, gt=0)
    sth_cad_filial_id: int | None = Field(None, gt=0)
    ind_acidente: str | None = Field(None, max_length=1)  # 'S'|'N'
    origem: str | None = Field(None, max_length=30)  # CLIENTE|INTERNA|AUDITORIA|FORNECEDOR (tarefa 268)


class Rq03AnaliseUpdate(Rq03BaseSchema):
    texto: str | None = None
    # 5 Porquês — causa_raiz (tarefa 258)
    pq1: str | None = None
    pq2: str | None = None
    pq3: str | None = None
    pq4: str | None = None
    pq5: str | None = None
    # Análise de Extensão (tarefa 259)
    ext_afeta_outros: str | None = Field(None, max_length=1)   # 'S'|'N'
    ext_processos_afetados: str | None = None
    # Análise de Implementação (tarefa 260)
    impl_realizada: str | None = Field(None, max_length=1)     # 'S'|'N'
    impl_evidencias: str | None = None
    impl_data: str | None = None                               # date string
    # Análise de Eficácia (tarefa 261)
    efic_periodo_dias: int | None = None
    efic_eficaz: str | None = Field(None, max_length=1)        # 'S'|'N'


class Rq03AnotacaoCreate(Rq03BaseSchema):
    descricao: str = Field(..., min_length=1)


class Rq03ParticipanteCreate(Rq03BaseSchema):
    usuario_id: int = Field(..., gt=0)


class Rq03SstUpdate(Rq03BaseSchema):
    dt_ocorrencia: date | None = None
    dt_notificacao: date | None = None
    descricao: str | None = None
    local_ocorrencia: str | None = Field(None, max_length=300)
    turno: str | None = Field(None, max_length=20)
    atividade: str | None = Field(None, max_length=200)
    cat_profissional: str | None = Field(None, max_length=200)
    tempo_empresa: str | None = Field(None, max_length=50)
    afastamento: Literal["S", "N"] = "N"
    dias_afastamento: int | None = Field(None, ge=0)


class Rq03TransicaoIn(Rq03BaseSchema):
    novo_status: str
    motivo: str | None = None


STATUS_NORM = {
    'A': 'ABERTA', 'E': 'EM_ANALISE', 'F': 'FECHADA', 'C': 'CANCELADA',
    'ABERTA': 'ABERTA', 'EM_ANALISE': 'EM_ANALISE',
    'ACAO_CORRETIVA': 'ACAO_CORRETIVA', 'VERIFICACAO': 'VERIFICACAO',
    'FECHADA': 'FECHADA', 'CANCELADA': 'CANCELADA',
}

RQ03_TRANSITIONS = {
    'ABERTA':          ['EM_ANALISE', 'CANCELADA'],
    'EM_ANALISE':      ['ACAO_CORRETIVA', 'CANCELADA'],
    'ACAO_CORRETIVA':  ['VERIFICACAO', 'EM_ANALISE', 'CANCELADA'],
    'VERIFICACAO':     ['FECHADA', 'ACAO_CORRETIVA', 'CANCELADA'],
    'FECHADA':         ['EM_ANALISE'],
    'CANCELADA':       [],
}

RQ03_PREREQUISITES = {
    'EM_ANALISE': ['descricao'],
    'ACAO_CORRETIVA': ['analise_extensao', 'causa_raiz'],
    'VERIFICACAO': ['acao_corretiva'],
    'FECHADA': ['analise_eficacia'],
}

RQ03_LABELS = {
    'ABERTA': 'Aberta',
    'EM_ANALISE': 'Em Análise',
    'ACAO_CORRETIVA': 'Ação Corretiva',
    'VERIFICACAO': 'Verificação',
    'FECHADA': 'Fechada',
    'CANCELADA': 'Cancelada',
}
