# -*- coding: utf-8 -*-
"""Extractor: módulo Motores e Bombas (HGR_MOT_* + HGR_BMB_*)."""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables
from backend.scripts.migrate_from_oracle import TableReport


TABLES = [
    # Cadastros auxiliares (FKs raiz)
    "HGR_MOT_CAD_NRM", "HGR_MOT_CAD_TP_ACI", "HGR_MOT_CAD_TP_LUB",
    "HGR_MOT_CAD_FOR_CNS", "HGR_MOT_CAD_MTD_REF", "HGR_MOT_CAD_LIQ_LUB",
    "HGR_MOT_CAD_FRN", "HGR_MOT_CAD_SNS", "HGR_MOT_CAD_CRG",
    "HGR_MOT_CAD_CLI", "HGR_MOT_CAD_MOD",
    # Cadastros principais
    "HGR_MOT_CAD_MTR", "HGR_MOT_CAD_BMB",
    # Registros
    "HGR_MOT_CAD_SNS_QTD", "HGR_MOT_MOD_REG_FAB", "HGR_MOT_MTR_REG_FRN",
    "HGR_MOT_MTR_REG_VAR", "HGR_MOT_REG_ANX", "HGR_MOT_REG_DES",
    "HGR_MOT_REG_FCT", "HGR_MOT_REG_TNS",
]


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    reports = migrate_tables(ora_conn, pg_conn, ctx, TABLES)
    # Também descobre dinamicamente HGR_BMB_* se existirem
    ora_cur = ora_conn.cursor()
    ora_cur.execute(
        "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'HGR_BMB\\_%' ESCAPE '\\' ORDER BY TABLE_NAME"
    )
    extras = [r[0] for r in ora_cur.fetchall()]
    ora_cur.close()
    if extras:
        reports.extend(migrate_tables(ora_conn, pg_conn, ctx, extras))
    return reports
