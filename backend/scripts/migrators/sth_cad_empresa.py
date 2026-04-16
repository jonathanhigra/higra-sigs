# -*- coding: utf-8 -*-
"""
Extractor: HGRHML.STH_CAD_EMPRESA → public.sth_cad_empresa

Tabela raiz (sem FK). Estratégia:
- Se `public.sth_cad_empresa` não existir → DROP/CREATE e copiar.
- Se existir com dados → INSERT-only com ON CONFLICT DO NOTHING.
"""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import copy_table, TableReport


ORA_TABLE = "STH_CAD_EMPRESA"
PG_TABLE = "sth_cad_empresa"


def _pg_table_has_data(pg_conn) -> bool:
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = %s
            )
            """,
            (PG_TABLE,),
        )
        exists = cur.fetchone()[0]
        if not exists:
            return False
        cur.execute(f"SELECT COUNT(*) FROM public.{PG_TABLE}")
        return cur.fetchone()[0] > 0


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    mode = "insert_only" if _pg_table_has_data(pg_conn) else "drop_create"
    report = copy_table(
        ora_conn, pg_conn, ORA_TABLE,
        mode=mode, pk_col=f"{PG_TABLE}_id", ctx=ctx,
    )
    return [report]
