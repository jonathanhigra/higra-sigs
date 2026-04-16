# -*- coding: utf-8 -*-
"""
Seed idempotente dos 265 LOVs do APEX (app 108) para `public.beg_dominio`.

Fonte canônica: C:\\Users\\user\\Downloads\\f108_extract\\f108.sql
Seção: application/shared_components/user_interface/lovs/* (265 blocos
`wwv_flow_imp_shared.create_list_of_values(...)`).

Estratégia:
- Parse regex dos blocos shared LOV → nome, source_type, query_table,
  return_column_name, display_column_name, query.
- Garante colunas de metadata em `beg_dominio` (source_type, query_table,
  return_column, display_column, lov_query, apex_id).
- UPSERT por `nome` (chave UNIQUE já existente).
- Não altera `beg_valor_dominio`: esses 265 são LOVs do tipo TABLE/SQL/
  LEGACY_SQL (dados vivem nas próprias tabelas de origem). LOVs STATIC
  foram vistos apenas em plugins internos do APEX (fora do escopo SIGS).

Uso:
    python -m backend.scripts.seed_beg_dominio_from_apex
    python -m backend.scripts.seed_beg_dominio_from_apex --dry
    python -m backend.scripts.seed_beg_dominio_from_apex --source <path>
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Optional

from backend.database import get_db_connection, ensure_table_columns
from backend.core.config import logger


DEFAULT_SOURCE = r"C:\Users\user\Downloads\f108_extract\f108.sql"

# Regex para isolar cada bloco shared LOV
BLOCK_RE = re.compile(
    r"wwv_flow_imp_shared\.create_list_of_values\(\s*(.*?)\);",
    re.DOTALL,
)

# Chaves extraídas dentro de um bloco: `,p_<chave>=>'<valor>'` ou
# `,p_<chave>=>wwv_flow_imp.id(<num>)`. Usamos regex permissiva.
KEY_RE = re.compile(r",?\s*p_([a-z_]+)\s*=>\s*(wwv_flow_imp\.id\(\d+\)|'((?:[^']|'')*)'|[0-9]+)")


def parse_block(block: str) -> dict:
    """Extrai chaves relevantes de um bloco create_list_of_values."""
    info: dict = {}
    for m in KEY_RE.finditer(block):
        key = m.group(1)
        raw = m.group(2)
        val: Optional[str]
        if raw.startswith("wwv_flow_imp.id"):
            val = raw[len("wwv_flow_imp.id("):-1]  # captura só o número
        elif m.group(3) is not None:
            val = m.group(3).replace("''", "'")
        else:
            val = raw
        info[key] = val
    return info


def parse_file(path: str) -> list[dict]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"APEX export não encontrado: {path}")
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        text = fh.read()

    # Filtra apenas os blocos dentro de shared_components/user_interface/lovs.
    # Estratégia simples: achar todas as ocorrências e manter apenas as que
    # têm p_lov_name (shared LOVs têm sempre; plugin LOVs não).
    blocks = BLOCK_RE.findall(text)
    lovs: list[dict] = []
    seen: set[str] = set()
    for block in blocks:
        info = parse_block(block)
        nome = info.get("lov_name")
        if not nome:
            continue
        # Evitar duplicatas silenciosas (mesma chave repetida não deve ocorrer,
        # mas garantimos idempotência)
        if nome in seen:
            continue
        seen.add(nome)
        lovs.append(info)
    return lovs


def ensure_metadata_columns(conn) -> None:
    ensure_table_columns(
        conn,
        "beg_dominio",
        [
            ("source_type", "source_type VARCHAR(20)"),
            ("query_table", "query_table VARCHAR(100)"),
            ("return_column", "return_column VARCHAR(100)"),
            ("display_column", "display_column VARCHAR(100)"),
            ("lov_query", "lov_query TEXT"),
            ("apex_id", "apex_id VARCHAR(40)"),
        ],
    )


def upsert_lov(cur, lov: dict) -> str:
    """Retorna 'insert' | 'update' | 'skip'."""
    nome = lov["lov_name"]
    payload = {
        "nome": nome,
        "descricao": f"APEX LOV migrado (source_type={lov.get('source_type', 'N/A')})",
        "source_type": lov.get("source_type"),
        "query_table": lov.get("query_table"),
        "return_column": lov.get("return_column_name"),
        "display_column": lov.get("display_column_name"),
        "lov_query": lov.get("query"),
        "apex_id": lov.get("id"),
    }
    cur.execute(
        """
        INSERT INTO public.beg_dominio
            (nome, descricao, ativo, source_type, query_table, return_column,
             display_column, lov_query, apex_id)
        VALUES (%(nome)s, %(descricao)s, 'S', %(source_type)s, %(query_table)s,
                %(return_column)s, %(display_column)s, %(lov_query)s, %(apex_id)s)
        ON CONFLICT (nome) DO UPDATE SET
            descricao      = EXCLUDED.descricao,
            source_type    = EXCLUDED.source_type,
            query_table    = EXCLUDED.query_table,
            return_column  = EXCLUDED.return_column,
            display_column = EXCLUDED.display_column,
            lov_query      = EXCLUDED.lov_query,
            apex_id        = EXCLUDED.apex_id
        RETURNING (xmax = 0) AS inserted
        """,
        payload,
    )
    row = cur.fetchone()
    return "insert" if row and row[0] else "update"


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed 265 LOVs APEX → beg_dominio")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Caminho do f108.sql")
    parser.add_argument("--dry", action="store_true", help="Somente relata, não grava")
    args = parser.parse_args()

    logger.info(f"Lendo APEX export: {args.source}")
    lovs = parse_file(args.source)
    logger.info(f"LOVs encontrados: {len(lovs)}")

    if not lovs:
        logger.warning("Nenhum LOV encontrado — abortando.")
        return 1

    # Contagem por tipo (visibilidade)
    by_type: dict[str, int] = {}
    for lov in lovs:
        by_type[lov.get("source_type", "UNKNOWN")] = by_type.get(lov.get("source_type", "UNKNOWN"), 0) + 1
    logger.info(f"Distribuição por source_type: {by_type}")

    if args.dry:
        for lov in lovs[:10]:
            logger.info(f"  [dry] {lov.get('lov_name')} ({lov.get('source_type')})")
        logger.info(f"  [dry] ... e mais {max(0, len(lovs) - 10)} LOVs")
        return 0

    conn = get_db_connection()
    try:
        ensure_metadata_columns(conn)
        conn.commit()
        inserted = updated = 0
        with conn.cursor() as cur:
            for lov in lovs:
                result = upsert_lov(cur, lov)
                if result == "insert":
                    inserted += 1
                elif result == "update":
                    updated += 1
        conn.commit()
        logger.info(f"Seed concluído: {inserted} inseridos, {updated} atualizados, total {len(lovs)}.")
        return 0
    except Exception as exc:
        conn.rollback()
        logger.error(f"Falha ao popular beg_dominio: {exc}")
        return 2
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
