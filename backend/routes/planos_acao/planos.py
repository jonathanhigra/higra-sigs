# -*- coding: utf-8 -*-
"""CRUD de Planos de Ação (GAC) — vinculados a RQ03, RQ49, RQ80 e metas."""

import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import ensure_table_columns, get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter, get_user_tipo
from backend.core.config import logger
from backend.services.sigs_notifications import notify_plano_atribuido
from backend.routes.planos_acao.schemas import PlanoCreate, PlanoUpdate

router = APIRouter()


VALID_SOURCES = {"GAC", "RQ80"}


def _normalize_source(source: Optional[str]) -> Optional[str]:
    if source is None:
        return None
    normalized = str(source).strip().upper()
    if not normalized:
        return None
    if normalized not in VALID_SOURCES:
        raise HTTPException(400, "Fonte de plano inválida")
    return normalized


def _registrar_historico(conn, cur, plano_id: int, usuario_id: int, acao: str, detalhes: str = None):
    """Insere uma entrada no histórico sem lançar exceção."""
    try:
        cur.execute(
            """INSERT INTO public.hgr_gac_historico (plano_id, usuario_id, acao, detalhes)
               VALUES (%s, %s, %s, %s)""",
            (plano_id, usuario_id, acao, detalhes),
        )
    except Exception:
        pass


def create_planos_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_gac_reg_tar (
                id BIGSERIAL PRIMARY KEY,
                titulo VARCHAR(500) NOT NULL,
                descricao TEXT,
                responsavel_id BIGINT,
                dt_prazo DATE,
                status VARCHAR(20) DEFAULT 'PENDENTE',
                origem_tipo VARCHAR(20),
                origem_id BIGINT,
                hgr_tar_cad_tarefa_id BIGINT,
                metodo TEXT,
                local VARCHAR(300),
                custo NUMERIC(15,2),
                custo_realizado NUMERIC(15,2),
                tempo_execucao NUMERIC(10,2),
                dt_reagendamento DATE,
                justificativa_reagendamento TEXT,
                aval_implementacao TEXT,
                motivo_cancelamento TEXT,
                beg_processo_id BIGINT,
                sth_cad_empresa_id BIGINT,
                sth_cad_filial_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        ensure_table_columns(
            conn,
            "hgr_gac_reg_tar",
            [
                ("metodo", "metodo TEXT"),
                ("local", "local VARCHAR(300)"),
                ("custo", "custo NUMERIC(15,2)"),
                ("custo_realizado", "custo_realizado NUMERIC(15,2)"),
                ("tempo_execucao", "tempo_execucao NUMERIC(10,2)"),
                ("dt_reagendamento", "dt_reagendamento DATE"),
                ("justificativa_reagendamento", "justificativa_reagendamento TEXT"),
                ("aval_implementacao", "aval_implementacao TEXT"),
                ("motivo_cancelamento", "motivo_cancelamento TEXT"),
                ("beg_processo_id", "beg_processo_id BIGINT"),
                ("sth_cad_empresa_id", "sth_cad_empresa_id BIGINT"),
                ("sth_cad_filial_id", "sth_cad_filial_id BIGINT"),
            ],
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gac_origem ON public.hgr_gac_reg_tar(origem_tipo, origem_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gac_filial ON public.hgr_gac_reg_tar(sth_cad_filial_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gac_responsavel ON public.hgr_gac_reg_tar(responsavel_id);")
        # Feature tables
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_gac_reg_tar_link (
            id BIGSERIAL PRIMARY KEY,
            hgr_gac_cad_acao_id BIGINT NOT NULL,
            hgr_tar_cad_tarefa_id BIGINT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(hgr_gac_cad_acao_id, hgr_tar_cad_tarefa_id))""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.beg_rq80_reg_usu (
            id BIGSERIAL PRIMARY KEY,
            beg_rq80_id BIGINT NOT NULL,
            beg_usuarios_id BIGINT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(beg_rq80_id, beg_usuarios_id))""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.beg_rq80_evid (
            id BIGSERIAL PRIMARY KEY,
            beg_rq80_id BIGINT NOT NULL,
            dt_cad_evid DATE DEFAULT CURRENT_DATE,
            observacoes TEXT,
            anexo BYTEA, mimetype VARCHAR(200), filename VARCHAR(500),
            dt_atualizacao TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_gac_historico (
            id BIGSERIAL PRIMARY KEY,
            plano_id BIGINT NOT NULL,
            usuario_id INTEGER,
            acao VARCHAR(100) NOT NULL,
            detalhes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gac_hist_plano ON public.hgr_gac_historico(plano_id);")
        # Extra columns added after initial release
        ensure_table_columns(conn, "hgr_gac_reg_tar", [
            ("dt_implementacao", "dt_implementacao DATE"),
            ("criterio_aceitacao", "criterio_aceitacao TEXT"),
            ("percentual", "percentual INTEGER DEFAULT 0"),
            ("deleted_at", "deleted_at TIMESTAMPTZ"),
        ])
        ensure_table_columns(conn, "hgr_gac_reg_tar_link", [
            ("ordem", "ordem INTEGER DEFAULT 0"),
        ])
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_gac_fts
            ON public.hgr_gac_reg_tar
            USING GIN (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(descricao,'')))
        """)
        conn.commit()
        logger.info("Tabelas de planos de ação verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas planos de ação: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('GACO'))])
async def listar_planos(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, origem_tipo: Optional[str] = None,
    por: Optional[str] = None, filial_id: Optional[int] = None, search: Optional[str] = None,
    responsavel_id: Optional[int] = None,
    dt_prazo_inicio: Optional[str] = None, dt_prazo_fim: Optional[str] = None,
    dt_criado_inicio: Optional[str] = None, dt_criado_fim: Optional[str] = None,
    sort_by: str = Query("dt_prazo", regex="^(dt_prazo|created_at|titulo|status)$"),
    sort_dir: str = Query("asc", regex="^(asc|desc)$"),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        row_status_sql = """
            CASE
                WHEN planos.status = 'AVALIACAO' THEN 'AVALIACAO'
                WHEN planos.status = 'CANCELADO' THEN 'CANCELADO'
                WHEN planos.status IN ('CONCLUIDO', 'IMPLEMENTADO') THEN 'IMPLEMENTADO'
                WHEN planos.dt_prazo IS NOT NULL
                     AND planos.dt_prazo < CURRENT_DATE
                     AND planos.status NOT IN ('CONCLUIDO', 'IMPLEMENTADO', 'CANCELADO')
                    THEN 'VENCIDA'
                ELSE 'PENDENTE'
            END
        """
        progress_sql = """,
            (SELECT COUNT(*) FROM public.hgr_gac_reg_tar_link lnk
             WHERE lnk.hgr_gac_cad_acao_id = planos.id AND planos._source = 'GAC') AS tarefas_total,
            (SELECT COUNT(*) FROM public.hgr_gac_reg_tar_link lnk
             JOIN public.hgr_tar_cad_tarefa tsk ON tsk.id = lnk.hgr_tar_cad_tarefa_id
             WHERE lnk.hgr_gac_cad_acao_id = planos.id AND planos._source = 'GAC'
               AND tsk.status IN ('CONCLUIDA', 'ENTREGUE')) AS tarefas_concluidas"""
        query = """
            SELECT planos.*, """ + row_status_sql + """ as row_status""" + progress_sql + """
            FROM (
                SELECT g.id, g.titulo, g.descricao, g.responsavel_id,
                       g.dt_prazo, g.status, g.origem_tipo, g.origem_id,
                       g.created_at, g.created_by, 'GAC' as _source,
                       u.name as responsavel_nome,
                       uc.name as criador_nome,
                       g.id as num_mestre, 1 as sequencia,
                       g.sth_cad_empresa_id, g.sth_cad_filial_id, g.beg_processo_id,
                       f.descricao as filial_nome
                FROM public.hgr_gac_reg_tar g
                LEFT JOIN public.users u ON u.id = g.responsavel_id
                LEFT JOIN public.users uc ON uc.id = g.created_by
                LEFT JOIN public.sth_cad_filial f ON f.id = g.sth_cad_filial_id
                WHERE g.deleted_at IS NULL
                UNION ALL
                SELECT r.id, r.acao as titulo,
                       COALESCE(r.motivo, '') || CASE WHEN r.metodo IS NOT NULL THEN E'\\n' || r.metodo ELSE '' END as descricao,
                       r.beg_usuario_id as responsavel_id,
                       r.previsao::date as dt_prazo,
                       CASE r.ind_implementacao
                           WHEN 'S' THEN 'IMPLEMENTADO'
                           WHEN 'N' THEN 'PENDENTE'
                           WHEN 'C' THEN 'CANCELADO'
                           WHEN 'A' THEN 'ABERTO'
                           WHEN 'I' THEN 'IMPLEMENTADO'
                           ELSE 'PENDENTE'
                       END as status,
                       CASE WHEN r.beg_rq49_id IS NOT NULL THEN 'RQ49' ELSE NULL END as origem_tipo,
                       r.beg_rq49_id as origem_id,
                       COALESCE(r.created, r.dt_inclusao) as created_at,
                       r.createdby as created_by,
                       'RQ80' as _source,
                       u.name as responsavel_nome,
                       uc.name as criador_nome,
                       COALESCE(r.num_mestre, r.id) as num_mestre,
                       COALESCE(r.sequencia, 1) as sequencia,
                       r.sth_cad_empresa_id, r.sth_cad_filial_id,
                       r.sth_cad_processo_id as beg_processo_id,
                       f.descricao as filial_nome
                FROM public.beg_rq80 r
                LEFT JOIN public.users u ON u.id = r.beg_usuario_id
                LEFT JOIN public.users uc ON uc.id = r.createdby
                LEFT JOIN public.sth_cad_filial f ON f.id = r.sth_cad_filial_id
            ) planos WHERE 1=1
        """
        params = []
        if status:
            query += f" AND {row_status_sql} = %s"
            params.append(status)
        if origem_tipo:
            query += " AND planos.origem_tipo = %s"
            params.append(origem_tipo)
        if filial_id:
            query += " AND planos.sth_cad_filial_id = %s"
            params.append(filial_id)
        if search:
            query += """
                AND (
                    COALESCE(planos.titulo, '') ILIKE %s
                    OR COALESCE(planos.descricao, '') ILIKE %s
                    OR COALESCE(planos.responsavel_nome, '') ILIKE %s
                    OR COALESCE(planos.criador_nome, '') ILIKE %s
                    OR COALESCE(planos.filial_nome, '') ILIKE %s
                )
            """
            like = f"%{search}%"
            params.extend([like, like, like, like, like])
        if responsavel_id:
            query += " AND planos.responsavel_id = %s"
            params.append(responsavel_id)
        if dt_prazo_inicio:
            query += " AND planos.dt_prazo >= %s"
            params.append(dt_prazo_inicio)
        if dt_prazo_fim:
            query += " AND planos.dt_prazo <= %s"
            params.append(dt_prazo_fim)
        if dt_criado_inicio:
            query += " AND planos.created_at::date >= %s"
            params.append(dt_criado_inicio)
        if dt_criado_fim:
            query += " AND planos.created_at::date <= %s"
            params.append(dt_criado_fim)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, "planos")
        query += scope_sql
        params.extend(scope_params)
        if por == 'M' or por == 'SO':
            query += " AND (planos.responsavel_id = %s OR planos.created_by = %s)"
            params.extend([usuario_id, usuario_id])
        elif por == 'P' and scope.get('processo_ids'):
            placeholders = ','.join(['%s'] * len(scope['processo_ids']))
            query += f" AND planos.beg_processo_id IN ({placeholders})"
            params.extend(scope['processo_ids'])
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        _sort_col = {
            'dt_prazo': 'planos.dt_prazo',
            'created_at': 'planos.created_at',
            'titulo': 'planos.titulo',
            'status': 'row_status',
        }.get(sort_by, 'planos.dt_prazo')
        _sort_dir = 'DESC' if sort_dir == 'desc' else 'ASC'
        query += f" ORDER BY {_sort_col} {_sort_dir} NULLS LAST LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('GACO'))])
async def obter_plano(id: int, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    source = _normalize_source(source)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        row = None
        # Try hgr_gac_reg_tar first (new records), then beg_rq80 (Oracle)
        if source != 'RQ80':
            cur.execute("""
                SELECT g.*, g.id as num_mestre, 1 as sequencia,
                       u.name as responsavel_nome, uc.name as criador_nome, 'GAC' as _source,
                       f.descricao as filial_nome
                FROM public.hgr_gac_reg_tar g
                LEFT JOIN public.users u ON u.id = g.responsavel_id
                LEFT JOIN public.users uc ON uc.id = g.created_by
                LEFT JOIN public.sth_cad_filial f ON f.id = g.sth_cad_filial_id
                WHERE g.id = %s AND g.deleted_at IS NULL
            """, (id,))
            row = cur.fetchone()

        if not row and source in (None, 'RQ80'):
            cur.execute("""
                SELECT r.id, r.acao as titulo,
                       r.motivo, r.metodo, r.local, r.custo, r.custo_realizado,
                       r.motivo as descricao, r.observacoes,
                       r.beg_usuario_id as responsavel_id,
                       r.previsao::date as dt_prazo,
                       r.dt_implementacao,
                       r.aval_efic, r.aval_implementacao,
                       CASE r.ind_implementacao
                           WHEN 'S' THEN 'IMPLEMENTADO' WHEN 'N' THEN 'PENDENTE'
                           WHEN 'C' THEN 'CANCELADO' ELSE 'PENDENTE'
                       END as status,
                       r.ind_implementacao,
                       r.beg_rq49_id as origem_id,
                       CASE WHEN r.beg_rq49_id IS NOT NULL THEN 'RQ49' ELSE NULL END as origem_tipo,
                       r.sth_cad_empresa_id, r.sth_cad_filial_id, r.sth_cad_processo_id,
                       r.sequencia, r.num_mestre,
                       r.nprevisao as dt_reagendamento,
                       r.mot_nimpl as justificativa_reagendamento,
                       r.mot_nimpl as motivo_cancelamento,
                       r.tempo_execucao,
                       COALESCE(r.created, r.dt_inclusao) as created_at,
                       r.createdby as created_by,
                       'RQ80' as _source,
                       u.name as responsavel_nome, uc.name as criador_nome,
                       f.descricao as filial_nome,
                       s.sigla as sigla_codigo, s.descricao as sigla_descricao
                FROM public.beg_rq80 r
                LEFT JOIN public.users u ON u.id = r.beg_usuario_id
                LEFT JOIN public.users uc ON uc.id = r.createdby
                LEFT JOIN public.sth_cad_filial f ON f.id = r.sth_cad_filial_id
                LEFT JOIN public.beg_sigla_pa s ON s.id = r.sth_gac_sigla_id
                WHERE r.id = %s
            """, (id,))
            row = cur.fetchone()

        if not row:
            raise HTTPException(404, "Plano de ação não encontrado")
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = row.get('sth_cad_filial_id') or row.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")
        if row.get('_source') == 'GAC':
            cur.execute("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE t.status IN ('CONCLUIDA', 'ENTREGUE')) AS concluidas
                FROM public.hgr_gac_reg_tar_link lnk
                JOIN public.hgr_tar_cad_tarefa t ON t.id = lnk.hgr_tar_cad_tarefa_id
                WHERE lnk.hgr_gac_cad_acao_id = %s
            """, (id,))
            counts = cur.fetchone()
            row = dict(row)
            row['tarefas_total'] = counts['total'] if counts else 0
            row['tarefas_concluidas'] = counts['concluidas'] if counts else 0
        return row
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def criar_plano(data: PlanoCreate, usuario_id: int = Depends(require_user)):
    payload = data.model_dump(exclude_unset=True)
    user_data = get_user_tipo(usuario_id)
    if user_data:
        if not payload.get("sth_cad_empresa_id"):
            payload["sth_cad_empresa_id"] = user_data.get("sth_cad_empresa_id")
        if not payload.get("sth_cad_filial_id"):
            payload["sth_cad_filial_id"] = user_data.get("sth_cad_filial_id")
        if not payload.get("beg_processo_id"):
            payload["beg_processo_id"] = user_data.get("beg_processo_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_gac_reg_tar
                (titulo, descricao, responsavel_id, dt_prazo, status, origem_tipo, origem_id,
                 metodo, local, custo, custo_realizado, tempo_execucao,
                 dt_reagendamento, justificativa_reagendamento,
                 aval_implementacao, motivo_cancelamento,
                 beg_processo_id, sth_cad_empresa_id, sth_cad_filial_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (payload.get("titulo"), payload.get("descricao"), payload.get("responsavel_id"),
              payload.get("dt_prazo"), payload.get("status", "PENDENTE"),
              payload.get("origem_tipo"), payload.get("origem_id"),
              payload.get("metodo"), payload.get("local"), payload.get("custo"),
              payload.get("custo_realizado"), payload.get("tempo_execucao"),
              payload.get("dt_reagendamento"), payload.get("justificativa_reagendamento"),
              payload.get("aval_implementacao"), payload.get("motivo_cancelamento"),
              payload.get("beg_processo_id"),
              payload.get("sth_cad_empresa_id"), payload.get("sth_cad_filial_id"), usuario_id))
        row = cur.fetchone()
        _registrar_historico(conn, cur, row['id'], usuario_id, 'CRIACAO',
                             f"Plano criado: {str(payload.get('titulo', ''))[:120]}")
        conn.commit()
        try:
            resp_id = payload.get("responsavel_id")
            if resp_id and resp_id != usuario_id:
                notify_plano_atribuido(row['id'], payload.get('titulo', ''), resp_id, usuario_id)
        except Exception:
            pass
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('GACO', 'M'))])
async def atualizar_plano(id: int, data: PlanoUpdate, source: Optional[str] = None, usuario_id: int = Depends(require_user)):
    source = _normalize_source(source)
    payload = data.model_dump(exclude_unset=True)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Snapshot current values for history comparison
        cur.execute("SELECT dt_reagendamento, status FROM public.hgr_gac_reg_tar WHERE id = %s", (id,))
        prev = cur.fetchone()
        if source == 'RQ80':
            status_map = {
                'CONCLUIDO': 'S',
                'IMPLEMENTADO': 'S',
                'PENDENTE': 'N',
                'EM_ANDAMENTO': 'N',
                'CANCELADO': 'C',
                'ABERTO': 'A',
            }
            cur.execute("""
                UPDATE public.beg_rq80 SET
                    acao=COALESCE(%s,acao),
                    motivo=COALESCE(%s,motivo),
                    metodo=COALESCE(%s,metodo),
                    local=COALESCE(%s,local),
                    custo=COALESCE(%s,custo),
                    custo_realizado=COALESCE(%s,custo_realizado),
                    tempo_execucao=COALESCE(%s,tempo_execucao),
                    aval_implementacao=COALESCE(%s,aval_implementacao),
                    previsao=COALESCE(%s,previsao),
                    nprevisao=COALESCE(%s,nprevisao),
                    mot_nimpl=COALESCE(%s,mot_nimpl),
                    beg_usuario_id=COALESCE(%s,beg_usuario_id),
                    ind_implementacao=COALESCE(%s,ind_implementacao),
                    sth_cad_empresa_id=COALESCE(%s,sth_cad_empresa_id),
                    sth_cad_filial_id=COALESCE(%s,sth_cad_filial_id),
                    sth_cad_processo_id=COALESCE(%s,sth_cad_processo_id)
                WHERE id=%s
                RETURNING id, acao as titulo, motivo as descricao, metodo, local, custo, custo_realizado,
                          aval_implementacao, mot_nimpl as motivo_cancelamento,
                          tempo_execucao, previsao::date as dt_prazo, nprevisao as dt_reagendamento,
                          mot_nimpl as justificativa_reagendamento,
                          beg_usuario_id as responsavel_id,
                          CASE ind_implementacao
                              WHEN 'S' THEN 'IMPLEMENTADO'
                              WHEN 'C' THEN 'CANCELADO'
                              ELSE 'PENDENTE'
                          END as status,
                          'RQ80' as _source,
                          sth_cad_empresa_id, sth_cad_filial_id, sth_cad_processo_id as beg_processo_id
            """, (
                payload.get("titulo"),
                payload.get("descricao"),
                payload.get("metodo"),
                payload.get("local"),
                payload.get("custo"),
                payload.get("custo_realizado"),
                payload.get("tempo_execucao"),
                payload.get("aval_implementacao"),
                payload.get("dt_prazo"),
                payload.get("dt_reagendamento"),
                payload.get("motivo_cancelamento") or payload.get("justificativa_reagendamento"),
                payload.get("responsavel_id"),
                status_map.get(str(payload.get("status") or "").upper(), payload.get("status")),
                payload.get("sth_cad_empresa_id"),
                payload.get("sth_cad_filial_id"),
                payload.get("beg_processo_id"),
                id,
            ))
        else:
            # Set dt_implementacao when closing the plan
            novo_status = payload.get("status", "")
            set_impl_date = novo_status in ('CONCLUIDO', 'IMPLEMENTADO') and (not prev or prev.get('status') not in ('CONCLUIDO', 'IMPLEMENTADO'))
            cur.execute("""
                UPDATE public.hgr_gac_reg_tar SET
                    titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
                    status=COALESCE(%s,status), responsavel_id=COALESCE(%s,responsavel_id),
                    dt_prazo=COALESCE(%s,dt_prazo),
                    metodo=COALESCE(%s,metodo),
                    local=COALESCE(%s,local),
                    custo=COALESCE(%s,custo),
                    custo_realizado=COALESCE(%s,custo_realizado),
                    tempo_execucao=COALESCE(%s,tempo_execucao),
                    aval_implementacao=COALESCE(%s,aval_implementacao),
                    criterio_aceitacao=COALESCE(%s,criterio_aceitacao),
                    percentual=COALESCE(%s,percentual),
                    dt_reagendamento=COALESCE(%s,dt_reagendamento),
                    justificativa_reagendamento=COALESCE(%s,justificativa_reagendamento),
                    motivo_cancelamento=COALESCE(%s,motivo_cancelamento),
                    dt_implementacao=CASE WHEN %s THEN CURRENT_DATE ELSE dt_implementacao END,
                    beg_processo_id=COALESCE(%s,beg_processo_id),
                    sth_cad_empresa_id=COALESCE(%s,sth_cad_empresa_id),
                    sth_cad_filial_id=COALESCE(%s,sth_cad_filial_id),
                    updated_at=NOW()
                WHERE id=%s RETURNING *
            """, (
                payload.get("titulo"), payload.get("descricao"), payload.get("status"),
                payload.get("responsavel_id"), payload.get("dt_prazo"),
                payload.get("metodo"), payload.get("local"), payload.get("custo"),
                payload.get("custo_realizado"), payload.get("tempo_execucao"),
                payload.get("aval_implementacao"), payload.get("criterio_aceitacao"),
                payload.get("percentual"),
                payload.get("dt_reagendamento"),
                payload.get("justificativa_reagendamento"), payload.get("motivo_cancelamento"),
                set_impl_date,
                payload.get("beg_processo_id"), payload.get("sth_cad_empresa_id"),
                payload.get("sth_cad_filial_id"), id,
            ))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Plano não encontrado")
        # Auto-register reagendamento change in history (#19)
        if prev and payload.get("dt_reagendamento") and source != 'RQ80':
            prev_date = str(prev.get("dt_reagendamento") or "")
            new_date = str(payload["dt_reagendamento"])
            if prev_date != new_date:
                detalhe = f"Reagendado de {prev_date or 'sem data'} para {new_date}"
                _registrar_historico(conn, cur, id, usuario_id, 'REAGENDAMENTO', detalhe)
        campos = ', '.join(k for k in payload if k not in ('sth_cad_empresa_id', 'sth_cad_filial_id', 'beg_processo_id'))
        _registrar_historico(conn, cur, id, usuario_id, 'ATUALIZACAO',
                             f"Campos alterados: {campos[:200]}" if campos else "Atualização")
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


@router.delete("/{id}", status_code=204, dependencies=[Depends(require_permission('GACO', 'M'))])
async def excluir_plano(id: int, source: Optional[str] = None, force: bool = False, usuario_id: int = Depends(require_user)):
    source = _normalize_source(source)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if source != 'RQ80' and not force:
            cur.execute("""
                SELECT
                    (SELECT COUNT(*) FROM public.hgr_gac_reg_tar_link WHERE hgr_gac_cad_acao_id = %s) AS n_tarefas,
                    (SELECT COUNT(*) FROM public.beg_rq80_evid WHERE beg_rq80_id = %s) AS n_evidencias
            """, (id, id))
            deps = cur.fetchone()
            if deps and (deps['n_tarefas'] > 0 or deps['n_evidencias'] > 0):
                raise HTTPException(
                    409,
                    f"Este plano possui {deps['n_tarefas']} tarefa(s) e {deps['n_evidencias']} evidência(s). "
                    "Use ?force=true para excluir em cascata."
                )
        if source == 'RQ80':
            cur.execute("DELETE FROM public.beg_rq80_reg_usu WHERE beg_rq80_id = %s", (id,))
            cur.execute("DELETE FROM public.beg_rq80_evid WHERE beg_rq80_id = %s", (id,))
            cur.execute("DELETE FROM public.beg_rq80 WHERE id = %s", (id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Plano não encontrado")
        else:
            # Soft delete (#20) — mover para lixeira
            cur.execute("""
                UPDATE public.hgr_gac_reg_tar SET deleted_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
            """, (id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Plano não encontrado ou já na lixeira")
            _registrar_historico(conn, cur, id, usuario_id, 'EXCLUSAO', 'Movido para lixeira')
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{id}/historico", dependencies=[Depends(require_permission('GACO'))])
async def listar_historico_plano(
    id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COUNT(*) AS total FROM public.hgr_gac_historico WHERE plano_id = %s", (id,))
        total = cur.fetchone()["total"]
        offset = (page - 1) * per_page
        cur.execute("""
            SELECT h.id, h.acao, h.detalhes, h.created_at,
                   u.name AS usuario_nome
            FROM public.hgr_gac_historico h
            LEFT JOIN public.users u ON u.id = h.usuario_id
            WHERE h.plano_id = %s
            ORDER BY h.created_at DESC
            LIMIT %s OFFSET %s
        """, (id, per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/{id}/duplicar", status_code=201, dependencies=[Depends(require_permission('GACO', 'M'))])
async def duplicar_plano(id: int, usuario_id: int = Depends(require_user)):
    """Cria uma cópia do plano com status PENDENTE, sem tarefas/equipe/evidências (#11)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_gac_reg_tar WHERE id = %s", (id,))
        orig = cur.fetchone()
        if not orig:
            raise HTTPException(404, "Plano original não encontrado")
        cur.execute("""
            INSERT INTO public.hgr_gac_reg_tar
                (titulo, descricao, responsavel_id, dt_prazo, status, origem_tipo, origem_id,
                 metodo, local, custo, tempo_execucao, criterio_aceitacao,
                 beg_processo_id, sth_cad_empresa_id, sth_cad_filial_id, created_by)
            VALUES (%s,%s,%s,%s,'PENDENTE',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            f"[CÓPIA] {orig['titulo']}", orig['descricao'], orig['responsavel_id'],
            orig['dt_prazo'], orig['origem_tipo'], orig['origem_id'],
            orig['metodo'], orig['local'], orig['custo'], orig['tempo_execucao'],
            orig['criterio_aceitacao'], orig['beg_processo_id'],
            orig['sth_cad_empresa_id'], orig['sth_cad_filial_id'], usuario_id,
        ))
        novo = cur.fetchone()
        _registrar_historico(conn, cur, novo['id'], usuario_id, 'CRIACAO',
                             f"Duplicado do plano #{id}")
        conn.commit()
        return novo
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/exportar", dependencies=[Depends(require_permission('GACO'))])
async def exportar_planos_csv(
    status: Optional[str] = None,
    filial_id: Optional[int] = None,
    search: Optional[str] = None,
    responsavel_id: Optional[int] = None,
    por: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """Exporta planos filtrados como CSV (#10)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        row_status_sql = """
            CASE
                WHEN planos.status = 'CANCELADO' THEN 'CANCELADO'
                WHEN planos.status IN ('CONCLUIDO', 'IMPLEMENTADO') THEN 'IMPLEMENTADO'
                WHEN planos.dt_prazo IS NOT NULL AND planos.dt_prazo < CURRENT_DATE
                     AND planos.status NOT IN ('CONCLUIDO','IMPLEMENTADO','CANCELADO') THEN 'VENCIDA'
                ELSE 'PENDENTE'
            END
        """
        query = f"""
            SELECT planos.titulo, planos.responsavel_nome, planos.criador_nome,
                   planos.dt_prazo, planos.created_at, planos.filial_nome,
                   planos.origem_tipo, planos._source,
                   {row_status_sql} AS status_calculado
            FROM (
                SELECT g.id, g.titulo, g.dt_prazo, g.status, g.origem_tipo,
                       g.created_at, g.created_by, g.responsavel_id,
                       'GAC' AS _source, u.name AS responsavel_nome, uc.name AS criador_nome,
                       g.sth_cad_filial_id, g.beg_processo_id, g.sth_cad_empresa_id,
                       f.descricao AS filial_nome,
                       NULL::BIGINT AS origem_id
                FROM public.hgr_gac_reg_tar g
                LEFT JOIN public.users u ON u.id = g.responsavel_id
                LEFT JOIN public.users uc ON uc.id = g.created_by
                LEFT JOIN public.sth_cad_filial f ON f.id = g.sth_cad_filial_id
                UNION ALL
                SELECT r.id, r.acao, r.previsao::date, 'PENDENTE', NULL,
                       COALESCE(r.created, r.dt_inclusao), r.createdby, r.beg_usuario_id,
                       'RQ80', u.name, uc.name,
                       r.sth_cad_filial_id, r.sth_cad_processo_id, r.sth_cad_empresa_id,
                       f.descricao, r.beg_rq49_id
                FROM public.beg_rq80 r
                LEFT JOIN public.users u ON u.id = r.beg_usuario_id
                LEFT JOIN public.users uc ON uc.id = r.createdby
                LEFT JOIN public.sth_cad_filial f ON f.id = r.sth_cad_filial_id
            ) planos WHERE 1=1
        """
        params = []
        if status:
            query += f" AND {row_status_sql} = %s"
            params.append(status)
        if filial_id:
            query += " AND planos.sth_cad_filial_id = %s"
            params.append(filial_id)
        if responsavel_id:
            query += " AND planos.responsavel_id = %s"
            params.append(responsavel_id)
        if search:
            query += " AND COALESCE(planos.titulo,'') ILIKE %s"
            params.append(f"%{search}%")
        if por in ('M', 'SO'):
            query += " AND (planos.responsavel_id = %s OR planos.created_by = %s)"
            params.extend([usuario_id, usuario_id])
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, "planos")
        query += scope_sql
        params.extend(scope_params)
        query += " ORDER BY planos.dt_prazo ASC NULLS LAST LIMIT 5000"
        cur.execute(query, params)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Ação", "Responsável", "Criado por", "Prazo", "Criado em", "Unidade", "Origem", "Fonte", "Status"])
    for r in rows:
        writer.writerow([
            r.get("titulo", ""), r.get("responsavel_nome", ""), r.get("criador_nome", ""),
            r.get("dt_prazo", ""), str(r.get("created_at", ""))[:10],
            r.get("filial_nome", ""), r.get("origem_tipo", ""),
            r.get("_source", ""), r.get("status_calculado", ""),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=planos_acao.csv"},
    )


# ── Lixeira (soft-delete recovery) ─────────────────────────────────────────

@router.get("/lixeira", dependencies=[Depends(require_permission('GACO'))])
async def listar_lixeira(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=50),
    usuario_id: int = Depends(require_user),
):
    """Planos movidos para lixeira (#20)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, "g")
        base = """
            FROM public.hgr_gac_reg_tar g
            LEFT JOIN public.users u ON u.id = g.responsavel_id
            LEFT JOIN public.sth_cad_filial f ON f.id = g.sth_cad_filial_id
            WHERE g.deleted_at IS NOT NULL
        """
        base += scope_sql
        cur.execute(f"SELECT COUNT(*) AS total {base}", scope_params)
        total = cur.fetchone()["total"]
        offset = (page - 1) * per_page
        cur.execute(
            f"SELECT g.id, g.titulo, g.status, g.dt_prazo, g.deleted_at, u.name AS responsavel_nome, f.descricao AS filial_nome {base} ORDER BY g.deleted_at DESC LIMIT %s OFFSET %s",
            scope_params + [per_page, offset],
        )
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/{id}/restaurar", status_code=200, dependencies=[Depends(require_permission('GACO', 'M'))])
async def restaurar_plano(id: int, usuario_id: int = Depends(require_user)):
    """Restaura um plano da lixeira (#20)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_gac_reg_tar SET deleted_at = NULL
            WHERE id = %s AND deleted_at IS NOT NULL
            RETURNING id, titulo
        """, (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Plano não encontrado na lixeira")
        _registrar_historico(conn, cur, id, usuario_id, 'RESTAURACAO', 'Plano restaurado da lixeira')
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


# ── Contagem de pendentes/vencidos (sidebar badge) ──────────────────────────

@router.get("/pendentes-count", dependencies=[Depends(require_permission('GACO'))])
async def pendentes_count(usuario_id: int = Depends(require_user)):
    """Retorna contagem de planos vencidos e próximos ao prazo (#17)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, "g")
        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE g.dt_prazo < CURRENT_DATE
                    AND g.status NOT IN ('CONCLUIDO','IMPLEMENTADO','CANCELADO')
                    AND g.deleted_at IS NULL) AS vencidas,
                COUNT(*) FILTER (WHERE g.dt_prazo BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
                    AND g.status NOT IN ('CONCLUIDO','IMPLEMENTADO','CANCELADO')
                    AND g.deleted_at IS NULL) AS proximas
            FROM public.hgr_gac_reg_tar g
            WHERE 1=1 {scope_sql}
        """, scope_params)
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


# ── Reordenar tarefas do plano ───────────────────────────────────────────────

@router.post("/{id}/tarefas/reordenar", dependencies=[Depends(require_permission('GACO', 'M'))])
async def reordenar_tarefas(id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Atualiza ordem das tarefas vinculadas (#11). Body: {ordem: [link_id, ...]}"""
    ids = data.get("ordem", [])
    if not ids or not isinstance(ids, list):
        raise HTTPException(400, "Campo 'ordem' deve ser lista de link_ids")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for pos, link_id in enumerate(ids):
            cur.execute(
                "UPDATE public.hgr_gac_reg_tar_link SET ordem = %s WHERE id = %s AND hgr_gac_cad_acao_id = %s",
                (pos, link_id, id),
            )
        conn.commit()
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Reagendar (Alterar Prazo com Justificativa) ───────────────────────────────
@router.patch("/{id}/reagendar", dependencies=[Depends(require_permission('GACO', 'M'))])
async def reagendar_plano(id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Altera dt_prazo com justificativa obrigatória (APEX: alterar prazo)."""
    nova_data = data.get("dt_prazo")
    justificativa = (data.get("justificativa") or "").strip()
    if not nova_data:
        raise HTTPException(400, "dt_prazo obrigatório")
    if not justificativa:
        raise HTTPException(400, "justificativa obrigatória")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_gac_reg_tar SET
                dt_prazo=%s, dt_reagendamento=%s,
                justificativa_reagendamento=%s, updated_at=NOW()
            WHERE id=%s RETURNING id, titulo, dt_prazo
        """, (nova_data, nova_data, justificativa, id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Plano não encontrado")
        _registrar_historico(conn, cur, id, usuario_id, "REAGENDAMENTO",
                             f"Prazo alterado para {nova_data}. Justificativa: {justificativa}")
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


# ── Encerrar com Avaliação de Eficácia ───────────────────────────────────────
@router.patch("/{id}/encerrar-eficacia", dependencies=[Depends(require_permission('GACO', 'M'))])
async def encerrar_com_eficacia(id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Encerra o plano com avaliação de eficácia (APEX: avaliação final)."""
    aval = (data.get("aval_implementacao") or "").strip()
    eficaz = data.get("eficaz", True)  # True=Eficaz, False=Não Eficaz
    if not aval:
        raise HTTPException(400, "aval_implementacao obrigatório")
    novo_status = "CONCLUIDO" if eficaz else "AVALIACAO"
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_gac_reg_tar SET
                status=%s, aval_implementacao=%s, dt_implementacao=CURRENT_DATE, updated_at=NOW()
            WHERE id=%s RETURNING id, titulo, status
        """, (novo_status, aval, id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Plano não encontrado")
        _registrar_historico(conn, cur, id, usuario_id, "ENCERRAMENTO",
                             f"Eficaz: {'Sim' if eficaz else 'Não'}. {aval}")
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


# ── Relatório: Planos Vencidos ────────────────────────────────────────────────
@router.get("/relatorio-vencidos", dependencies=[Depends(require_permission('GACO'))])
async def relatorio_vencidos(
    dias_vencimento: int = Query(0, ge=0),
    origem_tipo: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """Lista planos vencidos ou próximos do vencimento, agrupados por responsável."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'p', filial_col='p.sth_cad_filial_id')
        query = f"""
            SELECT p.id, p.titulo, p.status, p.dt_prazo, p.origem_tipo, p.origem_id,
                   u.name as responsavel_nome,
                   CURRENT_DATE - p.dt_prazo as dias_atraso
            FROM public.hgr_gac_reg_tar p
            LEFT JOIN public.users u ON u.id = p.responsavel_id
            WHERE p.status NOT IN ('CONCLUIDO','IMPLEMENTADO','CANCELADO')
              AND p.dt_prazo IS NOT NULL
              AND p.dt_prazo <= CURRENT_DATE + INTERVAL '{dias_vencimento} days'
              AND p.deleted_at IS NULL
              {scope_sql}
        """
        params = scope_params[:]
        if origem_tipo:
            query += " AND p.origem_tipo = %s"
            params.append(origem_tipo)
        query += " ORDER BY p.dt_prazo ASC, u.name"
        cur.execute(query, params)
        rows = cur.fetchall()

        # Agrupar por responsável
        by_resp = {}
        for r in rows:
            k = r.get("responsavel_nome") or "Sem responsável"
            by_resp.setdefault(k, []).append(r)

        return {"total": len(rows), "por_responsavel": by_resp, "itens": rows}
    finally:
        cur.close()
        conn.close()
