# -*- coding: utf-8 -*-
"""CRUD de Documentos + Revisões + Compartilhamento."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter, get_user_tipo
from backend.core.config import logger
from backend.services.sigs_notifications import notify_doc_compartilhado

router = APIRouter()


def create_documentos_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.sth_doc_cad_tipo (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.beg_cad_documento (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500) NOT NULL, descricao TEXT,
                codigo VARCHAR(50), revisao_atual INTEGER DEFAULT 1,
                sth_doc_cad_tipo_id BIGINT, beg_processo_id BIGINT,
                responsavel_id BIGINT, status VARCHAR(20) DEFAULT 'VIGENTE',
                arquivo BYTEA, filename VARCHAR(500), mimetype VARCHAR(200),
                created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.beg_rev_documento (
                id BIGSERIAL PRIMARY KEY, beg_cad_documento_id BIGINT NOT NULL,
                numero_revisao INTEGER, descricao_alteracao TEXT,
                arquivo BYTEA, filename VARCHAR(500), mimetype VARCHAR(200),
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_doc_reg_usu (
                id BIGSERIAL PRIMARY KEY, beg_cad_documento_id BIGINT NOT NULL,
                usuario_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        conn.commit()
        logger.info("Tabelas de documentos verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas documentos: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('DCMT'))])
async def listar_documentos(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    tipo_id: Optional[int] = None, usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT d.id,
                   COALESCE(d.titulo, d.descricao) as titulo,
                   COALESCE(d.codigo, d.cod_documento) as codigo,
                   d.revisao_atual, d.status, d.filename,
                   d.ativo, d.tp_acesso,
                   COALESCE(d.created_at, d.created) as created_at,
                   COALESCE(d.responsavel_id, d.hgr_usuario_id) as _responsavel_id,
                   t.descricao as tipo, u.name as responsavel_nome,
                   p.nome as processo_nome
            FROM public.beg_cad_documento d
            LEFT JOIN public.sth_doc_cad_tipo t ON t.id = d.sth_doc_cad_tipo_id
            LEFT JOIN public.users u ON u.id = COALESCE(d.responsavel_id, d.hgr_usuario_id)
            LEFT JOIN public.beg_processo p ON p.id = COALESCE(d.beg_processo_id, d.sth_cad_processo_id)
            WHERE 1=1
        """
        params = []
        if tipo_id:
            query += " AND d.sth_doc_cad_tipo_id = %s"
            params.append(tipo_id)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'd')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY COALESCE(d.titulo, d.descricao) LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('DCMT'))])
async def obter_documento(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT d.*,
                   COALESCE(d.titulo, d.descricao) as _titulo,
                   COALESCE(d.codigo, d.cod_documento) as _codigo,
                   COALESCE(d.responsavel_id, d.hgr_usuario_id) as _responsavel_id,
                   t.descricao as tipo, u.name as responsavel_nome,
                   p.nome as processo_nome
            FROM public.beg_cad_documento d
            LEFT JOIN public.sth_doc_cad_tipo t ON t.id = d.sth_doc_cad_tipo_id
            LEFT JOIN public.users u ON u.id = COALESCE(d.responsavel_id, d.hgr_usuario_id)
            LEFT JOIN public.beg_processo p ON p.id = COALESCE(d.beg_processo_id, d.sth_cad_processo_id)
            WHERE d.id = %s
        """, (id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Documento não encontrado")

        # Scope validation
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = doc.get('sth_cad_filial_id') or doc.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")

        # Revisões
        cur.execute("""SELECT r.id,
               r.beg_cad_documento_id,
               COALESCE(r.numero_revisao, r.revisao) as numero_revisao,
               COALESCE(r.descricao_alteracao, r.descr_alteracoes) as descricao_alteracao,
               r.filename, r.mimetype,
               COALESCE(r.dt_revisao, r.created)::date as dt_revisao,
               COALESCE(r.created_at, r.created) as created_at,
               u.name as autor
            FROM public.beg_rev_documento r
            LEFT JOIN public.users u ON u.id = COALESCE(r.created_by, r.createdby)
            WHERE r.beg_cad_documento_id = %s
            ORDER BY COALESCE(r.numero_revisao, r.revisao) DESC""", (id,))
        doc["revisoes"] = cur.fetchall()
        # Distribuição (processos vinculados ao documento)
        cur.execute("""SELECT dp.id, dp.hgr_cad_processo_id, p.nome as processo_nome,
               COALESCE(dp.created, dp.updated)::date as dt_vinculo
            FROM public.hgr_doc_reg_proc dp
            LEFT JOIN public.beg_processo p ON p.id = dp.hgr_cad_processo_id
            WHERE dp.hgr_cad_documento_id = %s
            ORDER BY p.nome""", (id,))
        doc["distribuicao"] = cur.fetchall()
        # Compartilhado com (usuarios)
        cur.execute("""SELECT s.*, u.name as usuario_nome FROM public.hgr_doc_reg_usu s
            LEFT JOIN public.users u ON u.id = s.usuario_id
            WHERE s.beg_cad_documento_id = %s""", (id,))
        doc["compartilhado_com"] = cur.fetchall()
        # Não enviar binário do arquivo na resposta JSON
        doc.pop("arquivo", None)
        doc.pop("documento", None)
        return doc
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def criar_documento(data: dict, usuario_id: int = Depends(require_user)):
    # Auto-fill empresa/filial from logged-in user
    user_data = get_user_tipo(usuario_id)
    if user_data:
        if not data.get('sth_cad_empresa_id'):
            data['sth_cad_empresa_id'] = user_data.get('sth_cad_empresa_id')
        if not data.get('sth_cad_filial_id'):
            data['sth_cad_filial_id'] = user_data.get('sth_cad_filial_id')
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.beg_cad_documento
                (titulo, descricao, codigo, sth_doc_cad_tipo_id, beg_processo_id,
                 responsavel_id, sth_cad_empresa_id, sth_cad_filial_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, titulo, codigo, status, created_at
        """, (data.get("titulo"), data.get("descricao"), data.get("codigo"),
              data.get("sth_doc_cad_tipo_id"), data.get("beg_processo_id"),
              data.get("responsavel_id", usuario_id),
              data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('DCMT', 'M'))])
async def atualizar_documento(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_cad_documento SET
                titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
                status=COALESCE(%s,status), updated_at=NOW()
            WHERE id=%s RETURNING id, titulo, status
        """, (data.get("titulo"), data.get("descricao"), data.get("status"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Documento não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Compartilhar (modal) ---
@router.post("/{doc_id}/compartilhar", status_code=201, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def compartilhar(doc_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_doc_reg_usu (beg_cad_documento_id, usuario_id)
            VALUES (%s, %s) RETURNING *
        """, (doc_id, data.get("usuario_id")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Download revisão ---
@router.get("/revisoes/{rev_id}/download", dependencies=[Depends(require_permission('DCMT'))])
async def download_revisao(rev_id: int, usuario_id: int = Depends(require_user)):
    """Download do arquivo PDF/documento de uma revisão."""
    from fastapi.responses import Response
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT documento, filename, mimetype FROM public.beg_rev_documento
            WHERE id = %s""", (rev_id,))
        row = cur.fetchone()
        if not row or not row.get('documento'):
            raise HTTPException(404, "Arquivo não encontrado")
        content = bytes(row['documento']) if isinstance(row['documento'], memoryview) else row['documento']
        return Response(
            content=content,
            media_type=row.get('mimetype', 'application/octet-stream'),
            headers={"Content-Disposition": f"inline; filename=\"{row.get('filename', 'documento')}\""}
        )
    finally:
        cur.close()
        conn.close()


# --- Distribuição (processos vinculados) ---
@router.post("/{doc_id}/distribuicao", status_code=201, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def add_distribuicao(doc_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_doc_reg_proc (hgr_cad_documento_id, hgr_cad_processo_id, createdby)
            VALUES (%s, %s, %s) RETURNING id""",
            (doc_id, data.get("processo_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{doc_id}/distribuicao/{proc_id}", status_code=204, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def remove_distribuicao(doc_id: int, proc_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_doc_reg_proc WHERE id = %s AND hgr_cad_documento_id = %s", (proc_id, doc_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Tipos ---
@router.get("/tipos/lista", dependencies=[Depends(require_permission('DCMT'))])
async def listar_tipos(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.sth_doc_cad_tipo WHERE ativo = 'S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# --- Revisões (CRUD) ---
@router.post("/{doc_id}/revisoes", status_code=201, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def criar_revisao(doc_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Cria nova revisão de documento. APEX: nova revisão."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Próximo número de revisão
        cur.execute(
            "SELECT COALESCE(MAX(COALESCE(numero_revisao, revisao)), 0) + 1 as prox "
            "FROM public.beg_rev_documento WHERE beg_cad_documento_id = %s", (doc_id,)
        )
        prox = cur.fetchone()["prox"]
        cur.execute("""
            INSERT INTO public.beg_rev_documento
                (beg_cad_documento_id, numero_revisao, descricao_alteracao, filename, created_by)
            VALUES (%s, %s, %s, %s, %s) RETURNING *
        """, (doc_id, prox, data.get("descricao_alteracao"), data.get("filename"), usuario_id))
        revisao = cur.fetchone()
        # Atualizar revisao_atual no documento
        cur.execute("""
            UPDATE public.beg_cad_documento SET revisao_atual=%s, updated_at=NOW()
            WHERE id=%s
        """, (prox, doc_id))
        conn.commit()

        # Notificar usuários compartilhados (distribuição automática)
        if data.get("notificar", True):
            try:
                cur.execute("""
                    SELECT u.id as usuario_id, u.name FROM public.hgr_doc_reg_usu s
                    LEFT JOIN public.users u ON u.id = s.usuario_id
                    WHERE s.beg_cad_documento_id = %s
                """, (doc_id,))
                destinatarios = [r["usuario_id"] for r in cur.fetchall() if r.get("usuario_id")]
                if destinatarios:
                    notify_doc_compartilhado(doc_id, data.get("titulo", f"Documento #{doc_id}"),
                                             destinatarios, usuario_id)
            except Exception:
                pass
        return revisao
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Tipos CRUD ---
@router.post("/tipos", status_code=201, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def criar_tipo_doc(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        descricao = (data.get("descricao") or "").strip()
        if not descricao:
            raise HTTPException(400, "descricao obrigatória")
        cur.execute("""
            INSERT INTO public.sth_doc_cad_tipo (descricao, ativo)
            VALUES (%s, 'S') RETURNING *
        """, (descricao,))
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


@router.delete("/tipos/{tipo_id}", status_code=204, dependencies=[Depends(require_permission('DCMT', 'M'))])
async def excluir_tipo_doc(tipo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.sth_doc_cad_tipo SET ativo='N' WHERE id=%s", (tipo_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Log de downloads ---
@router.post("/revisoes/{rev_id}/log-download", status_code=201, dependencies=[Depends(require_permission('DCMT'))])
async def log_download(rev_id: int, usuario_id: int = Depends(require_user)):
    """Registra o download de uma revisão (auditoria)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_doc_reg_download (
            id BIGSERIAL PRIMARY KEY, beg_rev_documento_id BIGINT,
            usuario_id BIGINT, downloaded_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        cur.execute(
            "INSERT INTO public.hgr_doc_reg_download (beg_rev_documento_id, usuario_id) VALUES (%s, %s) RETURNING *",
            (rev_id, usuario_id)
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Controle de acesso (tp_acesso) + Próxima revisão ---
@router.patch("/{doc_id}/acesso", dependencies=[Depends(require_permission('DCMT', 'M'))])
async def atualizar_acesso(doc_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Atualiza tp_acesso e/ou dt_proxima_revisao do documento."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("ALTER TABLE public.beg_cad_documento ADD COLUMN IF NOT EXISTS tp_acesso VARCHAR(20)")
        cur.execute("ALTER TABLE public.beg_cad_documento ADD COLUMN IF NOT EXISTS dt_proxima_revisao DATE")
        cur.execute("""
            UPDATE public.beg_cad_documento SET
                tp_acesso=COALESCE(%s, tp_acesso),
                dt_proxima_revisao=COALESCE(%s, dt_proxima_revisao),
                updated_at=NOW()
            WHERE id=%s RETURNING id, titulo, tp_acesso, dt_proxima_revisao
        """, (data.get("tp_acesso"), data.get("dt_proxima_revisao"), doc_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Documento não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
