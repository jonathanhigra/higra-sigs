# -*- coding: utf-8 -*-
"""Chamados — CRUD + comentários + histórico de status."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.core.config import logger

router = APIRouter()


def create_chamados_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_chm_cad_cat (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_chm_cad_chm (
                id BIGSERIAL PRIMARY KEY, codigo VARCHAR(50), titulo VARCHAR(500) NOT NULL,
                descricao TEXT, status VARCHAR(20) DEFAULT 'ABERTO',
                prioridade VARCHAR(20) DEFAULT 'MEDIA',
                hgr_chm_cad_cat_id BIGINT, responsavel_id BIGINT,
                solicitante_id BIGINT, dt_abertura DATE DEFAULT CURRENT_DATE,
                dt_fechamento DATE,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_chm_reg_cmt (
                id BIGSERIAL PRIMARY KEY, hgr_chm_cad_chm_id BIGINT NOT NULL,
                comentario TEXT NOT NULL, usuario_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_chm_reg_stt (
                id BIGSERIAL PRIMARY KEY, hgr_chm_cad_chm_id BIGINT NOT NULL,
                status_anterior VARCHAR(20), status_novo VARCHAR(20),
                usuario_id BIGINT, created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_chm_status ON public.hgr_chm_cad_chm(status);")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_chm_cad_tmpl (
            id BIGSERIAL PRIMARY KEY, titulo VARCHAR(200) NOT NULL,
            conteudo TEXT NOT NULL, ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("ALTER TABLE public.hgr_chm_cad_chm ADD COLUMN IF NOT EXISTS dt_sla DATE")
        cur.execute("ALTER TABLE public.hgr_chm_cad_chm ADD COLUMN IF NOT EXISTS pesquisa_satisfacao SMALLINT")
        cur.execute("ALTER TABLE public.hgr_chm_cad_chm ADD COLUMN IF NOT EXISTS observacao_interna TEXT")
        conn.commit()
        logger.info("Tabelas de chamados verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas chamados: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_user)])
async def listar_chamados(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, meus: bool = False,
    nao_atribuidos: bool = Query(False),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT c.*, u.name as responsavel_nome, s.name as solicitante_nome,
                   cat.descricao as categoria,
                   (SELECT COUNT(*) FROM public.hgr_chm_reg_cmt WHERE hgr_chm_cad_chm_id = c.id) as qtd_comentarios
            FROM public.hgr_chm_cad_chm c
            LEFT JOIN public.users u ON u.id = c.responsavel_id
            LEFT JOIN public.users s ON s.id = c.solicitante_id
            LEFT JOIN public.hgr_chm_cad_cat cat ON cat.id = c.hgr_chm_cad_cat_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND c.status = %s"
            params.append(status)
        if meus:
            query += " AND (c.responsavel_id = %s OR c.solicitante_id = %s)"
            params.extend([usuario_id, usuario_id])
        if nao_atribuidos:
            query += " AND c.responsavel_id IS NULL"
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY c.dt_abertura DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard", dependencies=[Depends(require_user)])
async def dashboard_chamados():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_chm_cad_chm")
        total = cur.fetchone()["total"]
        cur.execute("""SELECT status, COUNT(*) as qtd FROM public.hgr_chm_cad_chm
            GROUP BY status""")
        por_status_rows = cur.fetchall()
        por_status = {r["status"]: r["qtd"] for r in por_status_rows}
        cur.execute("""SELECT prioridade, COUNT(*) as qtd FROM public.hgr_chm_cad_chm
            GROUP BY prioridade""")
        por_prioridade_rows = cur.fetchall()
        por_prioridade = {r["prioridade"]: r["qtd"] for r in por_prioridade_rows}
        cur.execute("""SELECT COALESCE(cat.descricao, 'Sem categoria') as categoria,
                COUNT(*) as qtd
            FROM public.hgr_chm_cad_chm c
            LEFT JOIN public.hgr_chm_cad_cat cat ON cat.id = c.hgr_chm_cad_cat_id
            GROUP BY cat.descricao ORDER BY qtd DESC""")
        por_categoria = cur.fetchall()
        cur.execute("""SELECT AVG(dt_fechamento - dt_abertura) as media
            FROM public.hgr_chm_cad_chm
            WHERE dt_fechamento IS NOT NULL""")
        row = cur.fetchone()
        tempo_medio = float(row["media"]) if row and row["media"] is not None else None
        return {
            "total": total,
            "por_status": por_status,
            "por_prioridade": por_prioridade,
            "por_categoria": por_categoria,
            "tempo_medio_resposta_dias": tempo_medio,
        }
    finally:
        cur.close()
        conn.close()


# ── Categorias ────────────────────────────────────────────────────────────────
@router.get("/categorias", dependencies=[Depends(require_user)])
async def listar_categorias():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_chm_cad_cat WHERE ativo='S' ORDER BY descricao")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/categorias", status_code=201, dependencies=[Depends(require_user)])
async def criar_categoria(data: dict):
    if not data.get("descricao"):
        raise HTTPException(400, "descricao obrigatoria")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_chm_cad_cat (descricao) VALUES (%s) RETURNING *",
            (data["descricao"],))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/categorias/{id}", dependencies=[Depends(require_user)])
async def atualizar_categoria(id: int, data: dict):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_chm_cad_cat SET descricao=COALESCE(%s,descricao) WHERE id=%s RETURNING *",
            (data.get("descricao"), id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Categoria não encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Templates ─────────────────────────────────────────────────────────────────
@router.get("/templates", dependencies=[Depends(require_user)])
async def listar_templates():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_chm_cad_tmpl WHERE ativo='S' ORDER BY titulo")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/templates", status_code=201, dependencies=[Depends(require_user)])
async def criar_template(data: dict):
    if not data.get("titulo") or not data.get("conteudo"):
        raise HTTPException(400, "titulo e conteudo obrigatorios")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_chm_cad_tmpl (titulo, conteudo) VALUES (%s,%s) RETURNING *",
            (data["titulo"], data["conteudo"]))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_user)])
async def obter_chamado(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT c.*, u.name as responsavel_nome, s.name as solicitante_nome, cat.descricao as categoria
            FROM public.hgr_chm_cad_chm c
            LEFT JOIN public.users u ON u.id = c.responsavel_id
            LEFT JOIN public.users s ON s.id = c.solicitante_id
            LEFT JOIN public.hgr_chm_cad_cat cat ON cat.id = c.hgr_chm_cad_cat_id
            WHERE c.id = %s
        """, (id,))
        chm = cur.fetchone()
        if not chm:
            raise HTTPException(404, "Chamado não encontrado")
        cur.execute("""SELECT cm.*, u.name as usuario_nome FROM public.hgr_chm_reg_cmt cm
            LEFT JOIN public.users u ON u.id = cm.usuario_id
            WHERE cm.hgr_chm_cad_chm_id = %s ORDER BY cm.created_at ASC""", (id,))
        chm["comentarios"] = cur.fetchall()
        cur.execute("""SELECT * FROM public.hgr_chm_reg_stt
            WHERE hgr_chm_cad_chm_id = %s ORDER BY created_at DESC""", (id,))
        chm["historico_status"] = cur.fetchall()
        return chm
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_user)])
async def criar_chamado(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_chm_cad_chm
            (titulo, descricao, prioridade, hgr_chm_cad_cat_id, responsavel_id, solicitante_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("prioridade", "MEDIA"),
             data.get("hgr_chm_cad_cat_id"), data.get("responsavel_id"), usuario_id, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_user)])
async def atualizar_chamado(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar status atual para log
        cur.execute("SELECT status FROM public.hgr_chm_cad_chm WHERE id = %s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Chamado não encontrado")
        status_anterior = row["status"]
        novo_status = data.get("status")

        cur.execute("""UPDATE public.hgr_chm_cad_chm SET
            titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
            status=COALESCE(%s,status), prioridade=COALESCE(%s,prioridade),
            responsavel_id=COALESCE(%s,responsavel_id), updated_at=NOW()
            WHERE id=%s RETURNING *""",
            (data.get("titulo"), data.get("descricao"), novo_status,
             data.get("prioridade"), data.get("responsavel_id"), id))

        # Log de mudança de status
        if novo_status and novo_status != status_anterior:
            cur.execute("""INSERT INTO public.hgr_chm_reg_stt
                (hgr_chm_cad_chm_id, status_anterior, status_novo, usuario_id)
                VALUES (%s,%s,%s,%s)""", (id, status_anterior, novo_status, usuario_id))

        conn.commit()
        return cur.fetchone()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{chm_id}/comentarios", status_code=201, dependencies=[Depends(require_user)])
async def add_comentario(chm_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_chm_reg_cmt (hgr_chm_cad_chm_id, comentario, usuario_id)
            VALUES (%s,%s,%s) RETURNING *""", (chm_id, data.get("comentario"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Encerrar chamado ──────────────────────────────────────────────────────────
@router.post("/{id}/encerrar", dependencies=[Depends(require_user)])
async def encerrar_chamado(id: int, data: dict, usuario_id: int = Depends(require_user)):
    satisfacao = data.get("pesquisa_satisfacao")
    if satisfacao is not None and satisfacao not in range(1, 6):
        raise HTTPException(400, "pesquisa_satisfacao deve ser entre 1 e 5")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT status FROM public.hgr_chm_cad_chm WHERE id = %s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Chamado não encontrado")
        status_anterior = row["status"]
        cur.execute("""UPDATE public.hgr_chm_cad_chm SET
            status='FECHADO', dt_fechamento=CURRENT_DATE,
            pesquisa_satisfacao=COALESCE(%s, pesquisa_satisfacao),
            updated_at=NOW()
            WHERE id=%s RETURNING *""",
            (satisfacao, id))
        result = cur.fetchone()
        if status_anterior != "FECHADO":
            cur.execute("""INSERT INTO public.hgr_chm_reg_stt
                (hgr_chm_cad_chm_id, status_anterior, status_novo, usuario_id)
                VALUES (%s,%s,'FECHADO',%s)""", (id, status_anterior, usuario_id))
        conn.commit()
        return result
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
