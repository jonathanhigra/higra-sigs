# -*- coding: utf-8 -*-
"""
Serviço de integração read-only com ERP Focco.

Conecta ao SQL Server do Focco via pyodbc, puxa Pedidos de Venda (PV)
e armazena em cache local (PostgreSQL) para consulta rápida.

Configuração via variáveis de ambiente:
  FOCCO_DB_HOST, FOCCO_DB_PORT, FOCCO_DB_NAME, FOCCO_DB_USER, FOCCO_DB_PASSWORD
  FOCCO_DB_DRIVER  (default: "ODBC Driver 17 for SQL Server")
  FOCCO_SYNC_DAYS  (default: 90 — quantos dias de PVs puxar)
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.database import get_db_connection

logger = logging.getLogger("higra.focco")

# ---------------------------------------------------------------------------
# Configuração de conexão Focco
# ---------------------------------------------------------------------------

def _focco_conn_string() -> str:
    driver = os.getenv("FOCCO_DB_DRIVER", "ODBC Driver 17 for SQL Server")
    host = os.getenv("FOCCO_DB_HOST", "")
    port = os.getenv("FOCCO_DB_PORT", "1433")
    db = os.getenv("FOCCO_DB_NAME", "")
    user = os.getenv("FOCCO_DB_USER", "")
    pwd = os.getenv("FOCCO_DB_PASSWORD", "")
    return (
        f"DRIVER={{{driver}}};"
        f"SERVER={host},{port};"
        f"DATABASE={db};"
        f"UID={user};"
        f"PWD={pwd};"
        "TrustServerCertificate=yes;"
    )


def _focco_configured() -> bool:
    return bool(os.getenv("FOCCO_DB_HOST", "").strip())


def _get_focco_connection():
    """Abre conexão read-only com o SQL Server do Focco."""
    import pyodbc  # lazy import — só carrega se Focco estiver configurado
    conn_str = _focco_conn_string()
    conn = pyodbc.connect(conn_str, readonly=True, timeout=30)
    return conn


# ---------------------------------------------------------------------------
# Query de PVs no Focco
# ---------------------------------------------------------------------------

_PV_QUERY = """
SELECT
    pv.NUM_PEDIDO        AS numero_pv,
    pv.DT_PEDIDO         AS dt_pedido,
    pv.DT_ENTREGA        AS dt_entrega,
    pv.VLR_TOTAL         AS vlr_total,
    pv.STATUS            AS status_focco,
    pv.OBS               AS observacao,
    cl.RAZAO_SOCIAL      AS cliente_razao,
    cl.CNPJ_CPF          AS cliente_cnpj,
    cl.COD_CLIENTE       AS cliente_codigo,
    vd.NOME              AS vendedor_nome,
    pv.COD_COND_PGTO     AS cond_pagamento,
    pv.COD_REPRES        AS cod_representante,
    pv.TIPO_FRETE        AS tipo_frete
FROM PEDIDO_VENDA pv
LEFT JOIN CLIENTE cl ON cl.COD_CLIENTE = pv.COD_CLIENTE
LEFT JOIN VENDEDOR vd ON vd.COD_VENDEDOR = pv.COD_VENDEDOR
WHERE pv.DT_PEDIDO >= ?
ORDER BY pv.DT_PEDIDO DESC
"""

_PV_ITEMS_QUERY = """
SELECT
    it.NUM_PEDIDO        AS numero_pv,
    it.ITEM              AS item_seq,
    it.COD_PRODUTO       AS cod_produto,
    pr.DESCRICAO         AS produto_descricao,
    it.QUANTIDADE        AS quantidade,
    it.VLR_UNITARIO      AS vlr_unitario,
    it.VLR_TOTAL         AS vlr_total_item,
    it.DT_ENTREGA        AS dt_entrega_item,
    it.UNIDADE           AS unidade,
    it.OBS               AS obs_item
FROM PEDIDO_VENDA_ITEM it
LEFT JOIN PRODUTO pr ON pr.COD_PRODUTO = it.COD_PRODUTO
WHERE it.NUM_PEDIDO = ?
ORDER BY it.ITEM
"""


def fetch_pvs_from_focco(days: int | None = None) -> list[dict[str, Any]]:
    """Busca PVs diretamente do Focco (SQL Server). Retorna lista de dicts."""
    if not _focco_configured():
        logger.warning("Focco não configurado (FOCCO_DB_HOST vazio).")
        return []
    if days is None:
        days = int(os.getenv("FOCCO_SYNC_DAYS", "90"))
    dt_min = datetime.now(timezone.utc) - timedelta(days=days)
    conn = _get_focco_connection()
    try:
        cur = conn.cursor()
        cur.execute(_PV_QUERY, (dt_min,))
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_pv_items_from_focco(numero_pv: str) -> list[dict[str, Any]]:
    """Busca itens de um PV específico diretamente do Focco."""
    if not _focco_configured():
        return []
    conn = _get_focco_connection()
    try:
        cur = conn.cursor()
        cur.execute(_PV_ITEMS_QUERY, (numero_pv,))
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Cache local (PostgreSQL)
# ---------------------------------------------------------------------------

def create_focco_tables():
    """Cria tabelas de cache do Focco no PostgreSQL."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_focco_pv (
                id BIGSERIAL PRIMARY KEY,
                numero_pv VARCHAR(50) NOT NULL UNIQUE,
                dt_pedido DATE,
                dt_entrega DATE,
                vlr_total NUMERIC(15,2),
                status_focco VARCHAR(30),
                observacao TEXT,
                cliente_razao VARCHAR(300),
                cliente_cnpj VARCHAR(20),
                cliente_codigo VARCHAR(50),
                vendedor_nome VARCHAR(200),
                cond_pagamento VARCHAR(50),
                cod_representante VARCHAR(50),
                tipo_frete VARCHAR(20),
                sync_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_focco_pv_item (
                id BIGSERIAL PRIMARY KEY,
                numero_pv VARCHAR(50) NOT NULL,
                item_seq INTEGER,
                cod_produto VARCHAR(50),
                produto_descricao VARCHAR(500),
                quantidade NUMERIC(15,4),
                vlr_unitario NUMERIC(15,4),
                vlr_total_item NUMERIC(15,2),
                dt_entrega_item DATE,
                unidade VARCHAR(10),
                obs_item TEXT,
                sync_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_focco_pv_numero
            ON public.hgr_focco_pv(numero_pv)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_focco_pv_item_pv
            ON public.hgr_focco_pv_item(numero_pv)
        """)
        # Coluna FK opcional em projetos para vincular PV
        cur.execute("""
            ALTER TABLE public.hgr_prj_cad_projeto
            ADD COLUMN IF NOT EXISTS focco_pv VARCHAR(50)
        """)
        conn.commit()
        logger.info("Tabelas de cache Focco verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error("Erro ao criar tabelas Focco: %s", e)
    finally:
        cur.close()
        conn.close()


def sync_pvs_to_cache(days: int | None = None) -> dict[str, int]:
    """Puxa PVs do Focco e atualiza o cache local. Retorna contadores."""
    pvs = fetch_pvs_from_focco(days)
    if not pvs:
        return {"fetched": 0, "upserted": 0}

    conn = get_db_connection()
    cur = conn.cursor()
    upserted = 0
    try:
        for pv in pvs:
            cur.execute("""
                INSERT INTO public.hgr_focco_pv
                    (numero_pv, dt_pedido, dt_entrega, vlr_total, status_focco,
                     observacao, cliente_razao, cliente_cnpj, cliente_codigo,
                     vendedor_nome, cond_pagamento, cod_representante, tipo_frete, sync_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (numero_pv) DO UPDATE SET
                    dt_pedido = EXCLUDED.dt_pedido,
                    dt_entrega = EXCLUDED.dt_entrega,
                    vlr_total = EXCLUDED.vlr_total,
                    status_focco = EXCLUDED.status_focco,
                    observacao = EXCLUDED.observacao,
                    cliente_razao = EXCLUDED.cliente_razao,
                    cliente_cnpj = EXCLUDED.cliente_cnpj,
                    cliente_codigo = EXCLUDED.cliente_codigo,
                    vendedor_nome = EXCLUDED.vendedor_nome,
                    cond_pagamento = EXCLUDED.cond_pagamento,
                    cod_representante = EXCLUDED.cod_representante,
                    tipo_frete = EXCLUDED.tipo_frete,
                    sync_at = NOW()
            """, (
                str(pv.get("numero_pv", "")),
                pv.get("dt_pedido"),
                pv.get("dt_entrega"),
                pv.get("vlr_total"),
                str(pv.get("status_focco", "")) if pv.get("status_focco") else None,
                pv.get("observacao"),
                pv.get("cliente_razao"),
                pv.get("cliente_cnpj"),
                str(pv.get("cliente_codigo", "")) if pv.get("cliente_codigo") else None,
                pv.get("vendedor_nome"),
                str(pv.get("cond_pagamento", "")) if pv.get("cond_pagamento") else None,
                str(pv.get("cod_representante", "")) if pv.get("cod_representante") else None,
                str(pv.get("tipo_frete", "")) if pv.get("tipo_frete") else None,
            ))
            upserted += 1
        conn.commit()
        logger.info("Focco sync: %d PVs puxados, %d upserted.", len(pvs), upserted)
    except Exception as e:
        conn.rollback()
        logger.error("Erro no sync Focco: %s", e)
        raise
    finally:
        cur.close()
        conn.close()

    return {"fetched": len(pvs), "upserted": upserted}


def sync_pv_items_to_cache(numero_pv: str) -> int:
    """Puxa itens de um PV específico do Focco e salva no cache."""
    items = fetch_pv_items_from_focco(numero_pv)
    if not items:
        return 0

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Remove itens antigos do PV e reinsere
        cur.execute("DELETE FROM public.hgr_focco_pv_item WHERE numero_pv = %s", (numero_pv,))
        for it in items:
            cur.execute("""
                INSERT INTO public.hgr_focco_pv_item
                    (numero_pv, item_seq, cod_produto, produto_descricao,
                     quantidade, vlr_unitario, vlr_total_item,
                     dt_entrega_item, unidade, obs_item, sync_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
            """, (
                numero_pv,
                it.get("item_seq"),
                str(it.get("cod_produto", "")) if it.get("cod_produto") else None,
                it.get("produto_descricao"),
                it.get("quantidade"),
                it.get("vlr_unitario"),
                it.get("vlr_total_item"),
                it.get("dt_entrega_item"),
                it.get("unidade"),
                it.get("obs_item"),
            ))
        conn.commit()
        return len(items)
    except Exception as e:
        conn.rollback()
        logger.error("Erro sync itens PV %s: %s", numero_pv, e)
        raise
    finally:
        cur.close()
        conn.close()
