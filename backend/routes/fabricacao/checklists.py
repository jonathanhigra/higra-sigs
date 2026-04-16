# -*- coding: utf-8 -*-
"""
Fabricação / Checklists — o maior módulo do SIGS (90 páginas, 63 tabelas).
APEX: Kanban read-only (pg 278) + step-by-step (BOB→CNJ_MOT→ENS_HID→PIN→QLD→MNT→EXP→EMB)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter
from backend.core.config import logger
from backend.routes.fabricacao.checklist_schemas import (
    ChecklistCreate,
    ChecklistOcorrenciaCreate,
    ChecklistUpdate,
    InstrumentoCreate,
)

router = APIRouter()


def create_fabricacao_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            # Tipos de checklist
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_cck_lis (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200), tipo VARCHAR(20),
                ativo VARCHAR(1) DEFAULT 'S', created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Etapas do checklist
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_etp (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, tipo VARCHAR(20),
                ordem INTEGER, ativo VARCHAR(1) DEFAULT 'S')""",
            # Checklist master
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_cad_cck_lis (
                id BIGSERIAL PRIMARY KEY, pv VARCHAR(50), nr_serie VARCHAR(100),
                cliente VARCHAR(300), equipamento VARCHAR(300), modelo VARCHAR(200),
                status VARCHAR(30) DEFAULT 'ABERTO',
                hgr_fab_ckl_cad_etp_id BIGINT,
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                sth_cad_empresa_id BIGINT, sth_cad_filial_id BIGINT,
                observacoes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            # Ocorrências de fabricação
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_cad_oco (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT,
                descricao TEXT, tipo VARCHAR(20), gravidade VARCHAR(20),
                responsavel_id BIGINT, status VARCHAR(20) DEFAULT 'ABERTA',
                dt_ocorrencia DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            # Instrumentos de medição
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_inst_med (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300) NOT NULL,
                codigo VARCHAR(50), fabricante VARCHAR(200), modelo VARCHAR(200),
                nr_serie VARCHAR(100), dt_calibracao DATE, dt_prox_calibracao DATE,
                status VARCHAR(20) DEFAULT 'ATIVO', localizacao VARCHAR(200),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Log de calibração
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_inst_med_cal_log (
                id BIGSERIAL PRIMARY KEY, hgr_fab_inst_med_id BIGINT NOT NULL,
                dt_calibracao DATE, resultado VARCHAR(20), certificado VARCHAR(200),
                laboratorio VARCHAR(300), observacao TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            # Cadastros auxiliares
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_carc (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_pot (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_tensao (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200), ativo VARCHAR(1) DEFAULT 'S')""",
        ]:
            cur.execute(sql)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_fab_ckl_status ON public.hgr_fab_cad_cck_lis(status);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_fab_inst_prox_cal ON public.hgr_fab_inst_med(dt_prox_calibracao);")
        conn.commit()
        logger.info("Tabelas de fabricação verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas fabricação: {e}")
    finally:
        cur.close()
        conn.close()


# --- Checklists ---
@router.get("/modelos", dependencies=[Depends(require_permission('CHKL'))])
async def listar_modelos(usuario_id: int = Depends(require_user)):
    """Retorna modelos de equipamento distintos para filtro."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT DISTINCT eqp.descricao as modelo
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN public.hgr_fab_ckl_cad_eqp eqp ON eqp.id = c.equip_mod_id
            WHERE eqp.descricao IS NOT NULL
            ORDER BY eqp.descricao
        """)
        return [r["modelo"] for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('CHKL'))])
async def listar_checklists(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, modelo: Optional[str] = None,
    com_ens_hid: Optional[bool] = Query(None),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT c.id, c.pv, c.n_serie::text as nr_serie, c.status,
                   COALESCE(c.created_at, c.created) as created_at,
                   cli.descricao as cliente,
                   eqp.descricao as equipamento,
                   u.name as responsavel_nome
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN public.users u ON u.id = c.createdby
            LEFT JOIN public.hgr_fab_ckl_cad_cli cli ON cli.id = c.clientes_id
            LEFT JOIN public.hgr_fab_ckl_cad_eqp eqp ON eqp.id = c.equip_mod_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND c.status = %s"
            params.append(status)
        if modelo:
            query += " AND eqp.descricao = %s"
            params.append(modelo)
        if com_ens_hid is True:
            query += """ AND EXISTS (
                SELECT 1 FROM public.hgr_fab_reg_ens_hid e
                WHERE e.hgr_fab_cad_cck_lis_id = c.id AND e.dt_conclusao IS NOT NULL
            )"""
        elif com_ens_hid is False:
            query += """ AND NOT EXISTS (
                SELECT 1 FROM public.hgr_fab_reg_ens_hid e
                WHERE e.hgr_fab_cad_cck_lis_id = c.id AND e.dt_conclusao IS NOT NULL
            )"""
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'c')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY COALESCE(c.created_at, c.created) DESC NULLS LAST LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/kanban", dependencies=[Depends(require_permission('CHKL'))])
async def kanban_checklists(usuario_id: int = Depends(require_user)):
    """Kanban read-only de checklists por etapa (APEX pg 278)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Colunas estáticas + dinâmicas
        cur.execute("SELECT id, descricao, ordem FROM public.hgr_fab_ckl_cad_etp WHERE ativo = 'S' ORDER BY ordem")
        etapas = cur.fetchall()
        total_etapas = len(etapas)
        etapa_ordem_map = {e["id"]: e["ordem"] for e in etapas}

        colunas = [
            {"id": 0, "title": "A Fazer", "color": "#6b7280", "items": []},
        ]
        for e in etapas:
            colunas.append({"id": e["id"], "title": e["descricao"], "color": "#ff9800", "items": []})
        colunas.append({"id": -1, "title": "Concluído", "color": "#4caf50", "items": []})

        # Checklists
        cur.execute("""
            SELECT c.id, c.pv, c.n_serie::text as nr_serie, c.status,
                   cli.descricao as cliente, eqp.descricao as modelo,
                   c.hgr_fab_ckl_cad_etp_id, u.name as responsavel_nome,
                   COALESCE(c.updated_at, c.created_at, c.created) as updated_at
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN public.users u ON u.id = c.createdby
            LEFT JOIN public.hgr_fab_ckl_cad_cli cli ON cli.id = c.clientes_id
            LEFT JOIN public.hgr_fab_ckl_cad_eqp eqp ON eqp.id = c.equip_mod_id
            WHERE c.status != 'CANCELADO'
            ORDER BY COALESCE(c.created_at, c.created) DESC NULLS LAST
        """)
        for ckl in cur.fetchall():
            etapa_id = ckl.get("hgr_fab_ckl_cad_etp_id")
            etapa_ord = etapa_ordem_map.get(etapa_id, 0) if etapa_id else 0
            item = {
                **ckl,
                "titulo": f"PV {ckl['pv'] or '—'} · {ckl['nr_serie'] or ''}",
                "etapa_ordem": etapa_ord,
                "total_etapas": total_etapas,
            }
            if ckl["status"] == "CONCLUIDO":
                colunas[-1]["items"].append({**item, "etapa_ordem": total_etapas})
            elif etapa_id:
                col = next((c for c in colunas if c["id"] == etapa_id), None)
                if col:
                    col["items"].append(item)
                else:
                    colunas[0]["items"].append(item)
            else:
                colunas[0]["items"].append(item)

        return {"colunas": colunas, "total_etapas": total_etapas}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('CHKL'))])
async def obter_checklist(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT c.*,
                   c.n_serie::text as nr_serie,
                   cli.descricao as cliente,
                   eqp.descricao as equipamento,
                   u.name as responsavel_nome
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN public.users u ON u.id = c.createdby
            LEFT JOIN public.hgr_fab_ckl_cad_cli cli ON cli.id = c.clientes_id
            LEFT JOIN public.hgr_fab_ckl_cad_eqp eqp ON eqp.id = c.equip_mod_id
            WHERE c.id = %s
        """, (id,))
        ckl = cur.fetchone()
        if not ckl:
            raise HTTPException(404, "Checklist não encontrado")
        # Ocorrências
        cur.execute("""SELECT o.*, u.name as responsavel_nome FROM public.hgr_fab_cad_oco o
            LEFT JOIN public.users u ON u.id = COALESCE(o.responsavel_id, o.hgr_usuario_id)
            WHERE o.hgr_fab_cad_cck_lis_id = %s ORDER BY o.dt_ocorrencia DESC NULLS LAST""", (id,))
        ckl["ocorrencias"] = cur.fetchall()
        return ckl
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_checklist(payload: ChecklistCreate, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_fab_cad_cck_lis
                (pv, nr_serie, cliente, equipamento, modelo, responsavel_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.get("pv"), data.get("nr_serie"), data.get("cliente"),
              data.get("equipamento"), data.get("modelo"), data.get("responsavel_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_checklist(id: int, payload: ChecklistUpdate, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_fab_cad_cck_lis SET
                status=COALESCE(%s,status), hgr_fab_ckl_cad_etp_id=COALESCE(%s,hgr_fab_ckl_cad_etp_id),
                observacoes=COALESCE(%s,observacoes), updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (data.get("status"), data.get("hgr_fab_ckl_cad_etp_id"), data.get("observacoes"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Checklist não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Ocorrências ---
@router.post("/{ckl_id}/ocorrencias", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_ocorrencia(
    ckl_id: int,
    payload: ChecklistOcorrenciaCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_fab_cad_oco
            (hgr_fab_cad_cck_lis_id, descricao, tipo, gravidade, responsavel_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING *""",
            (ckl_id, data.get("descricao"), data.get("tipo"), data.get("gravidade"),
             data.get("responsavel_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Instrumentos de Medição ---
@router.get("/instrumentos/lista", dependencies=[Depends(require_permission('CHKL'))])
async def listar_instrumentos(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                              usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_fab_inst_med")
        total = cur.fetchone()["total"]
        cur.execute("""SELECT id, descricao, inst_tag as codigo, n_serie::text as nr_serie,
                   COALESCE(ult_cal, created::date) as dt_calibracao,
                   prox_cal as dt_prox_calibracao,
                   COALESCE(ativo, 'S') as status, localizacao
            FROM public.hgr_fab_inst_med
            ORDER BY prox_cal ASC NULLS LAST LIMIT %s OFFSET %s""", (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/instrumentos", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_instrumento(payload: InstrumentoCreate, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_fab_inst_med
            (descricao, codigo, fabricante, modelo, nr_serie, dt_calibracao, dt_prox_calibracao, localizacao)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("descricao"), data.get("codigo"), data.get("fabricante"),
             data.get("modelo"), data.get("nr_serie"), data.get("dt_calibracao"),
             data.get("dt_prox_calibracao"), data.get("localizacao")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
