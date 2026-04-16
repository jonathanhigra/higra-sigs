# -*- coding: utf-8 -*-
"""
Extractor: HGRHML.HGR_STM_USU_REG_TP → public.hgr_stm_usu_reg_tp.

Vínculo N:M entre `users` e `hgr_stm_cad_tipo_usu`. Chaves Oracle:
BEG_USUARIOS_ID (precisa ser mapeado para public.users.id via email).
HGR_STM_CAD_TIPO_USU_ID (mapeado via hgr_vlr_retorno).

Estratégia:
1. Carrega mapa oracle_beg_usuarios_id → pg_user_id (consultando BEG_USUARIOS
   no Oracle por email e cruzando com public.users.email).
2. Carrega mapa oracle_tipo_id → pg_tipo_id (mesma técnica, por
   hgr_vlr_retorno).
3. Insere vínculos idempotentemente (ON CONFLICT DO NOTHING em
   (users_id, hgr_stm_cad_tipo_usu_id)).
"""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import TableReport


def _build_user_map(ora_conn, pg_conn) -> dict[int, int]:
    """Oracle BEG_USUARIOS_ID → PG users.id via email match."""
    ora_cur = ora_conn.cursor()
    ora_cur.execute(
        'SELECT BEG_USUARIOS_ID, LOWER(EMAIL) FROM "BEG_USUARIOS" WHERE EMAIL IS NOT NULL'
    )
    ora_rows = ora_cur.fetchall()
    ora_cur.close()

    pg_map: dict[str, int] = {}
    with pg_conn.cursor() as cur:
        cur.execute("SELECT id, LOWER(email) FROM public.users")
        for pg_id, email in cur.fetchall():
            if email:
                pg_map[email] = pg_id

    out: dict[int, int] = {}
    for ora_id, email in ora_rows:
        pg_id = pg_map.get((email or "").strip())
        if pg_id is not None:
            out[int(ora_id)] = pg_id
    return out


def _build_tipo_map(ora_conn, pg_conn) -> dict[int, int]:
    """Oracle HGR_STM_CAD_TIPO_USU_ID → PG id via hgr_vlr_retorno."""
    ora_cur = ora_conn.cursor()
    ora_cur.execute(
        'SELECT HGR_STM_CAD_TIPO_USU_ID, HGR_VLR_RETORNO FROM "HGR_STM_CAD_TIPO_USU"'
    )
    ora_rows = ora_cur.fetchall()
    ora_cur.close()

    pg_map: dict[str, int] = {}
    with pg_conn.cursor() as cur:
        cur.execute("SELECT id, hgr_vlr_retorno FROM public.hgr_stm_cad_tipo_usu")
        for pg_id, retorno in cur.fetchall():
            if retorno:
                pg_map[retorno] = pg_id

    out: dict[int, int] = {}
    for ora_id, retorno in ora_rows:
        pg_id = pg_map.get(retorno)
        if pg_id is not None:
            out[int(ora_id)] = pg_id
    return out


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    report = TableReport(table="hgr_stm_usu_reg_tp")
    if ctx.dry_run:
        report.status = "DRY"
        return [report]

    user_map = _build_user_map(ora_conn, pg_conn)
    tipo_map = _build_tipo_map(ora_conn, pg_conn)
    if not user_map or not tipo_map:
        report.status = "NO_MAP"
        report.message = f"users_map={len(user_map)} tipo_map={len(tipo_map)}"
        return [report]

    ora_cur = ora_conn.cursor()
    ora_cur.execute(
        """
        SELECT BEG_USUARIOS_ID, HGR_STM_CAD_TIPO_USU_ID, ATIVO
          FROM "HGR_STM_USU_REG_TP"
        """
    )
    rows = ora_cur.fetchall()
    ora_cur.close()
    if not rows:
        report.status = "EMPTY"
        return [report]

    with pg_conn.cursor() as cur:
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uix_usu_reg_tp
            ON public.hgr_stm_usu_reg_tp (users_id, hgr_stm_cad_tipo_usu_id)
        """)
        for ora_usu_id, ora_tipo_id, ativo in rows:
            pg_user = user_map.get(int(ora_usu_id) if ora_usu_id else -1)
            pg_tipo = tipo_map.get(int(ora_tipo_id) if ora_tipo_id else -1)
            if pg_user is None or pg_tipo is None:
                report.err += 1
                continue
            try:
                cur.execute(
                    """
                    INSERT INTO public.hgr_stm_usu_reg_tp
                        (users_id, hgr_stm_cad_tipo_usu_id, ativo)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (users_id, hgr_stm_cad_tipo_usu_id) DO NOTHING
                    """,
                    (pg_user, pg_tipo, ativo or "S"),
                )
                report.ok += 1
            except Exception:
                pg_conn.rollback()
                report.err += 1
    pg_conn.commit()
    report.status = "OK" if report.err == 0 else "PARTIAL"
    return [report]
