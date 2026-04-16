# -*- coding: utf-8 -*-
"""Extractor: módulo Documentos (STH_DOC_*, BEG_CAD_DOCUMENTO, etc.)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "STH_DOC_CAD_TIPO",
    "BEG_CAD_DOCUMENTO",
    "BEG_REV_DOCUMENTO",
    "HGR_DOC_REG_PROC",
    "HGR_DOC_REG_USU",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
