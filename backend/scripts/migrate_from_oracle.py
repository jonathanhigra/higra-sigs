# -*- coding: utf-8 -*-
"""
Orquestrador de migração Oracle (HGRHML) → PostgreSQL (higra_sigs).

Responsabilidades:
- Registrar e executar extractors por fase (0=base, 1=transversais,
  2=indicadores/reuniões/projetos/docs, 3=qualidade, 4=fabricação+
  motores+assistência+service+chamados, 5=laboratório).
- Abrir conexões Oracle e PostgreSQL uma única vez e passar aos extractors.
- Oferecer helper genérico `copy_table(ora_conn, pg_conn, ora_table, ...)`
  para extractors simples table-to-table (DROP+CREATE ou INSERT idempotente).
- Validação opcional pós-carga (count Oracle vs PG) e ajuste de sequências.

As implementações por módulo vivem em:
    backend/scripts/migrators/<modulo>.py
e são descobertas dinamicamente pelo nome declarado em `EXTRACTORS`
(evita import-time failures quando um módulo ainda não existe).

Regras:
- NUNCA migrar schema `crm.*` (já migrado separadamente).
- Preservar IDs originais; ajustar sequências ao final (--fix-seq).
- ON CONFLICT DO NOTHING por idempotência nos extractors.
- Extractors podem optar por DROP+CREATE (para tabelas novas) OU
  INSERT-only (para tabelas já existentes no PG — p.ex. `users`).

Uso:
    python -m backend.scripts.migrate_from_oracle --list
    python -m backend.scripts.migrate_from_oracle --phase 0
    python -m backend.scripts.migrate_from_oracle --module sth_cad_empresa
    python -m backend.scripts.migrate_from_oracle --dry
    python -m backend.scripts.migrate_from_oracle --validate
    python -m backend.scripts.migrate_from_oracle --fix-seq
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from backend.core.config import logger
from backend.database import get_db_connection


ORA_USER = os.getenv("ORA_USER", "hgrhml")
ORA_PASS = os.getenv("ORA_PASS", "")
ORA_DSN = os.getenv("ORA_DSN", "")

# Tabelas `public` já existentes na app que NÃO devem ser DROPadas
# (extractors para elas devem fazer INSERT-only / MERGE).
KEEP_TABLES: set[str] = {
    "users",
    "hgr_stm_cad_tipo_usu",
    "hgr_stm_perm_menu",
    "hgr_stm_usu_reg_tp",
    "beg_dominio",
    "beg_valor_dominio",
    # Módulos sociais/chat/RAG não vêm do Oracle
    "social_posts", "social_follows", "social_post_likes", "social_reposts",
    "social_notifications", "social_dm_conversations", "social_dm_participants",
    "social_dm_messages", "social_blocks", "social_comments",
    "historico_conversas", "historico_chat", "memoria_tecnica",
}

# Schemas cujos prefixos devem ser ignorados na migração.
# CRM já foi migrado separadamente e é INTOCÁVEL.
SKIP_PREFIXES: tuple[str, ...] = ("HGR_CRM_", "HGR_CCO_")


# ============================================================
# REGISTRY — cada fase lista os módulos/extractors em ordem.
# Cada extractor é um import path tipo 'backend.scripts.migrators.<mod>'
# que expõe uma função `run(ora_conn, pg_conn, ctx) -> Report`.
# Os extractors concretos serão criados nas tarefas 647-665.
# ============================================================

@dataclass
class Extractor:
    key: str                      # chave curta (match para --module)
    phase: int                    # 0..5
    module_path: str              # importable module
    description: str

EXTRACTORS: list[Extractor] = [
    # --- FASE 0: base (FKs raiz) ---
    Extractor("sth_cad_empresa",    0, "backend.scripts.migrators.sth_cad_empresa",    "STH_CAD_EMPRESA (tarefa 647)"),
    Extractor("sth_cad_filial",     0, "backend.scripts.migrators.sth_cad_filial",     "STH_CAD_FILIAL (tarefa 648)"),
    Extractor("beg_processo",       0, "backend.scripts.migrators.beg_processo",       "BEG_PROCESSO (tarefa 649)"),
    Extractor("beg_dominio",        0, "backend.scripts.migrators.beg_dominio",        "BEG_DOMINIO + BEG_VALOR_DOMINIO (tarefa 650)"),
    Extractor("hgr_stm_cad_tipo_usu", 0, "backend.scripts.migrators.hgr_stm_cad_tipo_usu", "HGR_STM_CAD_TIPO_USU (tarefa 652)"),
    Extractor("beg_usuarios",       0, "backend.scripts.migrators.beg_usuarios",       "BEG_USUARIOS → public.users (tarefa 651)"),
    Extractor("hgr_stm_usu_reg_tp", 0, "backend.scripts.migrators.hgr_stm_usu_reg_tp", "HGR_STM_USU_REG_TP (tarefa 653)"),
    # --- FASE 1: transversais ---
    Extractor("hgr_tar",            1, "backend.scripts.migrators.hgr_tar",            "Tarefas (tarefa 654)"),
    # --- FASE 2: gestão/comunicação/projetos/docs ---
    Extractor("hgr_ges",            2, "backend.scripts.migrators.hgr_ges",            "Indicadores/metas (tarefa 655)"),
    Extractor("hgr_prj",            2, "backend.scripts.migrators.hgr_prj",            "Projetos (tarefa 656)"),
    Extractor("hgr_reu",            2, "backend.scripts.migrators.hgr_reu",            "Reuniões (tarefa 657)"),
    Extractor("hgr_dct",            2, "backend.scripts.migrators.hgr_dct",            "Documentos + revisões (tarefa 658)"),
    # --- FASE 3: qualidade ---
    Extractor("beg_rq03",           3, "backend.scripts.migrators.beg_rq03",           "RQ03 + análises + evidências (tarefa 659)"),
    Extractor("beg_rq49",           3, "backend.scripts.migrators.beg_rq49",           "RQ49 + análises + avaliações (tarefa 660)"),
    Extractor("beg_rq80",           3, "backend.scripts.migrators.beg_rq80",           "RQ80 auditorias (tarefa 661)"),
    # --- FASE 4: operacional ---
    Extractor("hgr_chk",            4, "backend.scripts.migrators.hgr_chk",            "Fabricação — 63 tabelas (tarefa 662)"),
    Extractor("hgr_mot",            4, "backend.scripts.migrators.hgr_mot",            "Motores/bombas (tarefa 663)"),
    Extractor("hgr_ass",            4, "backend.scripts.migrators.hgr_ass",            "Assistência (tarefa 664)"),
    # --- FASE 5: laboratório ---
    Extractor("hgr_lab",            5, "backend.scripts.migrators.hgr_lab",            "Laboratório (tarefa 665)"),
    # --- BLOBs (pode rodar em paralelo) ---
    Extractor("blobs",              6, "backend.scripts.migrators.blobs",              "BLOBs → filesystem (tarefa 666)"),
]


# ============================================================
# CONTEXT / REPORTING
# ============================================================

@dataclass
class MigrationContext:
    dry_run: bool = False
    batch_size: int = 500
    keep_tables: set[str] = field(default_factory=lambda: set(KEEP_TABLES))
    skip_prefixes: tuple[str, ...] = SKIP_PREFIXES
    incremental: bool = False  # traz apenas registros com UPDATED_AT > last_sync
    since: Optional[str] = None  # ISO datetime para janela incremental (ex: '2026-04-01')


@dataclass
class TableReport:
    table: str
    ok: int = 0
    err: int = 0
    status: str = "PENDING"
    duration_s: float = 0.0
    message: str = ""


@dataclass
class ExtractorReport:
    key: str
    tables: list[TableReport] = field(default_factory=list)
    status: str = "OK"
    message: str = ""

    @property
    def total_ok(self) -> int:
        return sum(t.ok for t in self.tables)

    @property
    def total_err(self) -> int:
        return sum(t.err for t in self.tables)


# ============================================================
# CONEXÕES
# ============================================================

def connect_oracle():
    """Abre conexão Oracle (requer `oracledb` instalado)."""
    try:
        import oracledb  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Pacote `oracledb` não instalado. Rode `pip install oracledb`."
        ) from exc
    if not ORA_PASS or not ORA_DSN:
        raise RuntimeError(
            "ORA_PASS e ORA_DSN devem vir via variáveis de ambiente."
        )
    return oracledb.connect(user=ORA_USER, password=ORA_PASS, dsn=ORA_DSN)


# ============================================================
# HELPERS GENÉRICOS (utilizáveis pelos extractors)
# ============================================================

TYPE_MAP: dict[str, Callable[[Optional[int], Optional[int]], str]] = {
    "NUMBER": lambda p, s: (
        "BIGINT" if s == 0 and p and p > 9 else (
            "INTEGER" if s == 0 else (f"NUMERIC({p},{s})" if p else "NUMERIC")
        )
    ),
    "VARCHAR2": lambda p, s: f"VARCHAR({p})" if p else "VARCHAR(4000)",
    "NVARCHAR2": lambda p, s: f"VARCHAR({p})" if p else "VARCHAR(4000)",
    "CHAR": lambda p, s: f"VARCHAR({p})" if p else "VARCHAR(1)",
    "CLOB": lambda p, s: "TEXT",
    "NCLOB": lambda p, s: "TEXT",
    "BLOB": lambda p, s: "BYTEA",
    "RAW": lambda p, s: "BYTEA",
    "LONG": lambda p, s: "TEXT",
    "LONG RAW": lambda p, s: "BYTEA",
    "DATE": lambda p, s: "TIMESTAMPTZ",
    "FLOAT": lambda p, s: "DOUBLE PRECISION",
    "BINARY_FLOAT": lambda p, s: "REAL",
    "BINARY_DOUBLE": lambda p, s: "DOUBLE PRECISION",
}


def ora_type_to_pg(ora_type: str, precision, scale) -> str:
    t = (ora_type or "").upper()
    for key, fn in TYPE_MAP.items():
        if t.startswith(key):
            return fn(precision, scale)
    if "TIMESTAMP" in t:
        return "TIMESTAMPTZ"
    return "TEXT"


def get_oracle_columns(ora_conn, ora_table: str) -> list[tuple[str, str]]:
    cur = ora_conn.cursor()
    cur.execute(
        """
        SELECT column_name, data_type, data_precision, data_scale
        FROM user_tab_columns
        WHERE table_name = :tn
        ORDER BY column_id
        """,
        {"tn": ora_table.upper()},
    )
    cols = []
    for name, t, p, s in cur.fetchall():
        cols.append((name.lower(), ora_type_to_pg(t, p, s)))
    cur.close()
    return cols


def copy_table(
    ora_conn,
    pg_conn,
    ora_table: str,
    *,
    mode: str = "drop_create",
    pg_schema: str = "public",
    pk_col: Optional[str] = None,
    transform_row: Optional[Callable[[dict], dict]] = None,
    ctx: Optional[MigrationContext] = None,
) -> TableReport:
    """
    Copia tabela Oracle → PostgreSQL.

    mode:
      - "drop_create": DROP TABLE se existir, CREATE com schema Oracle exato.
      - "insert_only": apenas INSERT (tabela já existe no PG).

    pk_col: nome da PK Oracle (default = `<table>_id`). Mapeia para `id` no PG
    quando mode=drop_create.
    """
    ctx = ctx or MigrationContext()
    report = TableReport(table=ora_table.lower())
    start = time.time()

    if ora_table.lower() in ctx.keep_tables and mode == "drop_create":
        report.status = "PROTECTED"
        report.message = "tabela protegida: use mode='insert_only'"
        return report

    if any(ora_table.upper().startswith(p) for p in ctx.skip_prefixes):
        report.status = "SKIPPED"
        report.message = "prefixo pulado (CRM/CCO)"
        return report

    columns = get_oracle_columns(ora_conn, ora_table)
    if not columns:
        report.status = "NO_COLUMNS"
        return report

    pk = pk_col or f"{ora_table.lower()}_id"
    has_pk = any(c[0] == pk for c in columns)

    pg_table_ident = f'{pg_schema}."{ora_table.lower()}"'
    pg_cur = pg_conn.cursor()

    if mode == "drop_create":
        if ctx.dry_run:
            report.status = "DRY_DROP_CREATE"
            pg_cur.close()
            return report
        try:
            pg_cur.execute(f"DROP TABLE IF EXISTS {pg_table_ident} CASCADE")
            col_defs = []
            for col_name, pg_type in columns:
                if col_name == pk and has_pk:
                    col_defs.append(f"id {pg_type} PRIMARY KEY")
                else:
                    col_defs.append(f'"{col_name}" {pg_type}')
            pg_cur.execute(f"CREATE TABLE {pg_table_ident} ({', '.join(col_defs)})")
            pg_conn.commit()
        except Exception as exc:
            pg_conn.rollback()
            pg_cur.close()
            report.status = "CREATE_FAIL"
            report.message = str(exc)[:200]
            return report

    # Janela incremental (opcional): só linhas com UPDATED_AT > since.
    incremental_where = ""
    incremental_params: tuple = ()
    if ctx.incremental and ctx.since and mode == "insert_only":
        col_names = {c[0] for c in columns}
        ts_col = next((c for c in ("updated_at", "dt_atualizacao", "dt_alteracao") if c in col_names), None)
        if ts_col:
            incremental_where = f' WHERE "{ts_col.upper()}" >= TO_TIMESTAMP(:since, \'YYYY-MM-DD"T"HH24:MI:SS\')'
            incremental_params = (ctx.since,)

    # Copiar dados
    ora_cur = ora_conn.cursor()
    if incremental_where:
        ora_cur.execute(
            f'SELECT COUNT(*) FROM "{ora_table.upper()}"{incremental_where}',
            {"since": ctx.since},
        )
    else:
        ora_cur.execute(f'SELECT COUNT(*) FROM "{ora_table.upper()}"')
    total = ora_cur.fetchone()[0]
    if total == 0:
        ora_cur.close()
        pg_cur.close()
        report.status = "EMPTY"
        report.duration_s = round(time.time() - start, 2)
        return report

    if ctx.dry_run:
        ora_cur.close()
        pg_cur.close()
        report.status = "DRY_COPY"
        report.ok = total
        return report

    if incremental_where:
        ora_cur.execute(
            f'SELECT * FROM "{ora_table.upper()}"{incremental_where}',
            {"since": ctx.since},
        )
    else:
        ora_cur.execute(f'SELECT * FROM "{ora_table.upper()}"')
    ora_cols = [d[0].lower() for d in ora_cur.description]
    pg_col_names = [
        "id" if (oc == pk and has_pk and mode == "drop_create") else f'"{oc}"'
        for oc in ora_cols
    ]
    placeholders = ", ".join(["%s"] * len(pg_col_names))
    conflict = " ON CONFLICT DO NOTHING" if mode == "insert_only" else ""
    insert_sql = (
        f"INSERT INTO {pg_table_ident} ({', '.join(pg_col_names)}) "
        f"VALUES ({placeholders}){conflict}"
    )

    import psycopg2
    ok = err = 0
    for ora_row in ora_cur:
        values = []
        for val in ora_row:
            if val is None:
                values.append(None)
            elif hasattr(val, "read"):  # LOB
                try:
                    data = val.read()
                    if isinstance(data, bytes):
                        values.append(psycopg2.Binary(data))
                    else:
                        values.append(str(data) if data else None)
                except Exception:
                    values.append(None)
            else:
                values.append(val)
        if transform_row:
            row_dict = dict(zip(ora_cols, values))
            row_dict = transform_row(row_dict)
            values = [row_dict.get(c) for c in ora_cols]
        try:
            pg_cur.execute(insert_sql, values)
            ok += 1
        except Exception:
            pg_conn.rollback()
            err += 1
            continue
        if ok % ctx.batch_size == 0:
            pg_conn.commit()
    pg_conn.commit()
    ora_cur.close()
    pg_cur.close()

    report.ok = ok
    report.err = err
    report.status = "OK" if err == 0 else "PARTIAL"
    report.duration_s = round(time.time() - start, 2)
    return report


# ============================================================
# VALIDAÇÃO pós-carga
# ============================================================

def validate_counts(ora_conn, pg_conn, tables: list[str]) -> list[dict]:
    results = []
    ora_cur = ora_conn.cursor()
    pg_cur = pg_conn.cursor()
    for t in tables:
        try:
            ora_cur.execute(f'SELECT COUNT(*) FROM "{t.upper()}"')
            ora_count = ora_cur.fetchone()[0]
        except Exception as exc:
            ora_count = -1
        try:
            pg_cur.execute(f'SELECT COUNT(*) FROM public."{t.lower()}"')
            pg_count = pg_cur.fetchone()[0]
        except Exception:
            pg_count = -1
        results.append({
            "table": t.lower(),
            "oracle": ora_count,
            "postgres": pg_count,
            "diff": ora_count - pg_count if ora_count >= 0 and pg_count >= 0 else None,
        })
    ora_cur.close()
    pg_cur.close()
    return results


def fix_sequences(pg_conn) -> int:
    """Ajusta todas as sequências BIGSERIAL de public.* para MAX(id)+1."""
    with pg_conn.cursor() as cur:
        cur.execute("""
            DO $$
            DECLARE r RECORD;
            BEGIN
                FOR r IN (
                    SELECT c.table_schema, c.table_name, c.column_name,
                           pg_get_serial_sequence(c.table_schema||'.'||c.table_name, c.column_name) AS seq
                    FROM information_schema.columns c
                    WHERE c.table_schema = 'public'
                      AND c.column_default LIKE 'nextval%'
                ) LOOP
                    IF r.seq IS NOT NULL THEN
                        EXECUTE format(
                            'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1))',
                            r.seq, r.column_name, r.table_schema, r.table_name
                        );
                    END IF;
                END LOOP;
            END $$;
        """)
    pg_conn.commit()
    return 0


# ============================================================
# EXECUÇÃO
# ============================================================

def resolve_extractors(phase: Optional[int], keys: list[str]) -> list[Extractor]:
    selected = EXTRACTORS
    if phase is not None:
        selected = [e for e in selected if e.phase == phase]
    if keys:
        selected = [e for e in selected if e.key in keys]
    return selected


def run_extractor(ext: Extractor, ora_conn, pg_conn, ctx: MigrationContext) -> ExtractorReport:
    report = ExtractorReport(key=ext.key)
    try:
        mod = importlib.import_module(ext.module_path)
    except ModuleNotFoundError:
        report.status = "NOT_IMPLEMENTED"
        report.message = f"{ext.module_path} ainda não existe (tarefa pendente)"
        return report
    except Exception as exc:
        report.status = "IMPORT_FAIL"
        report.message = str(exc)[:200]
        return report

    run = getattr(mod, "run", None)
    if not callable(run):
        report.status = "NO_RUN"
        report.message = f"{ext.module_path} não expõe run(ora_conn, pg_conn, ctx)"
        return report

    try:
        out = run(ora_conn, pg_conn, ctx)
        if isinstance(out, list):
            report.tables = out
        elif isinstance(out, TableReport):
            report.tables = [out]
        elif isinstance(out, ExtractorReport):
            return out
    except Exception as exc:
        report.status = "RUN_FAIL"
        report.message = str(exc)[:300]
    return report


def _collect_tables_for_extractors(extractors: list[Extractor]) -> list[str]:
    """Descobre a lista de tabelas associadas a cada extractor (para --validate).

    Cada módulo extractor pode expor `TABLES: list[str]` (lista Oracle).
    Quando não expõe, fallback é o próprio `ext.key.upper()`.
    """
    result: list[str] = []
    for ext in extractors:
        try:
            mod = importlib.import_module(ext.module_path)
        except Exception:
            result.append(ext.key.upper())
            continue
        tables = getattr(mod, "TABLES", None)
        if isinstance(tables, (list, tuple)) and tables:
            result.extend(tables)
        else:
            result.append(ext.key.upper())
    # Dedup preservando ordem
    seen = set()
    unique = []
    for t in result:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    return unique


def print_summary(reports: list[ExtractorReport]) -> None:
    logger.info("=" * 60)
    logger.info("RESUMO DA MIGRAÇÃO")
    logger.info("=" * 60)
    for r in reports:
        logger.info(
            f"[{r.status}] {r.key}: ok={r.total_ok} err={r.total_err} {r.message}"
        )
        for t in r.tables:
            if t.status not in ("OK", "EMPTY"):
                logger.info(f"     - {t.table}: {t.status} ({t.message})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Orquestrador Oracle → PostgreSQL")
    parser.add_argument("--list", action="store_true", help="Lista extractors registrados")
    parser.add_argument("--phase", type=int, help="Executa somente uma fase (0..6)")
    parser.add_argument("--module", action="append", default=[], help="Chave do extractor (pode repetir)")
    parser.add_argument("--dry", action="store_true", help="Dry-run (não escreve no PG)")
    parser.add_argument("--validate", action="store_true", help="Apenas valida counts Oracle vs PG")
    parser.add_argument("--fix-seq", action="store_true", help="Ajusta sequências BIGSERIAL pós-carga")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--incremental", action="store_true",
                        help="Re-import incremental: só linhas com UPDATED_AT >= --since")
    parser.add_argument("--since", default=None,
                        help="Data ISO (YYYY-MM-DDTHH:MM:SS) usada com --incremental")
    args = parser.parse_args()

    if args.list:
        for e in EXTRACTORS:
            logger.info(f"  fase {e.phase}  {e.key:25s}  {e.description}")
        return 0

    if args.incremental and not args.since:
        # Default seguro: últimas 24h
        default_since = (dt.datetime.now() - dt.timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
        logger.info(f"--incremental sem --since; usando janela default: >= {default_since}")
        args.since = default_since

    ctx = MigrationContext(
        dry_run=args.dry,
        batch_size=args.batch_size,
        incremental=args.incremental,
        since=args.since,
    )

    # Conexão PG sempre necessária
    pg_conn = get_db_connection()

    if args.fix_seq and not args.validate and not args.phase and not args.module:
        logger.info("Ajustando sequências…")
        fix_sequences(pg_conn)
        pg_conn.close()
        logger.info("Sequências ajustadas.")
        return 0

    # Conexão Oracle necessária para qualquer coisa além de --fix-seq
    ora_conn = None
    try:
        ora_conn = connect_oracle()
    except Exception as exc:
        logger.error(f"Falha ao conectar Oracle: {exc}")
        pg_conn.close()
        return 2

    try:
        if args.validate:
            tables = _collect_tables_for_extractors(resolve_extractors(args.phase, args.module))
            results = validate_counts(ora_conn, pg_conn, tables)
            zero_diff = sum(1 for r in results if r["diff"] == 0)
            for r in results:
                flag = "OK" if r["diff"] == 0 else ("MISS" if r["postgres"] < 0 else "DIFF")
                logger.info(
                    f"  [{flag}] {r['table']:35s}  ora={r['oracle']:>8}  pg={r['postgres']:>8}  diff={r['diff']}"
                )
            logger.info(f"Validação: {zero_diff}/{len(results)} tabelas com diff=0")
            return 0 if zero_diff == len(results) else 4

        extractors = resolve_extractors(args.phase, args.module)
        if not extractors:
            logger.warning("Nenhum extractor selecionado.")
            return 1

        logger.info(f"Executando {len(extractors)} extractor(es) (dry={args.dry})…")
        reports: list[ExtractorReport] = []
        for ext in extractors:
            logger.info(f"→ [{ext.phase}] {ext.key}: {ext.description}")
            reports.append(run_extractor(ext, ora_conn, pg_conn, ctx))

        print_summary(reports)

        if args.fix_seq and not args.dry:
            logger.info("Ajustando sequências pós-carga…")
            fix_sequences(pg_conn)

        any_fail = any(r.status not in ("OK", "NOT_IMPLEMENTED") for r in reports)
        return 0 if not any_fail else 3
    finally:
        try:
            if ora_conn is not None:
                ora_conn.close()
        except Exception:
            pass
        pg_conn.close()


if __name__ == "__main__":
    sys.exit(main())
