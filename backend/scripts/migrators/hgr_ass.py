# -*- coding: utf-8 -*-
"""Extractor: módulo Assistência Técnica (HGR_ASS_*) — 27 tabelas."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


# Ordem: cadastros → configuração → atendimento + registros
TABLES = [
    "HGR_ASS_CAD_CAN_ENT", "HGR_ASS_CAD_STT", "HGR_ASS_CAD_TP_ATN",
    "HGR_ASS_CAD_TP_TAR", "HGR_ASS_CFG_CAD_FNL", "HGR_ASS_CFG_FNL_REG_ETP",
    "HGR_ASS_TP_ATN_REG_CAT", "HGR_ASS_CAD_ACE_CFG", "HGR_ASS_ACE_CFG_REG_USU",
    "HGR_ASS_CAD_VW_CFG", "HGR_ASS_VW_REG_USU", "HGR_ASS_VW_USU_REG_FIL",
    "HGR_ASS_REG_PRM",
    "HGR_ASS_CAD_ATN",
    "HGR_ASS_ATN_REG_ANT", "HGR_ASS_ATN_REG_ANX", "HGR_ASS_ATN_REG_ATN",
    "HGR_ASS_ATN_REG_CKL", "HGR_ASS_ATN_REG_EQP", "HGR_ASS_ATN_REG_ETP",
    "HGR_ASS_ATN_REG_LAU", "HGR_ASS_ATN_REG_NEG", "HGR_ASS_ATN_REG_PART",
    "HGR_ASS_ATN_REG_RQ03", "HGR_ASS_ATN_REG_STT", "HGR_ASS_ATN_REG_TAR",
    "HGR_ASS_ATN_REG_TP",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    return migrate_tables(ora_conn, pg_conn, ctx, TABLES)
