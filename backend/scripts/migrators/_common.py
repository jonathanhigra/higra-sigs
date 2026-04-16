# -*- coding: utf-8 -*-
"""Helpers compartilhados entre extractors."""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import copy_table, TableReport


def pg_table_has_data(pg_conn, table: str) -> bool:
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


def migrate_tables(ora_conn, pg_conn, ctx, tables: list[str]) -> list[TableReport]:
    """Copia várias tabelas Oracle → PG preservando ordem e respeitando
    tabelas já populadas (INSERT-only + ON CONFLICT DO NOTHING)."""
    reports: list[TableReport] = []
    for ora_table in tables:
        pg_table = ora_table.lower()
        mode = "insert_only" if pg_table_has_data(pg_conn, pg_table) else "drop_create"
        reports.append(copy_table(
            ora_conn, pg_conn, ora_table,
            mode=mode, pk_col=f"{pg_table}_id", ctx=ctx,
        ))
    return reports
