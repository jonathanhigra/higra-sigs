# -*- coding: utf-8 -*-
"""
Extractors de migração Oracle → PostgreSQL.

Cada módulo expõe `run(ora_conn, pg_conn, ctx) -> list[TableReport]`.
Orquestrados por `backend.scripts.migrate_from_oracle`.
"""
