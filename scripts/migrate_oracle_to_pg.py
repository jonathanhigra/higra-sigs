#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FASE 6 — Migração de Dados Oracle (HGRHML) → PostgreSQL (higra_sigs)

Uso:
  python scripts/migrate_oracle_to_pg.py --oracle-dsn "host:1521/service" --oracle-user HGRHML --oracle-pass "pwd"

Ou com CSVs exportados:
  python scripts/migrate_oracle_to_pg.py --csv-dir /path/to/csvs

Pré-requisitos:
  pip install oracledb psycopg2-binary

Ordem de migração respeita FKs (tabelas pai antes de filhas).
Usa ON CONFLICT DO NOTHING para idempotência (re-executável).
Preserva IDs originais do Oracle.
"""

import argparse
import csv
import os
import sys
from datetime import datetime

# Adicionar root ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ============================================================
# Ordem de migração (respeita FKs)
# ============================================================
MIGRATION_ORDER = [
    # FASE 0: Segurança e Base
    'sth_cad_empresa',
    'sth_cad_filial',
    'beg_processo',
    'beg_dominio',
    'beg_valor_dominio',
    'hgr_stm_cad_tipo_usu',
    # users/beg_usuarios é especial — mapear
    'hgr_stm_perm_menu',

    # FASE 1: Tarefas
    'hgr_tar_cad_etp',
    'hgr_tar_cad_etp_kbn',
    'hgr_tar_cad_tarefa',
    'hgr_tar_reg_apontamento',
    'hgr_tar_reg_eqp_apoio',

    # FASE 2: Indicadores
    'hgr_ges_cad_unidade',
    'hgr_ges_cad_tend',
    'hgr_ges_cad_semaforo',
    'hgr_ges_cad_meta',
    'hgr_ges_reg_meta',

    # FASE 2: Reuniões
    'sth_reu_tipo',
    'sth_reu_agenda',
    'sth_reu_participante',
    'sth_reu_pauta',
    'sth_reu_decisao',
    'sth_reu_acao',

    # FASE 2: Projetos
    'hgr_prj_cad_cat',
    'hgr_prj_cad_projeto',
    'hgr_prj_reg_etp',
    'hgr_prj_reg_ant',
    'hgr_prj_reg_part',
    'hgr_prj_cad_gast_ext',

    # FASE 2: Documentos
    'sth_doc_cad_tipo',
    'beg_cad_documento',
    'beg_rev_documento',

    # FASE 2: Planos de Ação
    'hgr_gac_reg_tar',

    # FASE 3: Qualidade
    'hgr_sst_cad_prt_crp',
    'hgr_sst_cad_tp_lesao',
    'beg_rq03',
    'beg_rq03_reg_sst',
    'hgr_rq03_reg_ant',
    'hgr_rq03_reg_part',
    'hgr_rq49_cad_orig',
    'hgr_rq49_cad_cla_pri',
    'beg_rq49',
    'beg_rq49_reg_usu',
    'hgr_rq49_reg_ant',
    'hgr_rq49_reg_aval',
    'beg_rq80',
    'beg_rq94',

    # FASE 4: Fabricação
    'hgr_fab_ckl_cad_etp',
    'hgr_fab_cad_cck_lis',
    'hgr_fab_cad_oco',
    'hgr_fab_inst_med',
    'hgr_fab_inst_med_cal_log',

    # FASE 4: Motores
    'hgr_mot_cad_mod',
    'hgr_mot_cad_mtr',
    'hgr_mot_cad_bmb',

    # FASE 4: Assistência
    'hgr_ass_cad_stt',
    'hgr_ass_cad_tp_atn',
    'hgr_ass_cad_can_ent',
    'hgr_ass_cfg_cad_fnl',
    'hgr_ass_cfg_fnl_reg_etp',
    'hgr_ass_cad_atn',
    'hgr_ass_atn_reg_etp',
    'hgr_ass_atn_reg_ant',
    'hgr_ass_atn_reg_eqp',

    # FASE 4: Chamados
    'hgr_chm_cad_cat',
    'hgr_chm_cad_chm',
    'hgr_chm_reg_cmt',
    'hgr_chm_reg_stt',

    # FASE 4: Laudos
    'hgr_srv_reg_lau',
    'hgr_srv_reg_lau_etp',
    'hgr_serv_cad_tec',
    'hgr_serv_cad_tipo_garan',

    # FASE 5: Laboratório
    'hgr_lab_cad_tp_tst',
    'hgr_lab_cad_tp_user',
    'hgr_lab_cad_eqp',
    'hgr_lab_cad_team',
    'hgr_lab_cad_tst',
    'hgr_lab_reg_teste',
    'hgr_lab_tst_reg_team',
    'hgr_lab_tst_reg_stt',
]


def parse_oracle_date(val):
    """Converte data Oracle para formato PostgreSQL."""
    if not val or str(val).strip() == '':
        return None
    for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(str(val).strip(), fmt)
        except ValueError:
            continue
    return None


def migrate_from_oracle(oracle_dsn, oracle_user, oracle_pass, pg_conn):
    """Migração direta Oracle → PostgreSQL via cx_Oracle/oracledb."""
    try:
        import oracledb
    except ImportError:
        print("ERRO: pip install oracledb")
        return

    ora_conn = oracledb.connect(user=oracle_user, password=oracle_pass, dsn=oracle_dsn)
    ora_cur = ora_conn.cursor()
    pg_cur = pg_conn.cursor()

    for table in MIGRATION_ORDER:
        oracle_table = f"HGRHML.{table.upper()}"
        try:
            ora_cur.execute(f"SELECT COUNT(*) FROM {oracle_table}")
            count = ora_cur.fetchone()[0]
            if count == 0:
                print(f"  SKIP {table}: 0 rows")
                continue

            ora_cur.execute(f"SELECT * FROM {oracle_table}")
            cols = [d[0].lower() for d in ora_cur.description]

            # Verificar quais colunas existem no PostgreSQL
            pg_cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
            """, (table,))
            pg_cols = {r[0] for r in pg_cur.fetchall()}
            valid_cols = [c for c in cols if c in pg_cols]

            if not valid_cols:
                print(f"  SKIP {table}: no matching columns")
                continue

            placeholders = ', '.join(['%s'] * len(valid_cols))
            cols_str = ', '.join(valid_cols)
            insert_sql = f"INSERT INTO public.{table} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

            migrated = 0
            for row in ora_cur:
                row_dict = dict(zip(cols, row))
                values = [row_dict.get(c) for c in valid_cols]
                # Converter tipos
                values = [bytes(v) if isinstance(v, memoryview) else v for v in values]
                try:
                    pg_cur.execute(insert_sql, values)
                    migrated += 1
                except Exception as e:
                    pg_conn.rollback()
                    if migrated == 0:
                        print(f"  ERROR {table}: {e}")
                        break

                if migrated % 500 == 0:
                    pg_conn.commit()

            pg_conn.commit()
            print(f"  OK {table}: {migrated}/{count} rows")

        except Exception as e:
            pg_conn.rollback()
            print(f"  ERROR {table}: {e}")

    ora_conn.close()


def migrate_from_csvs(csv_dir, pg_conn):
    """Migração de CSVs exportados → PostgreSQL."""
    pg_cur = pg_conn.cursor()

    for table in MIGRATION_ORDER:
        csv_path = os.path.join(csv_dir, f"{table}.csv")
        if not os.path.exists(csv_path):
            print(f"  SKIP {table}: CSV não encontrado")
            continue

        try:
            with open(csv_path, 'r', encoding='utf-8', errors='replace') as f:
                reader = csv.DictReader(f)
                if not reader.fieldnames:
                    continue

                # Verificar quais colunas existem no PostgreSQL
                pg_cur.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s
                """, (table,))
                pg_cols = {r[0] for r in pg_cur.fetchall()}
                valid_cols = [c.lower() for c in reader.fieldnames if c.lower() in pg_cols]

                if not valid_cols:
                    print(f"  SKIP {table}: no matching columns")
                    continue

                placeholders = ', '.join(['%s'] * len(valid_cols))
                cols_str = ', '.join(valid_cols)
                insert_sql = f"INSERT INTO public.{table} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

                migrated = 0
                for row in reader:
                    values = []
                    for c in valid_cols:
                        val = row.get(c) or row.get(c.upper())
                        if val == '' or val is None:
                            values.append(None)
                        else:
                            values.append(val)
                    try:
                        pg_cur.execute(insert_sql, values)
                        migrated += 1
                    except Exception:
                        pg_conn.rollback()

                    if migrated % 500 == 0:
                        pg_conn.commit()

                pg_conn.commit()
                print(f"  OK {table}: {migrated} rows from CSV")

        except Exception as e:
            pg_conn.rollback()
            print(f"  ERROR {table}: {e}")


def reset_sequences(pg_conn):
    """Ajusta todas as sequências BIGSERIAL para MAX(id) + 1."""
    pg_cur = pg_conn.cursor()
    try:
        pg_cur.execute("""
            SELECT schemaname, tablename, column_name,
                   pg_get_serial_sequence(schemaname||'.'||tablename, column_name) as seq
            FROM information_schema.columns c
            JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = c.table_schema
            WHERE c.column_default LIKE 'nextval%%'
            AND t.schemaname = 'public'
        """)
        for row in pg_cur.fetchall():
            if row[3]:
                try:
                    pg_cur.execute(f"SELECT setval('{row[3]}', COALESCE((SELECT MAX({row[2]}) FROM {row[0]}.{row[1]}), 1))")
                except Exception:
                    pass
        pg_conn.commit()
        print("Sequências ajustadas.")
    except Exception as e:
        pg_conn.rollback()
        print(f"Erro ao ajustar sequências: {e}")


def validate_migration(pg_conn):
    """Valida contagens pós-migração."""
    pg_cur = pg_conn.cursor()
    print("\n=== Validação ===")
    for table in MIGRATION_ORDER:
        try:
            pg_cur.execute(f"SELECT COUNT(*) FROM public.{table}")
            count = pg_cur.fetchone()[0]
            if count > 0:
                print(f"  {table}: {count} rows")
        except Exception:
            pg_conn.rollback()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migração Oracle → PostgreSQL')
    parser.add_argument('--oracle-dsn', help='Oracle DSN (host:port/service)')
    parser.add_argument('--oracle-user', default='HGRHML')
    parser.add_argument('--oracle-pass', help='Oracle password')
    parser.add_argument('--csv-dir', help='Diretório com CSVs exportados')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()

    from backend.database import get_db_connection
    pg_conn = get_db_connection()

    if args.validate_only:
        validate_migration(pg_conn)
    elif args.csv_dir:
        print(f"Migrando de CSVs em {args.csv_dir}...")
        migrate_from_csvs(args.csv_dir, pg_conn)
        reset_sequences(pg_conn)
        validate_migration(pg_conn)
    elif args.oracle_dsn:
        print(f"Migrando de Oracle {args.oracle_dsn}...")
        migrate_from_oracle(args.oracle_dsn, args.oracle_user, args.oracle_pass, pg_conn)
        reset_sequences(pg_conn)
        validate_migration(pg_conn)
    else:
        print("Use --oracle-dsn ou --csv-dir")
        parser.print_help()

    pg_conn.close()
