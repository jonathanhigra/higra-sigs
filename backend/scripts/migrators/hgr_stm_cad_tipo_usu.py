# -*- coding: utf-8 -*-
"""
Extractor: HGRHML.HGR_STM_CAD_TIPO_USU → public.hgr_stm_cad_tipo_usu.

Tabela de tipos de usuário (A, D, G, F, I, R, L, P, GER_COM, ASS, AUX).
Já bootstrapada pela app. Migração faz INSERT-only com ON CONFLICT por
`hgr_vlr_retorno` (código SST/A/D/G...) que é a chave semântica.
"""
from __future__ import annotations

from backend.scripts.migrate_from_oracle import TableReport


def run(ora_conn, pg_conn, ctx) -> list[TableReport]:
    report = TableReport(table="hgr_stm_cad_tipo_usu")
    if ctx.dry_run:
        report.status = "DRY"
        return [report]

    ora_cur = ora_conn.cursor()
    ora_cur.execute(
        """
        SELECT HGR_STM_CAD_TIPO_USU_ID, HGR_VLR_RETORNO, HGR_VLR_EXIBICAO,
               DESCRICAO, ATIVO
          FROM "HGR_STM_CAD_TIPO_USU"
        """
    )
    rows = ora_cur.fetchall()
    ora_cur.close()

    if not rows:
        report.status = "EMPTY"
        return [report]

    # Garantir unique em hgr_vlr_retorno para suportar ON CONFLICT idempotente
    with pg_conn.cursor() as cur:
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uix_tipo_usu_retorno
            ON public.hgr_stm_cad_tipo_usu (hgr_vlr_retorno)
        """)
        for ora_id, vlr_ret, vlr_exib, descricao, ativo in rows:
            if not vlr_ret:
                report.err += 1
                continue
            try:
                cur.execute(
                    """
                    INSERT INTO public.hgr_stm_cad_tipo_usu
                        (hgr_vlr_retorno, hgr_vlr_exibicao, descricao, ativo)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (hgr_vlr_retorno) DO UPDATE SET
                        hgr_vlr_exibicao = EXCLUDED.hgr_vlr_exibicao,
                        descricao = COALESCE(EXCLUDED.descricao, public.hgr_stm_cad_tipo_usu.descricao),
                        ativo = EXCLUDED.ativo
                    """,
                    (vlr_ret, vlr_exib, descricao, ativo or "S"),
                )
                report.ok += 1
            except Exception:
                pg_conn.rollback()
                report.err += 1
    pg_conn.commit()
    report.status = "OK" if report.err == 0 else "PARTIAL"
    return [report]
