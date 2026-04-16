# -*- coding: utf-8 -*-
"""Extractor: módulo Projetos (HGR_PRJ_*)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "HGR_PRJ_CAD_CAT",
    "HGR_PRJ_CAD_MOD_ETP",
    "HGR_PRJ_CAD_TP_ANX",
    "HGR_PRJ_CAD_PROJETO",
    "HGR_PRJ_PROJETO",
    "HGR_PRJ_REG_ETP",
    "HGR_PRJ_REG_ETP_KBN",
    "HGR_PRJ_REG_ANT",
    "HGR_PRJ_REG_ANX",
    "HGR_PRJ_REG_PART",
    "HGR_PRJ_REG_TAR",
    "HGR_PRJ_REG_NEG",
    "HGR_PRJ_REG_JUST_PRZ",
    "HGR_PRJ_CAD_GAST_EXT",
    "HGR_PRJ_CAD_GAST_EXT_ANX",
    "HGR_PRJ_TP_ANX_REG_MAIL",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
