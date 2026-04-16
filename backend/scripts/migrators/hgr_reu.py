# -*- coding: utf-8 -*-
"""Extractor: módulo Reuniões (STH_REU_* + HGR_COM_*)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "STH_REU_TIPO",
    "STH_REU_PAUTA_TIPO",
    "STH_REU_AGENDA",
    "STH_REU_PARTICIPANTE",
    "STH_REU_PAUTA",
    "STH_REU_ACAO",
    "STH_REU_DECISAO",
    "STH_REU_COMENTARIO",
    "STH_REU_COM_ANEXO",
    "HGR_COM_CAD_TIPO",
    "HGR_COM_CAD_AGENDA",
    "HGR_COM_CAD_EVENTO",
    "HGR_COM_TIPO_REG_USU",
    "HGR_COM_CADASTRO_EVID",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
