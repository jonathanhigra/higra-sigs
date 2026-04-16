# -*- coding: utf-8 -*-
"""
Extractor: HGRHML.STH_CAD_FILIAL → public.sth_cad_filial

Depende de `sth_cad_empresa` (FK `sth_cad_empresa_id`). O orquestrador
já executa empresas antes. Preserva IDs originais para não quebrar FKs
já existentes no destino.
"""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import copy_table, TableReport


ORA_TABLE = "STH_CAD_FILIAL"
PG_TABLE = "sth_cad_filial"


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
        if not cur.fetchone()[0]:
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
