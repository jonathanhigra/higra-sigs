# -*- coding: utf-8 -*-
"""
Extractor: módulo Tarefas (HGR_TAR_*).

Tabelas migradas em ordem de dependência:
  HGR_TAR_CAD_ETP          (etapas/kanban)
  HGR_TAR_CAD_ETP_KBN      (colunas kanban)
  HGR_TAR_CAD_TAREFA       (tarefa principal — ~26k registros)
  HGR_TAR_REG_APONTAMENTO  (apontamentos de horas)
  HGR_TAR_REG_EQP_APOIO    (equipe de apoio)
  HGR_TAR_TAREFA_ANX       (anexos — BLOB: rodar extractor `blobs` depois)

A tabela `hgr_tar_cad_tarefa` já consta como "previamente importada" no
backlog (#654). Este extractor funciona tanto para carga inicial quanto
para revalidação (ON CONFLICT DO NOTHING via mode="insert_only" quando a
tabela já tem dados).
"""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import copy_table, TableReport


TABLES = [
    "HGR_TAR_CAD_ETP",
    "HGR_TAR_CAD_ETP_KBN",
    "HGR_TAR_CAD_TAREFA",
    "HGR_TAR_REG_APONTAMENTO",
    "HGR_TAR_REG_EQP_APOIO",
    "HGR_TAR_TAREFA_ANX",
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
        report = copy_table(
            ora_conn, pg_conn, ora_table,
            mode=mode, pk_col=f"{pg_table}_id", ctx=ctx,
        )
        reports.append(report)
    return reports
