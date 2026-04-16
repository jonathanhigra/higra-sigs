# -*- coding: utf-8 -*-
"""Extractor: módulo Laboratório (HGR_LAB_* + HGR_BANC_* + HGR_PED_*)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    "HGR_LAB_CAD_EQP", "HGR_LAB_CAD_MTV", "HGR_LAB_CAD_OBS",
    "HGR_LAB_CAD_TP_TST", "HGR_LAB_CAD_TP_USER", "HGR_LAB_CAD_TEAM",
    "HGR_LAB_CAD_TST", "HGR_LAB_REG_TESTE", "HGR_LAB_TP_TST_REG_TEAM",
    "HGR_LAB_TST_REG_ALT_DATA", "HGR_LAB_TST_REG_STT", "HGR_LAB_TST_REG_TEAM",
    "HGR_BANC_CAD_SIM_REB", "HGR_BANC_REG_BOMBA", "HGR_BANC_REG_SIM_REB",
    "HGR_PED_REG_CART",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
