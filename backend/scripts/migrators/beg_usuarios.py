# -*- coding: utf-8 -*-
"""
Extractor: HGRHML.BEG_USUARIOS → public.users (MERGE).

`public.users` já existe com autenticação (username/email/password_hash).
Migração merges BEG_USUARIOS do Oracle preservando:
- email como chave de merge (unique)
- FKs: sth_cad_empresa_id, sth_cad_filial_id, beg_processo_id
- NUNCA sobrescreve password_hash (usuário preserva senha atual)
- Usuários novos recebem senha provisória sentinel (trocar no 1º login)

Tabela Oracle BEG_USUARIOS (colunas conhecidas):
  BEG_USUARIOS_ID, NOME, EMAIL, LOGIN, STH_CAD_EMPRESA_ID,
  STH_CAD_FILIAL_ID, BEG_PROCESSO_ID, ATIVO, ...
"""
from __future__ import annotations

import bcrypt
from backend.scripts.migrate_from_oracle import TableReport

PROVISIONAL_PASSWORD = "Sigs@2026!trocar"


def _hash_placeholder() -> str:
    return bcrypt.hashpw(PROVISIONAL_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    report = TableReport(table="users")
    if ctx.dry_run:
        report.status = "DRY"
        return [report]

    ora_cur = ora_conn.cursor()
    ora_cur.execute(
        """
        SELECT BEG_USUARIOS_ID, NOME, EMAIL, LOGIN,
               STH_CAD_EMPRESA_ID, STH_CAD_FILIAL_ID, BEG_PROCESSO_ID,
               ATIVO
          FROM "BEG_USUARIOS"
        """
    )
    rows = ora_cur.fetchall()
    ora_cur.close()

    if not rows:
        report.status = "EMPTY"
        return [report]

    placeholder_hash = _hash_placeholder()
    inserted = updated = 0

    with pg_conn.cursor() as cur:
        for (ora_id, nome, email, login,
             empresa_id, filial_id, processo_id, ativo) in rows:
            if not email and not login:
                report.err += 1
                continue
            username = (login or email or "").strip().lower()
            email_val = (email or username).strip().lower()
            if not username or not email_val:
                report.err += 1
                continue
            try:
                # Verifica se já existe (por email)
                cur.execute(
                    "SELECT id FROM public.users WHERE LOWER(email) = %s",
                    (email_val,),
                )
                existing = cur.fetchone()
                if existing:
                    cur.execute(
                        """
                        UPDATE public.users SET
                            name = COALESCE(%s, name),
                            sth_cad_empresa_id = COALESCE(%s, sth_cad_empresa_id),
                            sth_cad_filial_id  = COALESCE(%s, sth_cad_filial_id),
                            beg_processo_id    = COALESCE(%s, beg_processo_id),
                            ativo              = COALESCE(%s, ativo)
                        WHERE id = %s
                        """,
                        (nome, empresa_id, filial_id, processo_id, ativo, existing[0]),
                    )
                    updated += 1
                else:
                    cur.execute(
                        """
                        INSERT INTO public.users
                            (username, email, name, password_hash,
                             sth_cad_empresa_id, sth_cad_filial_id, beg_processo_id, ativo)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (email) DO NOTHING
                        """,
                        (username, email_val, nome, placeholder_hash,
                         empresa_id, filial_id, processo_id, ativo or "S"),
                    )
                    inserted += 1
                report.ok += 1
            except Exception:
                pg_conn.rollback()
                report.err += 1
    pg_conn.commit()
    report.status = "OK" if report.err == 0 else "PARTIAL"
    report.message = f"inserted={inserted} updated={updated}"
    return [report]
