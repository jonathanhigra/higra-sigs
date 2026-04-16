# -*- coding: utf-8 -*-
"""
Gera relatório HTML da migração Oracle → PostgreSQL.

Roda a validação de counts em todos os extractors e produz um HTML
autocontido em `backend/uploads/reports/migration_<timestamp>.html`.

Uso:
    python -m backend.scripts.migration_report
    python -m backend.scripts.migration_report --phase 3
    python -m backend.scripts.migration_report --output /tmp/rep.html
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import os
import sys
from pathlib import Path

from backend.core.config import logger
from backend.database import get_db_connection
from backend.scripts.migrate_from_oracle import (
    EXTRACTORS, _collect_tables_for_extractors, connect_oracle,
    resolve_extractors, validate_counts,
)


def _default_output_path() -> Path:
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(os.getenv("UPLOAD_DIR", "backend/uploads")) / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"migration_{ts}.html"


def _render_html(rows: list[dict], phase: int | None) -> str:
    total_ora = sum(r["oracle"] for r in rows if r["oracle"] >= 0)
    total_pg = sum(r["postgres"] for r in rows if r["postgres"] >= 0)
    diff_tables = sum(1 for r in rows if r["diff"] != 0)
    ok_tables = len(rows) - diff_tables
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    phase_label = "todas" if phase is None else f"fase {phase}"

    def row_html(r: dict) -> str:
        status = (
            "ok" if r["diff"] == 0
            else ("miss" if r["postgres"] < 0
            else "diff")
        )
        return (
            f'<tr class="{status}">'
            f'<td>{html.escape(str(r["table"]))}</td>'
            f'<td class="num">{r["oracle"]}</td>'
            f'<td class="num">{r["postgres"]}</td>'
            f'<td class="num">{r["diff"]}</td>'
            f'<td>{status.upper()}</td>'
            f'</tr>'
        )

    rows_html = "\n".join(row_html(r) for r in rows)

    return f"""<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"/>
<title>Relatório de migração Oracle → PostgreSQL</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 2rem; color: #111; }}
  h1 {{ margin: 0 0 .5rem 0; }}
  .meta {{ color: #555; margin-bottom: 1.5rem; }}
  .kpis {{ display: flex; gap: 1rem; margin-bottom: 1rem; }}
  .kpi {{ background: #f5f5f5; padding: .75rem 1rem; border-radius: 8px; min-width: 120px; }}
  .kpi strong {{ display: block; font-size: 1.5rem; }}
  table {{ border-collapse: collapse; width: 100%; font-size: .9rem; }}
  th, td {{ padding: .4rem .6rem; text-align: left; border-bottom: 1px solid #e5e5e5; }}
  th {{ background: #f5f5f5; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  tr.ok {{ background: #f0fff4; }}
  tr.diff {{ background: #fff5f5; }}
  tr.miss {{ background: #fffbea; }}
  .legend {{ margin-top: 1rem; font-size: .85rem; color: #666; }}
</style>
</head>
<body>
<h1>Relatório de migração Oracle → PostgreSQL</h1>
<p class="meta">Gerado em {now} — escopo: {phase_label}</p>
<div class="kpis">
  <div class="kpi">Tabelas<strong>{len(rows)}</strong></div>
  <div class="kpi">Diff 0<strong style="color:#2f855a">{ok_tables}</strong></div>
  <div class="kpi">Com divergência<strong style="color:#c53030">{diff_tables}</strong></div>
  <div class="kpi">Total Oracle<strong>{total_ora:,}</strong></div>
  <div class="kpi">Total PG<strong>{total_pg:,}</strong></div>
</div>
<table>
  <thead>
    <tr><th>Tabela</th><th>Oracle</th><th>PostgreSQL</th><th>Diff</th><th>Status</th></tr>
  </thead>
  <tbody>
    {rows_html}
  </tbody>
</table>
<p class="legend">Linhas verdes: contagens iguais. Amarelas: tabela ausente no destino. Vermelhas: divergência numérica.</p>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Relatório HTML de migração")
    parser.add_argument("--phase", type=int, help="Escopo: uma fase (0..6)")
    parser.add_argument("--module", action="append", default=[], help="Escopo: extractors específicos")
    parser.add_argument("--output", default=None, help="Caminho do HTML de saída")
    args = parser.parse_args()

    extractors = resolve_extractors(args.phase, args.module)
    if not extractors:
        logger.warning("Nenhum extractor no escopo.")
        return 1
    tables = _collect_tables_for_extractors(extractors)

    pg_conn = get_db_connection()
    try:
        ora_conn = connect_oracle()
    except Exception as exc:
        logger.error(f"Falha ao conectar Oracle: {exc}")
        pg_conn.close()
        return 2
    try:
        rows = validate_counts(ora_conn, pg_conn, tables)
    finally:
        try:
            ora_conn.close()
        except Exception:
            pass
        pg_conn.close()

    out = Path(args.output) if args.output else _default_output_path()
    out.write_text(_render_html(rows, args.phase), encoding="utf-8")
    logger.info(f"Relatório salvo: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
