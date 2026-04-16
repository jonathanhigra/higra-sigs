# -*- coding: utf-8 -*-
"""
Extractor: BLOBs → filesystem + metadata no PG.

Motivação: armazenar BLOBs (fotos, anexos, assinaturas) inline no PG
consome muito espaço e é lento para servir via HTTP. Migramos para o
diretório `backend/uploads/<tabela>/<id>_<filename>` e gravamos apenas
o caminho/mime/size na tabela.

Tabelas BLOB conhecidas:
  HGR_RQ03_REG_ANX, BEG_RQ49_REG_ANX, BEG_RQ80_EVID
  HGR_TAR_TAREFA_ANX, HGR_PRJ_REG_ANX
  HGR_ASS_ATN_REG_ANX, HGR_CHM_REG_ANX
  HGR_MOT_REG_ANX, HGR_MOT_REG_DES
  STH_REU_COM_ANEXO, HGR_COM_CADASTRO_EVID

Estratégia: para cada tabela, identifica a coluna BLOB + filename +
mime type, extrai para filesystem, atualiza registro com `file_path`.
"""
from __future__ import annotations

import os
from pathlib import Path

from backend.scripts.migrate_from_oracle import TableReport


# (tabela_oracle, coluna_blob, coluna_filename, coluna_mime)
BLOB_TABLES: list[tuple[str, str, str, str]] = [
    ("HGR_RQ03_REG_ANX",   "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("BEG_RQ49_REG_ANX",   "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("BEG_RQ80_EVID",      "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_TAR_TAREFA_ANX", "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_PRJ_REG_ANX",    "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_ASS_ATN_REG_ANX","ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_CHM_REG_ANX",    "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_MOT_REG_ANX",    "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_MOT_REG_DES",    "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("STH_REU_COM_ANEXO",  "ARQUIVO",  "ARQUIVO_FILENAME",  "ARQUIVO_MIMETYPE"),
    ("HGR_COM_CADASTRO_EVID", "ARQUIVO", "ARQUIVO_FILENAME", "ARQUIVO_MIMETYPE"),
]


def _upload_root() -> Path:
    root = Path(os.getenv("UPLOAD_DIR", "backend/uploads"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_filename(name: str | None, fallback: str) -> str:
    name = (name or "").strip() or fallback
    # Remove path separators defensivamente
    return name.replace("/", "_").replace("\\", "_").replace("..", "_")


def _ensure_fs_columns(pg_conn, pg_table: str) -> None:
    """Adiciona colunas de metadata se ainda não existirem."""
    with pg_conn.cursor() as cur:
        for ddl in (
            f'ALTER TABLE public."{pg_table}" ADD COLUMN IF NOT EXISTS file_path TEXT',
            f'ALTER TABLE public."{pg_table}" ADD COLUMN IF NOT EXISTS file_size BIGINT',
        ):
            try:
                cur.execute(ddl)
            except Exception:
                pg_conn.rollback()
    pg_conn.commit()


def _migrate_one(ora_conn, pg_conn, ora_table: str, blob_col: str,
                 fname_col: str, mime_col: str, ctx) -> TableReport:
    pg_table = ora_table.lower()
    report = TableReport(table=pg_table)

    # Verifica se tabela existe no PG
    with pg_conn.cursor() as cur:
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=%s)",
            (pg_table,),
        )
        if not cur.fetchone()[0]:
            report.status = "MISSING_TABLE"
            return report

    _ensure_fs_columns(pg_conn, pg_table)
    dest_dir = _upload_root() / pg_table
    dest_dir.mkdir(parents=True, exist_ok=True)

    if ctx.dry_run:
        report.status = "DRY"
        return report

    try:
        ora_cur = ora_conn.cursor()
        ora_cur.execute(
            f'SELECT ID, "{blob_col}", "{fname_col}", "{mime_col}" '
            f'FROM "{ora_table}" WHERE "{blob_col}" IS NOT NULL'
        )
    except Exception as exc:
        report.status = "ORA_FAIL"
        report.message = str(exc)[:200]
        return report

    with pg_conn.cursor() as pg_cur:
        for row in ora_cur:
            rec_id, blob, fname, mime = row
            if not blob:
                continue
            try:
                data = blob.read() if hasattr(blob, "read") else blob
                if not isinstance(data, (bytes, bytearray)):
                    report.err += 1
                    continue
                clean_name = _safe_filename(fname, f"file_{rec_id}.bin")
                out_path = dest_dir / f"{rec_id}_{clean_name}"
                out_path.write_bytes(data)
                pg_cur.execute(
                    f'UPDATE public."{pg_table}" '
                    f'SET file_path = %s, file_size = %s WHERE id = %s',
                    (str(out_path.as_posix()), len(data), rec_id),
                )
                report.ok += 1
            except Exception:
                pg_conn.rollback()
                report.err += 1
        pg_conn.commit()
    ora_cur.close()
    report.status = "OK" if report.err == 0 else "PARTIAL"
    return report


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    reports: list[TableReport] = []
    for ora_table, blob_col, fname_col, mime_col in BLOB_TABLES:
        reports.append(_migrate_one(
            ora_conn, pg_conn, ora_table, blob_col, fname_col, mime_col, ctx
        ))
    return reports
