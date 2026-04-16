# -*- coding: utf-8 -*-
"""Extractor: módulo Qualidade RQ03 (reclamações)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "HGR_SST_CAD_PRT_CRP",
    "HGR_SST_CAD_TP_LESAO",
    "HGR_SST_CAD_AGT_CSDR",
    "HGR_SST_CAD_TP_PERC",
    "BEG_RQ03",
    "BEG_RQ03_REG_SST",
    "BEG_RQ03_SST_REG_PRT_CRP",
    "BEG_RQ03_SST_REG_TP_LESAO",
    "HGR_RQ03_REG_ANT",
    "HGR_RQ03_REG_ANX",
    "HGR_RQ03_REG_PART",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
