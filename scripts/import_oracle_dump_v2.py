#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migração Oracle SQL*Plus dump → PostgreSQL v2
Mapeia colunas Oracle → PostgreSQL automaticamente.
"""

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import get_db_connection


# Mapeamento global de colunas Oracle → PostgreSQL
# Regra: {table}_{id} → id  (PK), CREATED → created_at, UPDATED → updated_at, CREATEDBY → created_by
COLUMN_MAP = {
    'created': 'created_at',
    'updated': 'updated_at',
    'createdby': 'created_by',
    'updatedby': 'updated_by',
}


def get_pg_columns(conn, table_name):
    """Retorna set de colunas existentes na tabela PostgreSQL."""
    cur = conn.cursor()
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s",
        (table_name,)
    )
    cols = {r[0] for r in cur.fetchall()}
    cur.close()
    return cols


def map_column(oracle_col, table_name, pg_columns):
    """Mapeia coluna Oracle para PostgreSQL."""
    col_lower = oracle_col.lower()

    # PK: TABELA_ID → id
    pk_name = f"{table_name}_id"
    if col_lower == pk_name and 'id' in pg_columns:
        return 'id'

    # Mapeamento global
    if col_lower in COLUMN_MAP and COLUMN_MAP[col_lower] in pg_columns:
        return COLUMN_MAP[col_lower]

    # Nome original lowercase
    if col_lower in pg_columns:
        return col_lower

    return None  # Coluna não existe no PG


def parse_oracle_date(match):
    date_str = match.group(1)
    try:
        parts = date_str.split('/')
        if len(parts) == 3:
            day, month, year = parts
            year = int(year)
            if year < 50:
                year += 2000
            else:
                year += 1900
            return f"'{year:04d}-{int(month):02d}-{int(day):02d}'"
    except Exception:
        pass
    return f"'{date_str}'"


def parse_oracle_timestamp(match):
    ts_str = match.group(1)
    try:
        parts = ts_str.split(' ')
        date_part = parts[0]
        time_part = parts[1] if len(parts) > 1 else '00:00:00'
        d_parts = date_part.split('/')
        if len(d_parts) == 3:
            day, month, year = d_parts
            year = int(year)
            if year < 100:
                year += 2000 if year < 50 else 1900
            return f"'{year:04d}-{int(month):02d}-{int(day):02d} {time_part}'"
    except Exception:
        pass
    return f"'{ts_str}'"


def parse_values(values_str):
    """Parse values string into individual values, respecting quotes."""
    values = []
    current = ''
    in_quote = False
    depth = 0

    for ch in values_str:
        if ch == "'" and not in_quote:
            in_quote = True
            current += ch
        elif ch == "'" and in_quote:
            current += ch
            # Check for escaped quote
            if len(current) >= 2 and current[-2] == "'":
                continue
            in_quote = False
        elif ch == ',' and not in_quote and depth == 0:
            values.append(current.strip())
            current = ''
        elif ch == '(' and not in_quote:
            depth += 1
            current += ch
        elif ch == ')' and not in_quote:
            depth -= 1
            current += ch
        else:
            current += ch

    if current.strip():
        values.append(current.strip())

    return values


def convert_and_insert(conn, line, pg_table_cache):
    """Converte INSERT Oracle e executa no PG."""
    # Limpar
    line = line.replace('"', '')
    line = re.sub(r"to_date\('([^']+)','[^']+'\)", parse_oracle_date, line, flags=re.IGNORECASE)
    line = re.sub(r"to_timestamp\('([^']+)','[^']+'\)", parse_oracle_timestamp, line, flags=re.IGNORECASE)
    line = re.sub(r"EMPTY_CLOB\(\)", "NULL", line, flags=re.IGNORECASE)
    line = re.sub(r"EMPTY_BLOB\(\)", "NULL", line, flags=re.IGNORECASE)

    # Extrair tabela, colunas, valores
    match = re.match(r"Insert into HGRHML\.(\w+)\s*\((.+?)\)\s*values\s*\((.+)\);?\s*$", line, re.IGNORECASE | re.DOTALL)
    if not match:
        return None, None

    oracle_table = match.group(1)
    table = oracle_table.lower()
    oracle_columns = [c.strip() for c in match.group(2).split(',')]
    values_str = match.group(3)

    # Cache das colunas PG
    if table not in pg_table_cache:
        pg_cols = get_pg_columns(conn, table)
        if not pg_cols:
            return table, 'TABLE_NOT_FOUND'
        pg_table_cache[table] = pg_cols

    pg_columns = pg_table_cache[table]

    # Parse values
    values = parse_values(values_str)
    if len(values) != len(oracle_columns):
        return table, 'VALUES_MISMATCH'

    # Mapear colunas e filtrar
    mapped_cols = []
    mapped_vals = []
    for i, oracle_col in enumerate(oracle_columns):
        pg_col = map_column(oracle_col, table, pg_columns)
        if pg_col:
            mapped_cols.append(pg_col)
            mapped_vals.append(values[i])

    if not mapped_cols:
        return table, 'NO_COLUMNS_MAPPED'

    # Montar INSERT
    cols_str = ', '.join(mapped_cols)
    vals_str = ', '.join(mapped_vals)
    sql = f"INSERT INTO public.{table} ({cols_str}) VALUES ({vals_str}) ON CONFLICT DO NOTHING"

    cur = conn.cursor()
    try:
        cur.execute(sql)
        return table, 'OK'
    except Exception as e:
        conn.rollback()
        return table, str(e)[:100]
    finally:
        cur.close()


def import_dump(filepath):
    print(f"Lendo {filepath}...")
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Extrair INSERTs
    lines = content.split('\n')
    inserts = []
    current = ''
    for line in lines:
        line = line.strip()
        if line.startswith('Insert into HGRHML.'):
            if current:
                inserts.append(current)
            current = line
        elif current and not line.startswith('--') and not line.startswith('REM') and not line.startswith('SET') and line:
            current += ' ' + line
        if current and current.rstrip().endswith(';'):
            inserts.append(current)
            current = ''
    if current:
        inserts.append(current)

    print(f"Encontrados {len(inserts)} INSERTs")

    conn = get_db_connection()
    pg_table_cache = {}
    table_ok = {}
    table_err = {}
    total_ok = 0
    total_err = 0

    for i, insert_line in enumerate(inserts):
        table, result = convert_and_insert(conn, insert_line, pg_table_cache)

        if result == 'OK':
            table_ok[table] = table_ok.get(table, 0) + 1
            total_ok += 1
        elif table:
            key = f"{table}: {result}"
            table_err[key] = table_err.get(key, 0) + 1
            total_err += 1

        if (i + 1) % 1000 == 0:
            conn.commit()
            print(f"  {i+1}/{len(inserts)} ... OK:{total_ok} ERR:{total_err}")

    conn.commit()

    # Reset sequences
    print("\nAjustando sequências...")
    cur = conn.cursor()
    try:
        cur.execute("""
            DO $$ DECLARE r RECORD; BEGIN
                FOR r IN (
                    SELECT schemaname, tablename, column_name,
                           pg_get_serial_sequence(schemaname||'.'||tablename, column_name) as seq
                    FROM information_schema.columns c
                    JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = c.table_schema
                    WHERE c.column_default LIKE 'nextval%%' AND t.schemaname = 'public'
                ) LOOP
                    IF r.seq IS NOT NULL THEN
                        EXECUTE format('SELECT setval(%%L, COALESCE((SELECT MAX(%%I) FROM %%I.%%I), 1))',
                            r.seq, r.column_name, r.schemaname, r.tablename);
                    END IF;
                END LOOP;
            END $$;
        """)
        conn.commit()
        print("OK")
    except Exception as e:
        conn.rollback()
        print(f"Erro: {e}")
    cur.close()

    # Relatório
    print(f"\n{'='*60}")
    print(f"MIGRAÇÃO v2 CONCLUÍDA")
    print(f"{'='*60}")
    print(f"Total OK: {total_ok}")
    print(f"Total Erros: {total_err}")
    print(f"\nTabelas importadas ({len(table_ok)}):")
    for t, c in sorted(table_ok.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c} registros")

    if table_err:
        print(f"\nErros ({len(table_err)} tipos, top 20):")
        for err, count in sorted(table_err.items(), key=lambda x: -x[1])[:20]:
            print(f"  [{count}x] {err}")

    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    filepath = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\OneDrive - HIGRA INDL LTDA\Área de Trabalho\db_portalsigs.sql"
    if not os.path.exists(filepath):
        print(f"Arquivo não encontrado: {filepath}")
        sys.exit(1)
    import_dump(filepath)
