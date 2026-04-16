# -*- coding: utf-8 -*-
"""
RQ03 Configurações — Cadastros auxiliares (tarefas 264-265)
  - Agente Causador (hgr_sst_cad_agente_caus) — usado em SST
  - Classificação Primária (hgr_rq03_cad_class_prim) — tipo de NC
  - Classificação Secundária (hgr_rq03_cad_class_sec)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission

router = APIRouter()


def create_rq03_config_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            # Agente Causador SST (tarefa 264)
            """CREATE TABLE IF NOT EXISTS public.hgr_sst_cad_agente_caus (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                categoria VARCHAR(100),
                ativo VARCHAR(1) DEFAULT 'S'
            )""",
            # Classificação Primária RQ03 (tarefa 265)
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_cad_class_prim (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                sigla VARCHAR(20),
                ativo VARCHAR(1) DEFAULT 'S'
            )""",
            # Classificação Secundária RQ03 (tarefa 266)
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_cad_class_sec (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                hgr_rq03_cad_class_prim_id BIGINT REFERENCES public.hgr_rq03_cad_class_prim(id) ON DELETE SET NULL,
                ativo VARCHAR(1) DEFAULT 'S'
            )""",
        ]:
            cur.execute(sql)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- helpers -----------------------------------------------------------------
def _crud(table: str, label: str, extra_cols: list[str] | None = None):
    """Factory: returns (get_list, post, put, delete) handlers for a simple cadastro table."""
    cols = extra_cols or []

    async def get_list(ativo: Optional[str] = None, usuario_id: int = Depends(require_user)):
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            sql = f"SELECT * FROM public.{table}"
            params = []
            if ativo:
                sql += " WHERE ativo = %s"
                params.append(ativo)
            sql += " ORDER BY descricao"
            cur.execute(sql, params)
            return cur.fetchall()
        finally:
            cur.close()
            conn.close()

    return get_list


# ---- Agente Causador SST (tarefa 264) ----------------------------------------
class AgenteCausadorIn(BaseModel):
    descricao: str = Field(..., min_length=1, max_length=200)
    categoria: Optional[str] = Field(None, max_length=100)
    ativo: str = Field("S", max_length=1)


@router.get("/sst/agentes-causadores", dependencies=[Depends(require_user)])
async def listar_agentes_causadores(ativo: Optional[str] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        sql = "SELECT * FROM public.hgr_sst_cad_agente_caus"
        params = []
        if ativo:
            sql += " WHERE ativo = %s"
            params.append(ativo)
        sql += " ORDER BY descricao"
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/sst/agentes-causadores", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_agente_causador(payload: AgenteCausadorIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_sst_cad_agente_caus (descricao, categoria, ativo) VALUES (%s, %s, %s) RETURNING *",
            (payload.descricao, payload.categoria, payload.ativo),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/sst/agentes-causadores/{item_id}", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def atualizar_agente_causador(item_id: int, payload: AgenteCausadorIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_sst_cad_agente_caus SET descricao=%s, categoria=%s, ativo=%s WHERE id=%s RETURNING *",
            (payload.descricao, payload.categoria, payload.ativo, item_id),
        )
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Agente causador não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/sst/agentes-causadores/{item_id}", status_code=204, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def deletar_agente_causador(item_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_sst_cad_agente_caus WHERE id=%s", (item_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Classificação Primária RQ03 (tarefa 265) --------------------------------
class ClassifPrimIn(BaseModel):
    descricao: str = Field(..., min_length=1, max_length=200)
    sigla: Optional[str] = Field(None, max_length=20)
    ativo: str = Field("S", max_length=1)


@router.get("/class-prim", dependencies=[Depends(require_user)])
async def listar_class_prim(ativo: Optional[str] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        sql = "SELECT * FROM public.hgr_rq03_cad_class_prim"
        params = []
        if ativo:
            sql += " WHERE ativo = %s"
            params.append(ativo)
        sql += " ORDER BY descricao"
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/class-prim", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_class_prim(payload: ClassifPrimIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_rq03_cad_class_prim (descricao, sigla, ativo) VALUES (%s, %s, %s) RETURNING *",
            (payload.descricao, payload.sigla, payload.ativo),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/class-prim/{item_id}", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def atualizar_class_prim(item_id: int, payload: ClassifPrimIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_rq03_cad_class_prim SET descricao=%s, sigla=%s, ativo=%s WHERE id=%s RETURNING *",
            (payload.descricao, payload.sigla, payload.ativo, item_id),
        )
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Classificação não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/class-prim/{item_id}", status_code=204, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def deletar_class_prim(item_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_rq03_cad_class_prim WHERE id=%s", (item_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Classificação Secundária RQ03 (tarefa 266) --------------------------------
class ClassifSecIn(BaseModel):
    descricao: str = Field(..., min_length=1, max_length=200)
    hgr_rq03_cad_class_prim_id: Optional[int] = None
    ativo: str = Field("S", max_length=1)


@router.get("/class-sec", dependencies=[Depends(require_user)])
async def listar_class_sec(ativo: Optional[str] = None, prim_id: Optional[int] = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        sql = """SELECT s.*, p.descricao as class_prim_descricao
                 FROM public.hgr_rq03_cad_class_sec s
                 LEFT JOIN public.hgr_rq03_cad_class_prim p ON p.id = s.hgr_rq03_cad_class_prim_id"""
        conds, params = [], []
        if ativo:
            conds.append("s.ativo = %s"); params.append(ativo)
        if prim_id:
            conds.append("s.hgr_rq03_cad_class_prim_id = %s"); params.append(prim_id)
        if conds:
            sql += " WHERE " + " AND ".join(conds)
        sql += " ORDER BY s.descricao"
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/class-sec", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_class_sec(payload: ClassifSecIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_rq03_cad_class_sec (descricao, hgr_rq03_cad_class_prim_id, ativo) VALUES (%s, %s, %s) RETURNING *",
            (payload.descricao, payload.hgr_rq03_cad_class_prim_id, payload.ativo),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/class-sec/{item_id}", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def atualizar_class_sec(item_id: int, payload: ClassifSecIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_rq03_cad_class_sec SET descricao=%s, hgr_rq03_cad_class_prim_id=%s, ativo=%s WHERE id=%s RETURNING *",
            (payload.descricao, payload.hgr_rq03_cad_class_prim_id, payload.ativo, item_id),
        )
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Classificação secundária não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/class-sec/{item_id}", status_code=204, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def deletar_class_sec(item_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_rq03_cad_class_sec WHERE id=%s", (item_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
