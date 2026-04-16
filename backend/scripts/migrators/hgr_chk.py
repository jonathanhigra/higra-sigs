# -*- coding: utf-8 -*-
"""
Extractor: módulo Fabricação (HGR_FAB_* + HGR_CHK_* — checklists).

Descoberta dinâmica: as tabelas do módulo fabricação são muitas (~63).
Em vez de enumerar manualmente, descobrimos via `user_tables` do Oracle
filtrando pelos prefixos relevantes e respeitando ordem topológica
mínima (cadastros auxiliares → checklists → registros de processo).
"""
from __future__ import annotations

from backend.scripts.migrators._common import migrate_tables, pg_table_has_data
from backend.scripts.migrate_from_oracle import copy_table, TableReport


# Cadastros auxiliares primeiro (independentes)
CADASTROS = [
    "HGR_FAB_CKL_CAD_CARC", "HGR_FAB_CKL_CAD_POT", "HGR_FAB_CKL_CAD_TENSAO",
    "HGR_FAB_CKL_CAD_SENS", "HGR_FAB_CKL_CAD_CLI", "HGR_FAB_CKL_CAD_EQP",
    "HGR_FAB_CKL_CAD_FIL", "HGR_FAB_CKL_CAD_FORN", "HGR_FAB_CKL_CAD_FAB_FIO",
    "HGR_FAB_CKL_CAD_PRC", "HGR_FAB_CKL_CAD_TP_LIG", "HGR_FAB_CKL_CAD_TP_CAB",
    "HGR_FAB_CKL_CAD_QNT_CAB", "HGR_FAB_CKL_CAD_SEC_CAB",
    "HGR_FAB_CKL_CAD_PCT_SNS", "HGR_FAB_CKL_CAD_TNT", "HGR_FAB_CKL_CAD_TP_ALT",
    "HGR_FAB_CKL_CAD_TP_PRN_MOT",
]

CHECKLIST_MASTER = [
    "HGR_FAB_CKL_CAD_CCK_LIS", "HGR_FAB_CKL_CAD_ETP", "HGR_FAB_CKL_CAD_EST",
    "HGR_FAB_CAD_CCK_LIS", "HGR_FAB_CAD_OCO",
]

REGISTROS = [
    "HGR_FAB_REG_BOB", "HGR_FAB_REG_CNJ_MOT", "HGR_FAB_REG_ENS_HID",
    "HGR_FAB_REG_PIN", "HGR_FAB_REG_QLD", "HGR_FAB_REG_MNT",
    "HGR_FAB_REG_EMB", "HGR_FAB_REG_EXP", "HGR_FAB_REG_QLD_MNT",
    "HGR_FAB_REG_QLD_MNT_FALHAS", "HGR_FAB_REG_EXP_LOG_TST",
    "HGR_FAB_INST_MED", "HGR_FAB_INST_MED_CAL_LOG",
]


def _discover_extra_chk_tables(ora_conn) -> list[str]:
    """Descobre tabelas HGR_CHK_* não listadas explicitamente."""
    cur = ora_conn.cursor()
    cur.execute(
        """
        SELECT TABLE_NAME FROM USER_TABLES
         WHERE TABLE_NAME LIKE 'HGR_CHK\\_%' ESCAPE '\\'
         ORDER BY TABLE_NAME
        """
    )
    rows = [r[0] for r in cur.fetchall()]
    cur.close()
    return rows


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    reports: list[TableReport] = []
    ordered = CADASTROS + CHECKLIST_MASTER + REGISTROS + _discover_extra_chk_tables(ora_conn)
    reports.extend(migrate_tables(ora_conn, pg_conn, ctx, ordered))
    return reports
