# -*- coding: utf-8 -*-
"""
Extractor: módulo Gestão/Indicadores (HGR_GES_*).

Inclui metas, semáforos, tendências, apontamentos e gamificação.
Ordem respeitando FKs:
  HGR_GES_CAD_UNIDADE, HGR_GES_CAD_TEND, HGR_GES_CAD_SEMAFORO,
  HGR_GES_CAD_PERS, HGR_GES_CAD_META, HGR_GES_REG_META,
  HGR_GES_REG_SEM_META, HGR_GES_REG_TEND_SEM, HGR_GES_REG_META_GAC,
  HGR_GAM_REG_XP, HGR_CUST_CAD_REM_HR
"""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import copy_table, TableReport


TABLES = [
    "HGR_GES_CAD_UNIDADE",
    "HGR_GES_CAD_TEND",
    "HGR_GES_CAD_SEMAFORO",
    "HGR_GES_CAD_PERS",
    "HGR_GES_CAD_META",
    "HGR_GES_REG_META",
    "HGR_GES_REG_SEM_META",
    "HGR_GES_REG_TEND_SEM",
    "HGR_GES_REG_META_GAC",
    "HGR_GAM_REG_XP",
    "HGR_CUST_CAD_REM_HR",
]


def _pg_table_has_data(pg_conn, table: str) -> bool:
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = %s
            )
            """,
            (table,),
        )
        if not cur.fetchone()[0]:
            return False
        cur.execute(f'SELECT COUNT(*) FROM public."{table}"')
        return cur.fetchone()[0] > 0


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    reports: list[TableReport] = []
    for ora_table in TABLES:
        pg_table = ora_table.lower()
        mode = "insert_only" if _pg_table_has_data(pg_conn, pg_table) else "drop_create"
        pk_col = f"{pg_table}_id"
        reports.append(copy_table(
            ora_conn, pg_conn, ora_table, mode=mode, pk_col=pk_col, ctx=ctx,
        ))
    return reports
