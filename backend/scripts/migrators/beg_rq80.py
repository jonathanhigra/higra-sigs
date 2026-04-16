# -*- coding: utf-8 -*-
"""Extractor: módulo Qualidade RQ80 (auditorias) + RQ94."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "BEG_RQ80",
    "BEG_RQ80_REG_USU",
    "BEG_RQ80_EVID",
    "BEG_RQ94",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
