# -*- coding: utf-8 -*-
"""
Extractor: HGRHML.BEG_DOMINIO + HGRHML.BEG_VALOR_DOMINIO.

Duas tabelas relacionadas:
- BEG_DOMINIO  (id, nome, descricao, ativo) — PK `beg_dominio_id`
- BEG_VALOR_DOMINIO (id, beg_dominio_id, vlr_exibicao, vlr_retorno, ordem, ativo)
  — PK `beg_valor_dominio_id`, FK `beg_dominio_id`.

Já existe seed idempotente com metadata vinda do APEX export
(tarefa 581 — `seed_beg_dominio_from_apex`). Aqui fazemos a carga real
dos valores (vlr_exibicao/vlr_retorno) que estão no Oracle.

Como `beg_dominio` foi criada pelo bootstrap da app (sem a PK = id Oracle),
fazemos INSERT-only com ON CONFLICT DO NOTHING pela coluna `nome` (unique).
Para `beg_valor_dominio` fazemos INSERT-only também (match por par
(beg_dominio_id, vlr_retorno)).
"""
from __future__ import annotations

import psycopg2
from backend.scripts.migrate_from_oracle import TableReport

TABLES = ["BEG_DOMINIO", "BEG_VALOR_DOMINIO"]


def _ora_fetchall(ora_conn, sql: str) -> list[tuple]:
    cur = ora_conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    return rows


def _migrate_dominios(ora_conn, pg_conn) -> TableReport:
    report = TableReport(table="beg_dominio")
    rows = _ora_fetchall(
        ora_conn,
        'SELECT BEG_DOMINIO_ID, NOME, DESCRICAO, ATIVO FROM "BEG_DOMINIO"',
    )
    if not rows:
        report.status = "EMPTY"
        return report
    with pg_conn.cursor() as cur:
        for ora_id, nome, descricao, ativo in rows:
            try:
                cur.execute(
                    """
                    INSERT INTO public.beg_dominio (nome, descricao, ativo)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (nome) DO UPDATE SET
                        descricao = COALESCE(EXCLUDED.descricao, public.beg_dominio.descricao),
                        ativo = EXCLUDED.ativo
                    """,
                    (nome, descricao, ativo or "S"),
                )
                report.ok += 1
            except Exception as exc:
                pg_conn.rollback()
                report.err += 1
    pg_conn.commit()
    report.status = "OK" if report.err == 0 else "PARTIAL"
    return report


def _migrate_valores(ora_conn, pg_conn) -> TableReport:
    report = TableReport(table="beg_valor_dominio")
    # Trazemos o NOME do domínio do Oracle para mapear para o id do PG (que
    # é independente do id Oracle, já que beg_dominio.id é BIGSERIAL).
    rows = _ora_fetchall(
        ora_conn,
        """
        SELECT D.NOME AS DOM_NOME, V.VLR_EXIBICAO, V.VLR_RETORNO, V.ORDEM, V.ATIVO
        FROM "BEG_VALOR_DOMINIO" V
        JOIN "BEG_DOMINIO" D ON D.BEG_DOMINIO_ID = V.BEG_DOMINIO_ID
        """,
    )
    if not rows:
        report.status = "EMPTY"
        return report

    # Cache nome → pg_id
    name_to_id: dict[str, int] = {}
    with pg_conn.cursor() as cur:
        cur.execute("SELECT id, nome FROM public.beg_dominio")
        for pg_id, nome in cur.fetchall():
            name_to_id[nome] = pg_id

        for dom_nome, vlr_exibicao, vlr_retorno, ordem, ativo in rows:
            dom_pg_id = name_to_id.get(dom_nome)
            if dom_pg_id is None:
                report.err += 1
                continue
            try:
                cur.execute(
                    """
                    INSERT INTO public.beg_valor_dominio
                        (beg_dominio_id, vlr_exibicao, vlr_retorno, ordem, ativo)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (dom_pg_id, vlr_exibicao, vlr_retorno, ordem, ativo or "S"),
                )
                report.ok += 1
            except Exception:
                pg_conn.rollback()
                report.err += 1
    pg_conn.commit()
    report.status = "OK" if report.err == 0 else "PARTIAL"
    return report


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    if ctx.dry_run:
        return [
            TableReport(table="beg_dominio", status="DRY"),
            TableReport(table="beg_valor_dominio", status="DRY"),
        ]
    return [
        _migrate_dominios(ora_conn, pg_conn),
        _migrate_valores(ora_conn, pg_conn),
    ]
