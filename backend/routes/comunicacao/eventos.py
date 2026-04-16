# -*- coding: utf-8 -*-
"""Comunicação / Eventos (APEX key: EVT) — 7 tabelas."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()


def create_comunicacao_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_com_cad_tipo (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_com_cad_evento (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500), descricao TEXT,
                dt_evento DATE, local VARCHAR(300), status VARCHAR(20) DEFAULT 'ABERTO',
                hgr_com_cad_tipo_id BIGINT, responsavel_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_com_tipo_reg_usu (
                id BIGSERIAL PRIMARY KEY, hgr_com_cad_tipo_id BIGINT,
                usuario_id BIGINT NOT NULL, notificar VARCHAR(1) DEFAULT 'S',
                ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_com_cadastro_evid (
                id BIGSERIAL PRIMARY KEY, hgr_com_cad_evento_id BIGINT,
                descricao TEXT, arquivo BYTEA, filename VARCHAR(500), mimetype VARCHAR(200),
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        conn.commit()
        logger.info("Tabelas de comunicação verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas comunicação: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/eventos", dependencies=[Depends(require_permission('EVT'))])
async def listar_eventos(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                         usuario_id: int = Depends(require_user)):
    """Lista eventos + comunicados (UNION de hgr_com_cad_evento + hgr_com_cad_inf)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT * FROM (
                SELECT e.id, e.titulo, e.descricao,
                       COALESCE(e.dt_evento, e.dt_hr_ini::date) as dt_evento, e.local,
                       e.status, e.hgr_com_cad_agenda_id as hgr_com_cad_tipo_id,
                       COALESCE(e.created_at, e.created) as created_at,
                       'EVENTO' as _source,
                       u.name as responsavel_nome, t.descricao as tipo
                FROM public.hgr_com_cad_evento e
                LEFT JOIN public.users u ON u.id = COALESCE(e.responsavel_id, e.hgr_usuario_id)
                LEFT JOIN public.hgr_com_cad_tipo t ON t.id = e.hgr_com_cad_agenda_id
                UNION ALL
                SELECT i.id, i.titulo, i.descricao, NULL as dt_evento, NULL as local,
                       CASE WHEN i.ativo = 'S' THEN 'ATIVO' ELSE 'INATIVO' END as status,
                       NULL as hgr_com_cad_tipo_id,
                       COALESCE(i.created_at, i.created) as created_at,
                       'INFORME' as _source,
                       u.name as responsavel_nome, 'Comunicado' as tipo
                FROM public.hgr_com_cad_inf i
                LEFT JOIN public.users u ON u.id = COALESCE(i.responsavel_id, i.createdby)
            ) items
        """
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub")
        total = cur.fetchone()["total"]
        query += " ORDER BY created_at DESC NULLS LAST LIMIT %s OFFSET %s"
        cur.execute(query, (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/eventos", status_code=201, dependencies=[Depends(require_permission('EVT', 'M'))])
async def criar_evento(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_com_cad_evento
            (titulo, descricao, dt_evento, local, hgr_com_cad_tipo_id, responsavel_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("dt_evento"),
             data.get("local"), data.get("hgr_com_cad_tipo_id"),
             data.get("responsavel_id", usuario_id), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/eventos/{id}", dependencies=[Depends(require_permission('EVT'))])
async def obter_evento(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT e.*,
                   COALESCE(e.responsavel_id, e.hgr_usuario_id) as _responsavel_id,
                   u.name as responsavel_nome, t.descricao as tipo
            FROM public.hgr_com_cad_evento e
            LEFT JOIN public.users u ON u.id = COALESCE(e.responsavel_id, e.hgr_usuario_id)
            LEFT JOIN public.hgr_com_cad_tipo t ON t.id = e.hgr_com_cad_agenda_id
            WHERE e.id = %s
        """, (id,))
        evento = cur.fetchone()
        if not evento:
            raise HTTPException(404, "Evento não encontrado")
        # Evidências
        cur.execute("""SELECT * FROM public.hgr_com_cadastro_evid
            WHERE hgr_com_cad_evento_id = %s ORDER BY COALESCE(created_at, created) DESC NULLS LAST""", (id,))
        evento["evidencias"] = cur.fetchall()
        # Não enviar binário do arquivo na resposta JSON
        for ev in evento["evidencias"]:
            ev.pop("arquivo", None)
        return evento
    finally:
        cur.close()
        conn.close()


@router.get("/tipos", dependencies=[Depends(require_permission('EVT'))])
async def listar_tipos_comunicacao(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_com_cad_tipo WHERE ativo = 'S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# ============================================================
# 563 — Participantes de Evento + 566 — RSVP
# ============================================================
@router.post("/eventos/{evt_id}/participantes", status_code=201, dependencies=[Depends(require_permission('EVT', 'M'))])
async def adicionar_participante(evt_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_com_cad_part (
            id BIGSERIAL PRIMARY KEY, hgr_com_cad_evento_id BIGINT NOT NULL,
            usuario_id BIGINT, nome_externo VARCHAR(300),
            rsvp VARCHAR(10) DEFAULT 'PENDENTE',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        conn.commit()
        cur.execute("""INSERT INTO public.hgr_com_cad_part
            (hgr_com_cad_evento_id, usuario_id, nome_externo, rsvp)
            VALUES (%s,%s,%s,%s) RETURNING *""",
            (evt_id, data.get("usuario_id"), data.get("nome_externo"), data.get("rsvp", "PENDENTE")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/eventos/{evt_id}/participantes", dependencies=[Depends(require_permission('EVT'))])
async def listar_participantes(evt_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT p.*, u.name as usuario_nome FROM public.hgr_com_cad_part p
            LEFT JOIN public.users u ON u.id = p.usuario_id
            WHERE p.hgr_com_cad_evento_id = %s ORDER BY COALESCE(u.name, p.nome_externo)""", (evt_id,))
        return {"items": cur.fetchall()}
    except Exception:
        return {"items": []}
    finally:
        cur.close()
        conn.close()


@router.patch("/eventos/{evt_id}/participantes/{part_id}/rsvp", dependencies=[Depends(require_permission('EVT'))])
async def confirmar_presenca(evt_id: int, part_id: int, data: dict, usuario_id: int = Depends(require_user)):
    rsvp = data.get("rsvp", "CONFIRMADO").upper()
    if rsvp not in ("CONFIRMADO", "RECUSADO", "PENDENTE"):
        raise HTTPException(400, "rsvp deve ser CONFIRMADO, RECUSADO ou PENDENTE")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_com_cad_part SET rsvp=%s WHERE id=%s AND hgr_com_cad_evento_id=%s RETURNING *",
                    (rsvp, part_id, evt_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Participante nao encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 567 — CRUD Categorias de Comunicado
# ============================================================
@router.post("/tipos", status_code=201, dependencies=[Depends(require_permission('EVT', 'M'))])
async def criar_tipo_comunicacao(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_com_cad_tipo (descricao) VALUES (%s) RETURNING *",
                    (data.get("descricao"),))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/tipos/{tipo_id}", status_code=204, dependencies=[Depends(require_permission('EVT', 'M'))])
async def excluir_tipo_comunicacao(tipo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_com_cad_tipo SET ativo='N' WHERE id=%s", (tipo_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 568 — Destaque/pin + 565 — Publicacao Programada + 574 — Link externo
# ============================================================
@router.patch("/eventos/{evt_id}/config", dependencies=[Depends(require_permission('EVT', 'M'))])
async def config_evento(evt_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        for col in ["destaque", "link_externo", "dt_publicacao", "tags"]:
            try:
                col_type = "VARCHAR(1)" if col == "destaque" else ("VARCHAR(500)" if col in ("link_externo", "tags") else "TIMESTAMPTZ")
                cur.execute(f"ALTER TABLE public.hgr_com_cad_evento ADD COLUMN IF NOT EXISTS {col} {col_type}")
            except Exception:
                conn.rollback()
        conn.commit()

        fields = []
        params = []
        if "destaque" in data:
            fields.append("destaque=%s")
            params.append("S" if data["destaque"] else "N")
        if "link_externo" in data:
            fields.append("link_externo=%s")
            params.append(data["link_externo"])
        if "dt_publicacao" in data:
            fields.append("dt_publicacao=%s")
            params.append(data["dt_publicacao"])
        if "tags" in data:
            fields.append("tags=%s")
            params.append(data["tags"])

        if fields:
            params.append(evt_id)
            cur.execute(f"UPDATE public.hgr_com_cad_evento SET {', '.join(fields)} WHERE id=%s RETURNING *", params)
            conn.commit()
            return cur.fetchone() or {}
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# 570 — Controle de leitura
# ============================================================
@router.post("/eventos/{evt_id}/leitura", status_code=201, dependencies=[Depends(require_permission('EVT'))])
async def marcar_leitura(evt_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_com_reg_leitura (
            id BIGSERIAL PRIMARY KEY, hgr_com_cad_evento_id BIGINT NOT NULL,
            usuario_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(hgr_com_cad_evento_id, usuario_id)
        )""")
        conn.commit()
        cur.execute("""INSERT INTO public.hgr_com_reg_leitura (hgr_com_cad_evento_id, usuario_id)
            VALUES (%s,%s) ON CONFLICT DO NOTHING RETURNING *""",
            (evt_id, usuario_id))
        conn.commit()
        return cur.fetchone() or {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/eventos/{evt_id}/leitura", dependencies=[Depends(require_permission('EVT'))])
async def quem_leu(evt_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT l.*, u.name as usuario_nome FROM public.hgr_com_reg_leitura l
            LEFT JOIN public.users u ON u.id = l.usuario_id
            WHERE l.hgr_com_cad_evento_id = %s ORDER BY l.created_at""", (evt_id,))
        return {"items": cur.fetchall()}
    except Exception:
        return {"items": []}
    finally:
        cur.close()
        conn.close()


# ============================================================
# 572 — Meus Eventos
# ============================================================
@router.get("/meus-eventos", dependencies=[Depends(require_permission('EVT'))])
async def meus_eventos(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                       usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("""
            SELECT e.id, e.titulo, e.dt_evento, e.local, e.status, p.rsvp,
                   u.name as responsavel_nome
            FROM public.hgr_com_cad_part p
            JOIN public.hgr_com_cad_evento e ON e.id = p.hgr_com_cad_evento_id
            LEFT JOIN public.users u ON u.id = COALESCE(e.responsavel_id, e.hgr_usuario_id)
            WHERE p.usuario_id = %s
            ORDER BY e.dt_evento DESC NULLS LAST
            LIMIT %s OFFSET %s
        """, (usuario_id, per_page, offset))
        items = cur.fetchall()
        return {"items": items, "total": len(items)}
    except Exception:
        return {"items": [], "total": 0}
    finally:
        cur.close()
        conn.close()
