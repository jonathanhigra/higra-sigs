#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sincroniza colunas: lê DDL do Oracle dump e adiciona colunas faltantes no PostgreSQL.
Converte tipos Oracle → PostgreSQL.
"""

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import get_db_connection

# Mapeamento Oracle → PostgreSQL
TYPE_MAP = {
    'NUMBER': 'NUMERIC',
    'VARCHAR2': 'VARCHAR',
    'CHAR': 'VARCHAR',
    'CLOB': 'TEXT',
    'BLOB': 'BYTEA',
    'DATE': 'TIMESTAMPTZ',
    'TIMESTAMP': 'TIMESTAMPTZ',
    'NVARCHAR2': 'VARCHAR',
    'NCLOB': 'TEXT',
    'LONG': 'TEXT',
    'RAW': 'BYTEA',
    'FLOAT': 'DOUBLE PRECISION',
}


def parse_oracle_type(oracle_type_str):
    """Converte tipo Oracle para PostgreSQL."""
    t = oracle_type_str.strip().upper()

    # NUMBER(n,0) ou NUMBER(n) → INTEGER/BIGINT
    m = re.match(r'NUMBER\((\d+),\s*0\)', t)
    if m:
        precision = int(m.group(1))
        return 'BIGINT' if precision > 9 else 'INTEGER'

    m = re.match(r'NUMBER\((\d+)\)', t)
    if m:
        precision = int(m.group(1))
        return 'BIGINT' if precision > 9 else 'INTEGER'

    # NUMBER(n,m) → NUMERIC(n,m)
    m = re.match(r'NUMBER\((\d+),\s*(\d+)\)', t)
    if m:
        return f"NUMERIC({m.group(1)},{m.group(2)})"

    # NUMBER sem precisão → NUMERIC
    if t == 'NUMBER' or t == 'NUMBER(*,0)':
        return 'BIGINT'

    # VARCHAR2(n BYTE) ou VARCHAR2(n)
    m = re.match(r'VARCHAR2\((\d+)(?:\s+BYTE)?\)', t)
    if m:
        return f"VARCHAR({m.group(1)})"

    # CHAR(n BYTE) ou CHAR(n)
    m = re.match(r'CHAR\((\d+)(?:\s+BYTE)?\)', t)
    if m:
        return f"VARCHAR({m.group(1)})"

    # Tipos simples
    for oracle_t, pg_t in TYPE_MAP.items():
        if t.startswith(oracle_t):
            return pg_t

    return 'TEXT'  # fallback


def extract_oracle_ddl(filepath):
    """Extrai DDL de todas as tabelas do dump Oracle."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    tables = {}
    for match in re.finditer(
        r'CREATE TABLE "HGRHML"\."(\w+)"\s*\n\s*\((.*?)\)\s*SEGMENT',
        content, re.DOTALL
    ):
        table = match.group(1).lower()
        cols_block = match.group(2)
        columns = []
        for line in cols_block.split('\n'):
            line = line.strip().rstrip(',')
            col_match = re.match(r'"(\w+)"\s+(.+?)(?:\s+DEFAULT\s+.+)?$', line, re.IGNORECASE)
            if col_match:
                col_name = col_match.group(1).lower()
                col_type_raw = col_match.group(2).strip()
                # Remover constraints inline
                col_type_raw = re.sub(r'\s+NOT\s+NULL.*', '', col_type_raw, flags=re.IGNORECASE)
                col_type_raw = re.sub(r'\s+ENABLE.*', '', col_type_raw, flags=re.IGNORECASE)
                pg_type = parse_oracle_type(col_type_raw)
                columns.append((col_name, pg_type))

        if columns:
            tables[table] = columns

    return tables


def sync_columns(filepath):
    oracle_tables = extract_oracle_ddl(filepath)
    print(f"Oracle DDL: {len(oracle_tables)} tabelas")

    conn = get_db_connection()
    cur = conn.cursor()

    # Tabelas PG existentes
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    pg_tables = set(r[0] for r in cur.fetchall())

    total_added = 0
    tables_modified = 0

    for table, oracle_cols in sorted(oracle_tables.items()):
        if table not in pg_tables:
            continue  # Tabela não existe no PG
        if table.startswith('hgr_crm_') or table.startswith('hgr_cco_'):
            continue  # Skip CRM

        # Colunas PG existentes
        cur.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s",
            (table,)
        )
        pg_cols = set(r[0] for r in cur.fetchall())

        added = 0
        for col_name, pg_type in oracle_cols:
            if col_name in pg_cols:
                continue
            # Mapear PK
            pk_name = f"{table}_id"
            if col_name == pk_name and 'id' in pg_cols:
                continue

            # Adicionar coluna
            try:
                sql = f'ALTER TABLE public.{table} ADD COLUMN IF NOT EXISTS {col_name} {pg_type}'
                cur.execute(sql)
                added += 1
            except Exception as e:
                conn.rollback()
                # Silenciar erros comuns
                if 'already exists' not in str(e).lower():
                    pass

        if added > 0:
            conn.commit()
            total_added += added
            tables_modified += 1
            print(f"  {table}: +{added} colunas")

    print(f"\nTotal: {total_added} colunas adicionadas em {tables_modified} tabelas")

    # Criar tabelas Oracle que não existem no PG (exceto CRM)
    tables_created = 0
    for table, oracle_cols in sorted(oracle_tables.items()):
        if table in pg_tables:
            continue
        if table.startswith('hgr_crm_') or table.startswith('hgr_cco_'):
            continue
        if table in ('dept', 'emp'):
            continue

        # Construir CREATE TABLE
        cols_sql = ['id BIGSERIAL PRIMARY KEY']
        for col_name, pg_type in oracle_cols:
            pk_name = f"{table}_id"
            if col_name == pk_name:
                continue  # PK já é 'id'
            cols_sql.append(f"{col_name} {pg_type}")
        cols_sql.append("created_at TIMESTAMPTZ DEFAULT NOW()")

        try:
            sql = f"CREATE TABLE IF NOT EXISTS public.{table} ({', '.join(cols_sql)})"
            cur.execute(sql)
            conn.commit()
            tables_created += 1
            print(f"  CRIADA: {table} ({len(oracle_cols)} colunas)")
        except Exception as e:
            conn.rollback()

    print(f"Tabelas criadas: {tables_created}")

    cur.close()
    conn.close()
    print("Done!")


if __name__ == '__main__':
    filepath = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\OneDrive - HIGRA INDL LTDA\Área de Trabalho\db_portalsigs.sql"
    if not os.path.exists(filepath):
        print(f"Arquivo não encontrado: {filepath}")
        sys.exit(1)
    sync_columns(filepath)
