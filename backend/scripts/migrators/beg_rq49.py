# -*- coding: utf-8 -*-
"""Extractor: módulo Qualidade RQ49 (não-conformidades)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "HGR_RQ49_CAD_ORIG",
    "HGR_RQ49_CAD_CLA_PRI",
    "BEG_RQ49",
    "BEG_RQ49_REG_USU",
    "BEG_RQ49_REG_ANX",
    "HGR_RQ49_REG_ANT",
    "HGR_RQ49_REG_AVAL",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
