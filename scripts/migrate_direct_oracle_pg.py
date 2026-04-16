#!/usr/bin/env python3
"""
Migração direta Oracle → PostgreSQL v4
Para cada tabela Oracle:
1. Lê estrutura Oracle (colunas + tipos)
2. DROP + CREATE no PG com colunas idênticas
3. Copia TODOS os dados incluindo CLOBs/BLOBs
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import oracledb
import psycopg2
from psycopg2.extras import RealDictCursor

ORA_USER = 'hgrhml'
ORA_PASS = 'hgrhml21c#23'
ORA_DSN = '146.235.61.243:1521/producao'

# PostgreSQL - conexão direta (sem pool)
PG_HOST = os.getenv('DB_HOST', 'localhost')
PG_PORT = os.getenv('DB_PORT', '5432')
PG_USER = os.getenv('DB_USER', 'postgres')
PG_PASS = os.getenv('DB_PASSWORD', 'higra123')
PG_DB = os.getenv('DB_NAME', 'higra_sigs')

# Tabelas do sistema PG que NÃO devem ser recriadas
KEEP_TABLES = {
    'users', 'hgr_stm_cad_tipo_usu', 'hgr_stm_perm_menu', 'hgr_stm_usu_reg_tp',
    'social_posts', 'social_follows', 'social_post_likes', 'social_reposts',
    'social_notifications', 'social_dm_conversations', 'social_dm_participants',
    'social_dm_messages', 'social_blocks', 'social_comments',
    'historico_conversas', 'historico_chat', 'memoria_tecnica',
    'hgr_gac_reg_tar', 'hgr_gac_reg_tar_link', 'beg_rq80_reg_usu', 'beg_rq80_evid',
}

# Prefixos a pular
SKIP_PREFIXES = ('HGR_CRM_', 'HGR_CCO_')

TYPE_MAP = {
    'NUMBER': lambda p, s: 'BIGINT' if s == 0 and p and p > 9 else ('INTEGER' if s == 0 else f'NUMERIC({p},{s})' if p else 'NUMERIC'),
    'VARCHAR2': lambda p, s: f'VARCHAR({p})' if p else 'VARCHAR(4000)',
    'NVARCHAR2': lambda p, s: f'VARCHAR({p})' if p else 'VARCHAR(4000)',
    'CHAR': lambda p, s: f'VARCHAR({p})' if p else 'VARCHAR(1)',
    'CLOB': lambda p, s: 'TEXT',
    'NCLOB': lambda p, s: 'TEXT',
    'BLOB': lambda p, s: 'BYTEA',
    'RAW': lambda p, s: 'BYTEA',
    'LONG': lambda p, s: 'TEXT',
    'LONG RAW': lambda p, s: 'BYTEA',
    'DATE': lambda p, s: 'TIMESTAMPTZ',
    'TIMESTAMP(6)': lambda p, s: 'TIMESTAMPTZ',
    'TIMESTAMP(6) WITH TIME ZONE': lambda p, s: 'TIMESTAMPTZ',
    'FLOAT': lambda p, s: 'DOUBLE PRECISION',
    'BINARY_FLOAT': lambda p, s: 'REAL',
    'BINARY_DOUBLE': lambda p, s: 'DOUBLE PRECISION',
}


def ora_type_to_pg(ora_type, precision, scale):
    """Converte tipo Oracle para PostgreSQL."""
    t = ora_type.upper()
    for key, fn in TYPE_MAP.items():
        if t.startswith(key):
            return fn(precision, scale)
    if 'TIMESTAMP' in t:
        return 'TIMESTAMPTZ'
    return 'TEXT'


def get_oracle_table_info(ora_conn, table_name):
    """Retorna lista de (col_name, pg_type) para tabela Oracle."""
    cur = ora_conn.cursor()
    cur.execute("""
        SELECT column_name, data_type, data_precision, data_scale, data_length, nullable
        FROM user_tab_columns
        WHERE table_name = :tn
        ORDER BY column_id
    """, {'tn': table_name})

    columns = []
    for row in cur.fetchall():
        col_name = row[0].lower()
        ora_type = row[1]
        precision = row[2]
        scale = row[3]
        pg_type = ora_type_to_pg(ora_type, precision, scale)
        columns.append((col_name, pg_type))

    cur.close()
    return columns


def migrate_table(ora_conn, pg_conn, ora_table):
    """Migra uma tabela Oracle → PostgreSQL (DROP + CREATE + INSERT)."""
    pg_table = ora_table.lower()

    # Obter estrutura Oracle
    columns = get_oracle_table_info(ora_conn, ora_table)
    if not columns:
        return 0, 0, 'NO_COLUMNS'

    # PK Oracle
    pk_col = f"{pg_table}_id"
    has_pk = any(c[0] == pk_col for c in columns)

    # DROP e CREATE no PG
    pg_cur = pg_conn.cursor()
    try:
        pg_cur.execute(f'DROP TABLE IF EXISTS public."{pg_table}" CASCADE')
        pg_conn.commit()
    except Exception:
        pg_conn.rollback()

    # Criar tabela com colunas Oracle exatas + id serial
    col_defs = []
    if has_pk:
        # Usar a PK Oracle como 'id'
        for col_name, pg_type in columns:
            if col_name == pk_col:
                col_defs.append(f'id {pg_type} PRIMARY KEY')
            else:
                col_defs.append(f'"{col_name}" {pg_type}')
    else:
        # Sem PK explícita
        for col_name, pg_type in columns:
            col_defs.append(f'"{col_name}" {pg_type}')

    create_sql = f'CREATE TABLE public."{pg_table}" ({", ".join(col_defs)})'
    try:
        pg_cur.execute(create_sql)
        pg_conn.commit()
    except Exception as e:
        pg_conn.rollback()
        pg_cur.close()
        return 0, 0, f'CREATE_FAIL: {str(e)[:60]}'

    # Copiar dados
    ora_cur = ora_conn.cursor()
    ora_cur.execute(f'SELECT COUNT(*) FROM "{ora_table}"')
    total = ora_cur.fetchone()[0]
    if total == 0:
        ora_cur.close()
        pg_cur.close()
        return 0, 0, 'EMPTY'

    # SELECT Oracle
    ora_cur.execute(f'SELECT * FROM "{ora_table}"')
    ora_cols = [d[0].lower() for d in ora_cur.description]

    # Mapear para PG
    pg_col_names = []
    pg_col_indices = []
    for i, oc in enumerate(ora_cols):
        if oc == pk_col and has_pk:
            pg_col_names.append('id')
        else:
            pg_col_names.append(f'"{oc}"')
        pg_col_indices.append(i)

    placeholders = ', '.join(['%s'] * len(pg_col_names))
    insert_sql = f'INSERT INTO public."{pg_table}" ({", ".join(pg_col_names)}) VALUES ({placeholders})'

    ok = 0
    err = 0
    for ora_row in ora_cur:
        values = []
        for idx in pg_col_indices:
            val = ora_row[idx]
            if val is None:
                values.append(None)
            elif hasattr(val, 'read'):
                # LOB
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

        try:
            pg_cur.execute(insert_sql, values)
            ok += 1
        except Exception:
            pg_conn.rollback()
            err += 1

        if ok % 500 == 0 and ok > 0:
            pg_conn.commit()

    pg_conn.commit()
    ora_cur.close()
    pg_cur.close()
    return ok, err, 'OK'


def main():
    # Carregar .env se existir
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

    pg_host = os.getenv('DB_HOST', 'localhost')
    pg_port = os.getenv('DB_PORT', '5432')
    pg_user = os.getenv('DB_USER', 'postgres')
    pg_pass = os.getenv('DB_PASSWORD', 'higra123')
    pg_db = os.getenv('DB_NAME', 'higra_sigs')

    print(f"Oracle: {ORA_USER}@{ORA_DSN}")
    print(f"PostgreSQL: {pg_user}@{pg_host}:{pg_port}/{pg_db}")

    print("Conectando Oracle...")
    ora_conn = oracledb.connect(user=ORA_USER, password=ORA_PASS, dsn=ORA_DSN)
    print("OK")

    print("Conectando PostgreSQL...")
    pg_conn = psycopg2.connect(host=pg_host, port=pg_port, user=pg_user, password=pg_pass, dbname=pg_db)
    pg_conn.autocommit = False
    print("OK")

    # Listar tabelas Oracle
    cur = ora_conn.cursor()
    cur.execute("SELECT table_name FROM user_tables ORDER BY table_name")
    ora_tables = [r[0] for r in cur.fetchall()]
    cur.close()
    print(f"Tabelas Oracle: {len(ora_tables)}")

    total_ok = 0
    total_err = 0
    migrated = []
    skipped = []
    errors = []

    for i, ora_table in enumerate(ora_tables):
        pg_table = ora_table.lower()

        # Pular CRM e sistema
        if any(ora_table.startswith(p) for p in SKIP_PREFIXES):
            skipped.append(pg_table)
            continue
        if pg_table in KEEP_TABLES:
            skipped.append(pg_table)
            continue

        try:
            ok, err, status = migrate_table(ora_conn, pg_conn, ora_table)
            total_ok += ok
            total_err += err
            if ok > 0:
                migrated.append((pg_table, ok, err))
            if status != 'OK' and status != 'EMPTY':
                errors.append((pg_table, status))
            print(f"  [{i+1}/{len(ora_tables)}] {pg_table}: {ok:,} OK, {err} err ({status})")
        except Exception as e:
            errors.append((pg_table, str(e)[:60]))
            print(f"  [{i+1}/{len(ora_tables)}] {pg_table}: FAIL {str(e)[:60]}")

    # Reset sequences
    print("\nAjustando sequências...")
    try:
        pg_cur = pg_conn.cursor()
        pg_cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        for (t,) in pg_cur.fetchall():
            try:
                pg_cur.execute(f"SELECT MAX(id) FROM public.\"{t}\"")
                max_id = pg_cur.fetchone()[0]
                if max_id:
                    seq_name = f"{t}_id_seq"
                    pg_cur.execute(f"SELECT setval('{seq_name}', {max_id}) WHERE EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = '{seq_name}')")
            except Exception:
                pg_conn.rollback()
        pg_conn.commit()
        print("OK")
    except Exception as e:
        print(f"Erro: {e}")

    # Relatório
    print(f"\n{'='*60}")
    print(f"MIGRAÇÃO ORACLE → POSTGRESQL")
    print(f"{'='*60}")
    print(f"Total registros OK: {total_ok:,}")
    print(f"Total erros: {total_err:,}")
    print(f"Tabelas migradas: {len(migrated)}")
    print(f"Tabelas puladas: {len(skipped)} (CRM + sistema)")
    print(f"\nTop tabelas:")
    for t, ok, err in sorted(migrated, key=lambda x: -x[1])[:30]:
        e = f" (err:{err})" if err > 0 else ""
        print(f"  {t}: {ok:,}{e}")

    if errors:
        print(f"\nErros ({len(errors)}):")
        for t, e in errors[:15]:
            print(f"  {t}: {e}")

    ora_conn.close()
    pg_conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()
