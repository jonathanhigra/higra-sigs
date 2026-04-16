#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migração Oracle SQL*Plus dump → PostgreSQL (higra_sigs)

Lê o arquivo db_portalsigs.sql exportado do Oracle e importa no PostgreSQL.
Converte:
- to_date('DD/MM/RR','DD/MM/RR') → timestamp
- HGRHML.TABELA → public.tabela (lowercase)
- NUMBER → INTEGER/NUMERIC
- VARCHAR2 → VARCHAR
- CLOB → TEXT
- BLOB → BYTEA (skip nos inserts)

Uso:
  python scripts/import_oracle_dump.py "C:\path\to\db_portalsigs.sql"
"""

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import get_db_connection
from backend.core.config import logger


def parse_oracle_date(match):
    """Converte to_date('DD/MM/RR','DD/MM/RR') para string de data PostgreSQL."""
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
    """Converte to_timestamp('...','DD/MM/RR HH24:MI:SS...') para string PostgreSQL."""
    ts_str = match.group(1)
    try:
        # Tentar vários formatos
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


def convert_insert(line):
    """Converte um INSERT Oracle para PostgreSQL."""
    # Remover schema HGRHML.
    line = line.replace('HGRHML.', 'public.')
    line = line.replace('"', '')

    # Converter to_date()
    line = re.sub(
        r"to_date\('([^']+)','[^']+'\)",
        parse_oracle_date,
        line,
        flags=re.IGNORECASE
    )

    # Converter to_timestamp()
    line = re.sub(
        r"to_timestamp\('([^']+)','[^']+'\)",
        parse_oracle_timestamp,
        line,
        flags=re.IGNORECASE
    )

    # Converter EMPTY_CLOB() e EMPTY_BLOB() para NULL
    line = re.sub(r"EMPTY_CLOB\(\)", "NULL", line, flags=re.IGNORECASE)
    line = re.sub(r"EMPTY_BLOB\(\)", "NULL", line, flags=re.IGNORECASE)

    # Lowercase table name
    match = re.match(r"Insert into public\.(\w+)\s*\((.+?)\)\s*values\s*\((.+)\);?$", line, re.IGNORECASE | re.DOTALL)
    if not match:
        return None

    table = match.group(1).lower()
    columns_str = match.group(2)
    values_str = match.group(3)

    # Lowercase column names
    columns = [c.strip().lower() for c in columns_str.split(',')]
    columns_pg = ', '.join(columns)

    # Montar INSERT PostgreSQL
    pg_sql = f"INSERT INTO public.{table} ({columns_pg}) VALUES ({values_str}) ON CONFLICT DO NOTHING"

    return pg_sql, table


def import_dump(filepath):
    """Importa o dump Oracle para PostgreSQL."""
    print(f"Lendo {filepath}...")

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Extrair todos os INSERTs
    lines = content.split('\n')
    inserts = []
    current_insert = ''

    for line in lines:
        line = line.strip()
        if line.startswith('Insert into HGRHML.'):
            if current_insert:
                inserts.append(current_insert)
            current_insert = line
        elif current_insert and not line.startswith('--') and not line.startswith('REM') and not line.startswith('SET') and line:
            current_insert += ' ' + line

        if current_insert and current_insert.rstrip().endswith(';'):
            inserts.append(current_insert)
            current_insert = ''

    if current_insert:
        inserts.append(current_insert)

    print(f"Encontrados {len(inserts)} INSERTs")

    # Conectar ao PostgreSQL
    conn = get_db_connection()
    cur = conn.cursor()

    # Processar por tabela
    table_counts = {}
    errors = {}
    skipped = 0

    for i, insert_line in enumerate(inserts):
        try:
            result = convert_insert(insert_line)
            if not result:
                skipped += 1
                continue

            pg_sql, table = result

            try:
                cur.execute(pg_sql)
                table_counts[table] = table_counts.get(table, 0) + 1

                # Commit a cada 500 registros
                if (i + 1) % 500 == 0:
                    conn.commit()
                    print(f"  Processados {i+1}/{len(inserts)}...")

            except Exception as e:
                conn.rollback()
                error_key = f"{table}: {str(e)[:80]}"
                if error_key not in errors:
                    errors[error_key] = 0
                errors[error_key] += 1

        except Exception as e:
            skipped += 1

    conn.commit()

    # Relatório
    print(f"\n{'='*60}")
    print(f"MIGRAÇÃO CONCLUÍDA")
    print(f"{'='*60}")
    print(f"Total INSERTs processados: {len(inserts)}")
    print(f"Skipped (parse error): {skipped}")
    print(f"\nTabelas importadas ({len(table_counts)}):")
    for table, count in sorted(table_counts.items(), key=lambda x: -x[1]):
        print(f"  {table}: {count} registros")

    if errors:
        print(f"\nErros ({len(errors)} tipos):")
        for err, count in sorted(errors.items(), key=lambda x: -x[1])[:20]:
            print(f"  [{count}x] {err}")

    # Reset sequences
    print(f"\nAjustando sequências...")
    try:
        cur.execute("""
            DO $$
            DECLARE r RECORD;
            BEGIN
                FOR r IN (
                    SELECT schemaname, tablename, column_name,
                           pg_get_serial_sequence(schemaname||'.'||tablename, column_name) as seq
                    FROM information_schema.columns c
                    JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = c.table_schema
                    WHERE c.column_default LIKE 'nextval%%' AND t.schemaname = 'public'
                ) LOOP
                    IF r.seq IS NOT NULL THEN
                        EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1))',
                            r.seq, r.column_name, r.schemaname, r.tablename);
                    END IF;
                END LOOP;
            END $$;
        """)
        conn.commit()
        print("Sequências ajustadas.")
    except Exception as e:
        conn.rollback()
        print(f"Erro ao ajustar sequências: {e}")

    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        filepath = r"C:\Users\user\OneDrive - HIGRA INDL LTDA\Área de Trabalho\db_portalsigs.sql"
    else:
        filepath = sys.argv[1]

    if not os.path.exists(filepath):
        print(f"Arquivo não encontrado: {filepath}")
        sys.exit(1)

    import_dump(filepath)
