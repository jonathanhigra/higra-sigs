#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migração Oracle dump → PostgreSQL v3
Fix: parser melhorado para INSERTs multiline com CLOBs.
"""

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import get_db_connection

COLUMN_MAP = {
    'created': 'created_at',
    'updated': 'updated_at',
    'createdby': 'created_by',
    'updatedby': 'updated_by',
}


def get_pg_columns(conn, table_name):
    cur = conn.cursor()
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s",
        (table_name,)
    )
    cols = {r[0] for r in cur.fetchall()}
    cur.close()
    return cols


def map_column(oracle_col, table_name, pg_columns):
    col_lower = oracle_col.lower()
    pk_name = f"{table_name}_id"
    if col_lower == pk_name and 'id' in pg_columns:
        return 'id'
    if col_lower in COLUMN_MAP and COLUMN_MAP[col_lower] in pg_columns:
        return COLUMN_MAP[col_lower]
    if col_lower in pg_columns:
        return col_lower
    return None


def convert_dates(text):
    """Converte to_date/to_timestamp Oracle para formato PG."""
    def fix_date(m):
        ds = m.group(1)
        try:
            parts = ds.split('/')
            if len(parts) == 3:
                d, mo, y = parts
                y = int(y)
                y += 2000 if y < 50 else (1900 if y < 100 else 0)
                return f"'{y:04d}-{int(mo):02d}-{int(d):02d}'"
        except:
            pass
        return f"'{ds}'"

    def fix_ts(m):
        ts = m.group(1)
        try:
            parts = ts.split(' ')
            dp = parts[0].split('/')
            tp = parts[1] if len(parts) > 1 else '00:00:00'
            if len(dp) == 3:
                d, mo, y = dp
                y = int(y)
                y += 2000 if y < 50 else (1900 if y < 100 else 0)
                return f"'{y:04d}-{int(mo):02d}-{int(d):02d} {tp}'"
        except:
            pass
        return f"'{ts}'"

    text = re.sub(r"to_date\('([^']+)','[^']+'\)", fix_date, text, flags=re.IGNORECASE)
    text = re.sub(r"to_timestamp\('([^']+)','[^']+'\)", fix_ts, text, flags=re.IGNORECASE)
    text = re.sub(r"EMPTY_CLOB\(\)", "NULL", text, flags=re.IGNORECASE)
    text = re.sub(r"EMPTY_BLOB\(\)", "NULL", text, flags=re.IGNORECASE)
    return text


def extract_inserts(filepath):
    """Extrai INSERTs do dump, lidando com multiline corretamente."""
    inserts = []
    current = None

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            stripped = line.rstrip('\n').rstrip('\r')

            if stripped.lstrip().startswith('Insert into HGRHML.'):
                if current is not None:
                    inserts.append(current)
                current = stripped.lstrip()
            elif current is not None:
                # Ignorar linhas de comentário/controle
                if stripped.strip().startswith('--') or stripped.strip().startswith('REM') or stripped.strip().startswith('SET DEFINE'):
                    if current is not None:
                        inserts.append(current)
                    current = None
                    continue
                # Continuar o INSERT multiline
                current += ' ' + stripped

            # Verificar se o INSERT terminou
            if current and current.rstrip().endswith(';'):
                inserts.append(current)
                current = None

    if current:
        inserts.append(current)

    return inserts


def process_insert(conn, insert_line, pg_cache):
    """Processa um INSERT Oracle e executa no PG."""
    # Limpar aspas duplas
    clean = insert_line.replace('"', '')
    # Converter datas
    clean = convert_dates(clean)

    # Extrair tabela e colunas
    # Formato: Insert into HGRHML.TABLE (COL1,COL2,...) values (VAL1,VAL2,...);
    m = re.match(r"Insert into HGRHML\.(\w+)\s*\(([^)]+)\)\s*values\s*\((.+)\);?\s*$", clean, re.IGNORECASE | re.DOTALL)
    if not m:
        return None, 'PARSE_FAIL'

    table = m.group(1).lower()
    cols_str = m.group(2)
    vals_str = m.group(3)

    oracle_cols = [c.strip() for c in cols_str.split(',')]

    # Cache PG columns
    if table not in pg_cache:
        pg_cols = get_pg_columns(conn, table)
        if not pg_cols:
            return table, 'TABLE_NOT_FOUND'
        pg_cache[table] = pg_cols

    pg_columns = pg_cache[table]

    # Mapear colunas
    col_indices = []  # (oracle_idx, pg_col_name)
    for i, oc in enumerate(oracle_cols):
        pg_col = map_column(oc, table, pg_columns)
        if pg_col:
            col_indices.append((i, pg_col))

    if not col_indices:
        return table, 'NO_COLUMNS'

    # Parse values respeitando quotes
    values = []
    buf = ''
    in_q = False
    for ch in vals_str:
        if ch == "'" and not in_q:
            in_q = True
            buf += ch
        elif ch == "'" and in_q:
            buf += ch
            # Peek next for escaped quote
            in_q = False
        elif ch == ',' and not in_q:
            values.append(buf.strip())
            buf = ''
        else:
            buf += ch
    if buf.strip():
        values.append(buf.strip())

    if len(values) != len(oracle_cols):
        # Tentar ignorar o mismatch e usar o que temos
        if len(values) < len(oracle_cols):
            return table, f'VALUES_SHORT:{len(values)}vs{len(oracle_cols)}'

    # Filtrar apenas colunas mapeadas
    mapped_cols = []
    mapped_vals = []
    for idx, pg_col in col_indices:
        if idx < len(values):
            val = values[idx]
            # Corrigir números com vírgula brasileira
            if val and val not in ('null', 'NULL') and not val.startswith("'"):
                val = val.replace(',', '.')
            mapped_cols.append(pg_col)
            mapped_vals.append(val)

    if not mapped_cols:
        return table, 'NO_MAPPED_VALUES'

    sql = f"INSERT INTO public.{table} ({', '.join(mapped_cols)}) VALUES ({', '.join(mapped_vals)}) ON CONFLICT DO NOTHING"

    cur = conn.cursor()
    try:
        cur.execute(sql)
        return table, 'OK'
    except Exception as e:
        conn.rollback()
        return table, str(e)[:80]
    finally:
        cur.close()


def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\OneDrive - HIGRA INDL LTDA\Área de Trabalho\db_portalsigs.sql"
    if not os.path.exists(filepath):
        print(f"Arquivo não encontrado: {filepath}")
        return

    print("Extraindo INSERTs...")
    inserts = extract_inserts(filepath)
    print(f"Total: {len(inserts)} INSERTs")

    conn = get_db_connection()
    pg_cache = {}

    # Truncar tabelas importadas (exceto sistema)
    print("Limpando dados antigos...")
    cur = conn.cursor()
    skip = {'users', 'hgr_stm_cad_tipo_usu', 'hgr_stm_perm_menu', 'hgr_stm_usu_reg_tp',
            'social_posts', 'social_follows', 'social_post_likes', 'social_reposts',
            'social_notifications', 'social_dm_conversations', 'social_dm_participants',
            'social_dm_messages', 'social_blocks', 'social_comments',
            'historico_conversas', 'historico_chat', 'memoria_tecnica'}
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
    for (t,) in cur.fetchall():
        if t not in skip:
            try:
                cur.execute(f'TRUNCATE TABLE public."{t}" CASCADE')
            except:
                conn.rollback()
    conn.commit()
    cur.close()

    # Importar
    table_ok = {}
    table_err = {}
    total_ok = 0
    total_err = 0

    for i, ins in enumerate(inserts):
        table, result = process_insert(conn, ins, pg_cache)
        if result == 'OK':
            table_ok[table] = table_ok.get(table, 0) + 1
            total_ok += 1
        elif table:
            key = f"{table}: {result}"
            table_err[key] = table_err.get(key, 0) + 1
            total_err += 1

        if (i + 1) % 2000 == 0:
            conn.commit()
            print(f"  {i+1}/{len(inserts)}  OK:{total_ok}  ERR:{total_err}")

    conn.commit()

    # Reset sequences
    print("Ajustando sequências...")
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
    print(f"MIGRAÇÃO v3")
    print(f"{'='*60}")
    print(f"Total OK: {total_ok}")
    print(f"Total Erros: {total_err}")
    print(f"\nTabelas importadas ({len(table_ok)}):")
    for t, c in sorted(table_ok.items(), key=lambda x: -x[1])[:40]:
        print(f"  {t}: {c}")

    if table_err:
        print(f"\nErros (top 15):")
        for err, cnt in sorted(table_err.items(), key=lambda x: -x[1])[:15]:
            print(f"  [{cnt}x] {err}")

    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()
