# -*- coding: utf-8 -*-
"""CRUD de Tarefas (hgr_tar_cad_tarefa) + Kanban + Apontamentos."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection, ensure_table_columns
from backend.auth.utils import require_user
from backend.auth.permissions import get_user_scope, build_scope_filter, get_user_tipo, require_permission
from backend.core.config import logger
from backend.routes.tarefas.schemas import (
    TarefaApontamentoCreate,
    TarefaCreate,
    TarefaKanbanMove,
    TarefaUpdate,
)
from backend.services.sigs_notifications import notify_tarefa_atribuida, notify_tarefa_entregue

router = APIRouter()


def create_tarefas_tables():
    """Cria tabelas de tarefas se não existirem."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_tar_cad_etp (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                ordem INTEGER,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_tar_cad_etp_kbn (
                id BIGSERIAL PRIMARY KEY,
                hgr_tar_cad_etp_id BIGINT REFERENCES public.hgr_tar_cad_etp(id),
                titulo VARCHAR(200),
                descricao VARCHAR(500),
                cor VARCHAR(20),
                ordem INTEGER,
                status VARCHAR(20),
                ativo VARCHAR(1) DEFAULT 'S'
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_tar_cad_tarefa (
                id BIGSERIAL PRIMARY KEY,
                titulo VARCHAR(500) NOT NULL,
                descricao TEXT,
                codigo VARCHAR(50),
                dt_inicio DATE,
                dt_termino DATE,
                dt_previsao DATE,
                dt_entrega DATE,
                prioridade VARCHAR(20),
                status VARCHAR(20) DEFAULT 'ABERTA',
                feedback TEXT,
                percentual NUMERIC(5,2) DEFAULT 0,
                fixa VARCHAR(1) DEFAULT 'N',
                hgr_tar_cad_etp_id BIGINT REFERENCES public.hgr_tar_cad_etp(id),
                hgr_tar_cad_etp_kbn_id BIGINT REFERENCES public.hgr_tar_cad_etp_kbn(id),
                responsavel_id BIGINT,
                beg_processo_id BIGINT,
                sth_cad_empresa_id BIGINT,
                sth_cad_filial_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                updated_by INTEGER
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_tar_reg_apontamento (
                id BIGSERIAL PRIMARY KEY,
                hgr_tar_cad_tarefa_id BIGINT NOT NULL REFERENCES public.hgr_tar_cad_tarefa(id),
                usuario_id BIGINT,
                dt_apontamento DATE,
                tempo_minutos INTEGER,
                descricao TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_tar_reg_eqp_apoio (
                id BIGSERIAL PRIMARY KEY,
                hgr_tar_cad_tarefa_id BIGINT NOT NULL REFERENCES public.hgr_tar_cad_tarefa(id),
                usuario_id BIGINT NOT NULL
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_tar_tarefa_anx (
                id BIGSERIAL PRIMARY KEY,
                hgr_tar_cad_tarefa_id BIGINT NOT NULL REFERENCES public.hgr_tar_cad_tarefa(id),
                arquivo BYTEA,
                filename VARCHAR(500),
                mimetype VARCHAR(200),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER
            );
        """)
        # Seed default etapas + kanban columns if empty
        cur.execute("SELECT COUNT(*) FROM public.hgr_tar_cad_etp")
        if cur.fetchone()[0] == 0:
            for i, (desc, etps) in enumerate([
                ('Geral', [('A Fazer', '#6b7280'), ('Em Andamento', '#3b82f6'), ('Em Revisão', '#f59e0b'), ('Concluído', '#22c55e')]),
            ], 1):
                cur.execute("INSERT INTO public.hgr_tar_cad_etp (descricao, ordem, ativo) VALUES (%s, %s, 'S') RETURNING id", (desc, i))
                etp_id = cur.fetchone()[0]
                for j, (titulo, cor) in enumerate(etps, 1):
                    cur.execute("INSERT INTO public.hgr_tar_cad_etp_kbn (hgr_tar_cad_etp_id, titulo, cor, ordem, status, ativo) VALUES (%s, %s, %s, %s, %s, 'S')",
                        (etp_id, titulo, cor, j, titulo.upper().replace(' ', '_')))

        # Colunas de aprovação (adicionadas inline para manter compatibilidade)
        for col_sql in [
            "ALTER TABLE public.hgr_tar_cad_tarefa ADD COLUMN IF NOT EXISTS aprovador_id BIGINT",
            "ALTER TABLE public.hgr_tar_cad_tarefa ADD COLUMN IF NOT EXISTS status_aprovacao VARCHAR(20)",
            "ALTER TABLE public.hgr_tar_cad_tarefa ADD COLUMN IF NOT EXISTS tarefa_pai_id BIGINT",
        ]:
            cur.execute(col_sql)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tarefa_pai ON public.hgr_tar_cad_tarefa(tarefa_pai_id);")
        cur.execute("ALTER TABLE public.hgr_tar_cad_tarefa ADD COLUMN IF NOT EXISTS tempo_estimado INTEGER")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_tar_reg_dep (
            id BIGSERIAL PRIMARY KEY,
            tarefa_id BIGINT NOT NULL,
            predecessora_id BIGINT NOT NULL,
            tipo VARCHAR(20) DEFAULT 'INICIAR_APOS',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER,
            UNIQUE(tarefa_id, predecessora_id)
        )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dep_tarefa ON public.hgr_tar_reg_dep(tarefa_id);")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_tar_apo_avulso (
            id BIGSERIAL PRIMARY KEY,
            titulo VARCHAR(300) NOT NULL,
            descricao TEXT,
            usuario_id BIGINT,
            dt_apontamento DATE NOT NULL DEFAULT CURRENT_DATE,
            tempo_minutos INTEGER NOT NULL,
            hgr_prj_cad_projeto_id BIGINT,
            categoria VARCHAR(50),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER
        )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_apo_avulso_usuario ON public.hgr_tar_apo_avulso(usuario_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_apo_avulso_dt ON public.hgr_tar_apo_avulso(dt_apontamento);")

        # Índices
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tarefa_responsavel ON public.hgr_tar_cad_tarefa(responsavel_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tarefa_status ON public.hgr_tar_cad_tarefa(status);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tarefa_aprovador ON public.hgr_tar_cad_tarefa(aprovador_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_apontamento_tarefa ON public.hgr_tar_reg_apontamento(hgr_tar_cad_tarefa_id);")
        conn.commit()
        logger.info("Tabelas de tarefas verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao criar tabelas de tarefas: {e}")
    finally:
        cur.close()
        conn.close()


# ============================================================
# CRUD Tarefas
# ============================================================
@router.get("/pendentes-count", dependencies=[Depends(require_permission('GES'))])
async def tarefas_pendentes_count(usuario_id: int = Depends(require_user)):
    """Contagem de tarefas vencidas e próximas ao prazo para badge no sidebar."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 't',
            filial_col='COALESCE(t.sth_cad_filial_id, t.hgr_cad_filial_id)')
        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) < CURRENT_DATE
                    AND COALESCE(t.status, t.hgr_tar_status) NOT IN ('CONCLUIDA','CANCELADA','C','X')) AS vencidas,
                COUNT(*) FILTER (WHERE COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date)
                    BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
                    AND COALESCE(t.status, t.hgr_tar_status) NOT IN ('CONCLUIDA','CANCELADA','C','X')) AS proximas
            FROM public.hgr_tar_cad_tarefa t
            WHERE 1=1 {scope_sql}
        """, scope_params)
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


@router.get("/exportar", dependencies=[Depends(require_permission('GES'))])
async def exportar_tarefas_csv(
    status: Optional[str] = None,
    prioridade: Optional[str] = None,
    responsavel_id: Optional[int] = None,
    minhas: bool = False,
    dt_previsao_inicio: Optional[str] = None,
    dt_previsao_fim: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """Exporta tarefas filtradas como CSV."""
    import csv, io
    from fastapi.responses import StreamingResponse
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT t.titulo,
                   CASE COALESCE(t.status, t.hgr_tar_status)
                       WHEN 'A' THEN 'ABERTA' WHEN 'C' THEN 'CONCLUIDA'
                       WHEN 'E' THEN 'EM_ESPERA' WHEN 'X' THEN 'CANCELADA'
                       ELSE COALESCE(t.status, t.hgr_tar_status, 'ABERTA')
                   END as status_calc,
                   t.prioridade,
                   COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as dt_previsao,
                   COALESCE(t.dt_entrega, t.dt_hr_entrega::date) as dt_entrega,
                   COALESCE(t.created_at, t.created) as created_at,
                   u.name as responsavel_nome
            FROM public.hgr_tar_cad_tarefa t
            LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND COALESCE(t.status, t.hgr_tar_status) = %s"
            params.append(status)
        if prioridade:
            query += " AND t.prioridade = %s"
            params.append(prioridade)
        if responsavel_id:
            query += " AND COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s"
            params.append(responsavel_id)
        if minhas:
            query += " AND (COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s OR t.created_by = %s OR t.createdby = %s)"
            params.extend([usuario_id, usuario_id, usuario_id])
        if dt_previsao_inicio:
            query += " AND COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) >= %s"
            params.append(dt_previsao_inicio)
        if dt_previsao_fim:
            query += " AND COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) <= %s"
            params.append(dt_previsao_fim)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 't',
            filial_col='COALESCE(t.sth_cad_filial_id, t.hgr_cad_filial_id)')
        query += scope_sql
        params.extend(scope_params)
        query += " ORDER BY COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) ASC NULLS LAST LIMIT 5000"
        cur.execute(query, params)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Título", "Status", "Prioridade", "Prazo", "Entrega", "Criado em", "Responsável"])
    for r in rows:
        writer.writerow([
            r.get("titulo", ""), r.get("status_calc", ""), r.get("prioridade", ""),
            str(r.get("dt_previsao") or ""), str(r.get("dt_entrega") or ""),
            str(r.get("created_at") or "")[:10], r.get("responsavel_nome", ""),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tarefas.csv"},
    )


@router.get("/", dependencies=[Depends(require_permission('GES'))])
async def listar_tarefas(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    cursor: Optional[int] = None,  # cursor-based pagination: last seen id (task 192)
    status: Optional[str] = None,
    prioridade: Optional[str] = None,
    responsavel_id: Optional[int] = None,
    minhas: bool = False,
    aguardando_aprovacao: bool = False,
    dt_previsao_inicio: Optional[str] = None,
    dt_previsao_fim: Optional[str] = None,
    dt_criado_inicio: Optional[str] = None,
    dt_criado_fim: Optional[str] = None,
    sort_by: str = Query("created_at", regex="^(created_at|dt_previsao|titulo|status|prioridade)$"),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT t.*,
                   COALESCE(t.responsavel_id, t.hgr_usuario_id) as _responsavel_id,
                   CASE COALESCE(t.status, t.hgr_tar_status)
                       WHEN 'A' THEN 'ABERTA' WHEN 'C' THEN 'CONCLUIDA'
                       WHEN 'E' THEN 'EM_ESPERA' WHEN 'X' THEN 'CANCELADA'
                       ELSE COALESCE(t.status, t.hgr_tar_status, 'ABERTA')
                   END as _status,
                   COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as _dt_previsao,
                   COALESCE(t.dt_entrega, t.dt_hr_entrega::date) as _dt_entrega,
                   COALESCE(t.sth_cad_empresa_id, t.hgr_cad_empresa_id) as _empresa_id,
                   COALESCE(t.sth_cad_filial_id, t.hgr_cad_filial_id) as _filial_id,
                   COALESCE(t.beg_processo_id, t.hgr_cad_processo_id) as _processo_id,
                   u.name as responsavel_nome,
                   e.descricao as etapa_descricao,
                   k.titulo as kanban_titulo, k.cor as kanban_cor,
                   COALESCE((SELECT SUM(a.tempo_minutos) FROM public.hgr_tar_reg_apontamento a
                              WHERE a.hgr_tar_cad_tarefa_id = t.id), 0) as tempo_gasto
            FROM public.hgr_tar_cad_tarefa t
            LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
            LEFT JOIN public.hgr_tar_cad_etp e ON e.id = t.hgr_tar_cad_etp_id
            LEFT JOIN public.hgr_tar_cad_etp_kbn k ON k.id = t.hgr_tar_cad_etp_kbn_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND COALESCE(t.status, t.hgr_tar_status) = %s"
            params.append(status)
        if prioridade:
            query += " AND t.prioridade = %s"
            params.append(prioridade)
        if responsavel_id:
            query += " AND COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s"
            params.append(responsavel_id)
        if minhas:
            query += " AND (COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s OR t.created_by = %s OR t.createdby = %s)"
            params.extend([usuario_id, usuario_id, usuario_id])
        if aguardando_aprovacao:
            query += " AND t.aprovador_id = %s AND t.status_aprovacao = 'PENDENTE'"
            params.append(usuario_id)
        if dt_previsao_inicio:
            query += " AND COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) >= %s"
            params.append(dt_previsao_inicio)
        if dt_previsao_fim:
            query += " AND COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) <= %s"
            params.append(dt_previsao_fim)
        if dt_criado_inicio:
            query += " AND COALESCE(t.created_at, t.created)::date >= %s"
            params.append(dt_criado_inicio)
        if dt_criado_fim:
            query += " AND COALESCE(t.created_at, t.created)::date <= %s"
            params.append(dt_criado_fim)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 't',
            filial_col='COALESCE(t.sth_cad_filial_id, t.hgr_cad_filial_id)')
        query += scope_sql
        params.extend(scope_params)

        # Cursor-based pagination (task 192): quando cursor fornecido, usa id < cursor ao invés de OFFSET
        use_cursor = cursor is not None and sort_by == 'created_at'
        if use_cursor:
            # Cursor = último id visto; pega próxima página sem COUNT (melhor performance em >10k)
            _dir_op = '<' if sort_dir == 'desc' else '>'
            query += f" AND t.id {_dir_op} %s"
            params.append(cursor)
            total = -1  # sinaliza cursor mode ao cliente
        else:
            cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
            total = cur.fetchone()["total"]

        _sort_col = {
            'created_at': 'COALESCE(t.created_at, t.created)',
            'dt_previsao': 'COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date)',
            'titulo': 't.titulo',
            'status': '_status',
            'prioridade': "CASE t.prioridade WHEN 'URGENTE' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'BAIXA' THEN 4 ELSE 5 END",
        }.get(sort_by, 'COALESCE(t.created_at, t.created)')
        _sort_dir = 'DESC' if sort_dir == 'desc' else 'ASC'
        if use_cursor:
            query += f" ORDER BY t.id {_sort_dir} LIMIT %s"
            params.append(per_page)
        else:
            query += f" ORDER BY {_sort_col} {_sort_dir} NULLS LAST LIMIT %s OFFSET %s"
            params.extend([per_page, offset])
        cur.execute(query, params)
        items = cur.fetchall()
        next_cursor = items[-1]["id"] if (use_cursor and len(items) == per_page) else None
        return {"items": items, "total": total, "page": page, "per_page": per_page,
                **({"next_cursor": next_cursor} if use_cursor else {})}
    finally:
        cur.close()
        conn.close()


@router.post("/batch", dependencies=[Depends(require_permission('GES'))])
async def batch_tarefas(payload: dict, usuario_id: int = Depends(require_user)):
    """Ações em lote: concluir | reatribuir."""
    ids = payload.get("ids") or []
    action = payload.get("action", "")
    if not ids or len(ids) > 200:
        raise HTTPException(400, "ids inválidos")
    if action not in ("concluir", "reatribuir"):
        raise HTTPException(400, "action inválida")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        placeholders = ",".join(["%s"] * len(ids))
        if action == "concluir":
            cur.execute(
                f"UPDATE public.hgr_tar_cad_tarefa SET status='CONCLUIDA', dt_entrega=CURRENT_DATE, updated_at=NOW(), updated_by=%s WHERE id IN ({placeholders})",
                [usuario_id] + ids
            )
        elif action == "reatribuir":
            responsavel_id = payload.get("responsavel_id")
            if not responsavel_id:
                raise HTTPException(400, "responsavel_id obrigatório")
            cur.execute(
                f"UPDATE public.hgr_tar_cad_tarefa SET responsavel_id=%s, updated_at=NOW(), updated_by=%s WHERE id IN ({placeholders})",
                [responsavel_id, usuario_id] + ids
            )
        affected = cur.rowcount
        conn.commit()
        return {"affected": affected}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro batch tarefas: {e}")
        raise HTTPException(500, "Erro interno")
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('GES'))])
async def obter_tarefa(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.*,
                   COALESCE(t.responsavel_id, t.hgr_usuario_id) as _responsavel_id,
                   COALESCE(t.status, t.hgr_tar_status) as _status,
                   COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as _dt_previsao,
                   COALESCE(t.dt_entrega, t.dt_hr_entrega::date) as _dt_entrega,
                   u.name as responsavel_nome,
                   e.descricao as etapa_descricao,
                   k.titulo as kanban_titulo, k.cor as kanban_cor
            FROM public.hgr_tar_cad_tarefa t
            LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
            LEFT JOIN public.hgr_tar_cad_etp e ON e.id = t.hgr_tar_cad_etp_id
            LEFT JOIN public.hgr_tar_cad_etp_kbn k ON k.id = t.hgr_tar_cad_etp_kbn_id
            WHERE t.id = %s
        """, (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tarefa não encontrada")

        # Scope validation
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = row.get('sth_cad_filial_id') or row.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")

        # Apontamentos
        cur.execute("""
            SELECT a.*, u.name as usuario_nome
            FROM public.hgr_tar_reg_apontamento a
            LEFT JOIN public.users u ON u.id = a.usuario_id
            WHERE a.hgr_tar_cad_tarefa_id = %s
            ORDER BY a.dt_apontamento DESC
        """, (id,))
        row["apontamentos"] = cur.fetchall()

        # Equipe de apoio
        cur.execute("""
            SELECT ea.*, u.name as usuario_nome
            FROM public.hgr_tar_reg_eqp_apoio ea
            LEFT JOIN public.users u ON u.id = ea.usuario_id
            WHERE ea.hgr_tar_cad_tarefa_id = %s
        """, (id,))
        row["equipe_apoio"] = cur.fetchall()

        # Subtarefas (filhos)
        try:
            cur.execute("""
                SELECT t.id, t.titulo, COALESCE(t.status, t.hgr_tar_status, 'ABERTA') as status,
                       t.prioridade, t.dt_previsao, u.name as responsavel_nome
                FROM public.hgr_tar_cad_tarefa t
                LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
                WHERE t.tarefa_pai_id = %s
                ORDER BY t.created_at
            """, (id,))
            row["subtarefas"] = cur.fetchall()
        except Exception:
            conn.rollback()
            row["subtarefas"] = []

        # Dependências (predecessoras e sucessoras)
        try:
            cur.execute("""
                SELECT d.id as dep_id, d.predecessora_id, d.tipo,
                       t.titulo as predecessora_titulo,
                       COALESCE(t.status, t.hgr_tar_status, 'ABERTA') as predecessora_status
                FROM public.hgr_tar_reg_dep d
                LEFT JOIN public.hgr_tar_cad_tarefa t ON t.id = d.predecessora_id
                WHERE d.tarefa_id = %s
                ORDER BY d.created_at
            """, (id,))
            row["dependencias"] = cur.fetchall()
            # Sucessoras (esta tarefa é predecessora de quais)
            cur.execute("""
                SELECT d.id as dep_id, d.tarefa_id as sucessora_id, d.tipo,
                       t.titulo as sucessora_titulo
                FROM public.hgr_tar_reg_dep d
                LEFT JOIN public.hgr_tar_cad_tarefa t ON t.id = d.tarefa_id
                WHERE d.predecessora_id = %s
                ORDER BY d.created_at
            """, (id,))
            row["sucessoras"] = cur.fetchall()
        except Exception:
            conn.rollback()
            row["dependencias"] = []
            row["sucessoras"] = []

        return row
    finally:
        cur.close()
        conn.close()


@router.post("/{tarefa_id}/dependencias", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def adicionar_dependencia(tarefa_id: int, payload: dict, usuario_id: int = Depends(require_user)):
    """Adiciona uma predecessora à tarefa (tarefa_id não pode iniciar antes de predecessora_id concluir)."""
    predecessora_id = payload.get("predecessora_id")
    if not predecessora_id:
        raise HTTPException(400, "predecessora_id obrigatório")
    if int(predecessora_id) == tarefa_id:
        raise HTTPException(400, "Uma tarefa não pode depender de si mesma")
    tipo = (payload.get("tipo") or "INICIAR_APOS").upper()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_tar_reg_dep (tarefa_id, predecessora_id, tipo, created_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (tarefa_id, predecessora_id) DO NOTHING
            RETURNING *
        """, (tarefa_id, int(predecessora_id), tipo, usuario_id))
        conn.commit()
        return cur.fetchone() or {"tarefa_id": tarefa_id, "predecessora_id": predecessora_id, "tipo": tipo}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{tarefa_id}/dependencias/{dep_id}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def remover_dependencia(tarefa_id: int, dep_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM public.hgr_tar_reg_dep WHERE id=%s AND tarefa_id=%s",
            (dep_id, tarefa_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Dependência não encontrada")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{pai_id}/subtarefas", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_subtarefa(pai_id: int, payload: dict, usuario_id: int = Depends(require_user)):
    """Cria uma subtarefa (filho) vinculada à tarefa pai."""
    titulo = (payload.get("titulo") or "").strip()
    if not titulo:
        raise HTTPException(400, "Título obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id FROM public.hgr_tar_cad_tarefa WHERE id=%s", (pai_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Tarefa pai não encontrada")
        cur.execute("""
            INSERT INTO public.hgr_tar_cad_tarefa
                (titulo, descricao, status, prioridade, dt_previsao, responsavel_id,
                 tarefa_pai_id, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, titulo, status, prioridade, dt_previsao, tarefa_pai_id
        """, (
            titulo,
            payload.get("descricao"),
            payload.get("status", "ABERTA"),
            payload.get("prioridade", "MEDIA"),
            payload.get("dt_previsao"),
            payload.get("responsavel_id"),
            pai_id,
            usuario_id,
        ))
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


@router.post("/", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_tarefa(payload: TarefaCreate, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
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
            INSERT INTO public.hgr_tar_cad_tarefa
                (titulo, descricao, codigo, dt_inicio, dt_previsao, prioridade, status,
                 responsavel_id, hgr_tar_cad_etp_id, hgr_tar_cad_etp_kbn_id,
                 beg_processo_id, sth_cad_empresa_id, sth_cad_filial_id,
                 created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            data.get("titulo"), data.get("descricao"), data.get("codigo"),
            data.get("dt_inicio"), data.get("dt_previsao"),
            data.get("prioridade", "MEDIA"), data.get("status", "ABERTA"),
            data.get("responsavel_id"), data.get("hgr_tar_cad_etp_id"),
            data.get("hgr_tar_cad_etp_kbn_id"), data.get("beg_processo_id"),
            data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id"),
            usuario_id,
        ))
        conn.commit()
        row = cur.fetchone()
        try:
            resp_id = data.get("responsavel_id")
            if resp_id and resp_id != usuario_id:
                notify_tarefa_atribuida(row['id'], data.get('titulo', ''), resp_id, usuario_id)
        except Exception:
            pass
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('GES', 'M'))])
async def atualizar_tarefa(id: int, payload: TarefaUpdate, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_tar_cad_tarefa
            SET titulo = COALESCE(%s, titulo),
                descricao = COALESCE(%s, descricao),
                codigo = COALESCE(%s, codigo),
                dt_inicio = COALESCE(%s, dt_inicio),
                status = COALESCE(%s, status),
                prioridade = COALESCE(%s, prioridade),
                dt_previsao = COALESCE(%s, dt_previsao),
                dt_entrega = COALESCE(%s, dt_entrega),
                percentual = COALESCE(%s, percentual),
                responsavel_id = COALESCE(%s, responsavel_id),
                hgr_tar_cad_etp_id = COALESCE(%s, hgr_tar_cad_etp_id),
                hgr_tar_cad_etp_kbn_id = COALESCE(%s, hgr_tar_cad_etp_kbn_id),
                beg_processo_id = COALESCE(%s, beg_processo_id),
                sth_cad_empresa_id = COALESCE(%s, sth_cad_empresa_id),
                sth_cad_filial_id = COALESCE(%s, sth_cad_filial_id),
                feedback = COALESCE(%s, feedback),
                updated_at = NOW(),
                updated_by = %s
            WHERE id = %s RETURNING *
        """, (
            data.get("titulo"), data.get("descricao"),
            data.get("codigo"), data.get("dt_inicio"),
            data.get("status"), data.get("prioridade"),
            data.get("dt_previsao"), data.get("dt_entrega"),
            data.get("percentual"), data.get("responsavel_id"),
            data.get("hgr_tar_cad_etp_id"), data.get("hgr_tar_cad_etp_kbn_id"),
            data.get("beg_processo_id"), data.get("sth_cad_empresa_id"),
            data.get("sth_cad_filial_id"), data.get("feedback"),
            usuario_id, id,
        ))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tarefa não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{id}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_tarefa(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Remover dependências
        cur.execute("DELETE FROM public.hgr_tar_reg_apontamento WHERE hgr_tar_cad_tarefa_id = %s", (id,))
        cur.execute("DELETE FROM public.hgr_tar_reg_eqp_apoio WHERE hgr_tar_cad_tarefa_id = %s", (id,))
        cur.execute("DELETE FROM public.hgr_tar_tarefa_anx WHERE hgr_tar_cad_tarefa_id = %s", (id,))
        cur.execute("DELETE FROM public.hgr_tar_cad_tarefa WHERE id = %s", (id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Tarefa não encontrada")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Apontamento de Horas
# ============================================================
@router.post("/{tarefa_id}/apontamentos", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_apontamento(
    tarefa_id: int,
    payload: TarefaApontamentoCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        tempo = data["tempo_minutos"]
        cur.execute("""
            INSERT INTO public.hgr_tar_reg_apontamento
                (hgr_tar_cad_tarefa_id, usuario_id, dt_apontamento, tempo_minutos, descricao)
            VALUES (%s, %s, COALESCE(%s, CURRENT_DATE), %s, %s)
            RETURNING *
        """, (tarefa_id, usuario_id, data.get("dt_apontamento"), tempo, data.get("descricao")))
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


# ============================================================
# Kanban — visão por etapas
# ============================================================
@router.get("/kanban/board", dependencies=[Depends(require_permission('GES'))])
async def kanban_board(
    etapa_id: Optional[int] = None,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar colunas kanban
        kbn_query = "SELECT * FROM public.hgr_tar_cad_etp_kbn WHERE ativo = 'S'"
        kbn_params = []
        if etapa_id:
            kbn_query += " AND hgr_tar_cad_etp_id = %s"
            kbn_params.append(etapa_id)
        kbn_query += " ORDER BY ordem"
        cur.execute(kbn_query, kbn_params)
        colunas = cur.fetchall()

        # Buscar todas as tarefas de uma vez (evita N+1)
        col_ids = [col["id"] for col in colunas]
        if col_ids:
            placeholders = ",".join(["%s"] * len(col_ids))
            cur.execute(f"""
                SELECT t.id, t.titulo, t.prioridade,
                       COALESCE(t.status, t.hgr_tar_status) as status,
                       t.percentual,
                       COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as dt_previsao,
                       u.name as responsavel_nome,
                       t.hgr_tar_cad_etp_kbn_id
                FROM public.hgr_tar_cad_tarefa t
                LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
                WHERE t.hgr_tar_cad_etp_kbn_id IN ({placeholders})
                ORDER BY t.prioridade DESC, COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) ASC NULLS LAST
            """, col_ids)
            all_tasks = cur.fetchall()
            tasks_by_col = {}
            for task in all_tasks:
                cid = task["hgr_tar_cad_etp_kbn_id"]
                tasks_by_col.setdefault(cid, []).append(task)
            for col in colunas:
                col["tarefas"] = tasks_by_col.get(col["id"], [])
        else:
            for col in colunas:
                col["tarefas"] = []

        return {"colunas": colunas}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Time Tracking — APEX pg 204 AJAX callbacks (iniciar/pausar/entregar)
# Equivalente a PCK_HGR_PRJ.PRC_PRJ_UPD_TAR_KBN
# ============================================================
@router.post("/{tarefa_id}/iniciar", dependencies=[Depends(require_permission('GES', 'M'))])
async def iniciar_apontamento(tarefa_id: int, usuario_id: int = Depends(require_user)):
    """Inicia cronômetro de apontamento (STATUS='A'). APEX: iniciar_apontamento."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Verificar se já tem apontamento ativo
        cur.execute("""
            SELECT id FROM public.hgr_tar_reg_apontamento
            WHERE hgr_tar_cad_tarefa_id = %s AND usuario_id = %s
            AND tempo_minutos IS NULL
        """, (tarefa_id, usuario_id))
        if cur.fetchone():
            raise HTTPException(400, "Já existe apontamento ativo para esta tarefa")
        # Criar apontamento aberto (sem tempo_minutos = ativo)
        cur.execute("""
            INSERT INTO public.hgr_tar_reg_apontamento
                (hgr_tar_cad_tarefa_id, usuario_id, dt_apontamento, descricao)
            VALUES (%s, %s, CURRENT_DATE, 'Apontamento automático')
            RETURNING *
        """, (tarefa_id, usuario_id))
        # Mover tarefa para status EM_ANDAMENTO
        cur.execute("""
            UPDATE public.hgr_tar_cad_tarefa SET status = 'EM_ANDAMENTO', updated_at = NOW()
            WHERE id = %s AND status = 'ABERTA'
        """, (tarefa_id,))
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


@router.post("/{tarefa_id}/pausar", dependencies=[Depends(require_permission('GES', 'M'))])
async def pausar_apontamento(tarefa_id: int, usuario_id: int = Depends(require_user)):
    """Pausa cronômetro, calcula tempo. APEX: pausar_apontamento."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar apontamento ativo (tempo_minutos IS NULL)
        cur.execute("""
            SELECT id, created_at FROM public.hgr_tar_reg_apontamento
            WHERE hgr_tar_cad_tarefa_id = %s AND usuario_id = %s
            AND tempo_minutos IS NULL
            ORDER BY created_at DESC LIMIT 1
        """, (tarefa_id, usuario_id))
        apto = cur.fetchone()
        if not apto:
            raise HTTPException(400, "Nenhum apontamento ativo")
        # Calcular tempo decorrido
        cur.execute("""
            UPDATE public.hgr_tar_reg_apontamento
            SET tempo_minutos = GREATEST(1, EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)::INTEGER
            WHERE id = %s RETURNING *
        """, (apto["id"],))
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


@router.post("/{tarefa_id}/entregar", dependencies=[Depends(require_permission('GES', 'M'))])
async def entregar_tarefa(tarefa_id: int, usuario_id: int = Depends(require_user)):
    """Marca tarefa como concluída. APEX: entrega_tarefa (250 XP)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Pausar apontamento ativo se houver
        cur.execute("""
            UPDATE public.hgr_tar_reg_apontamento
            SET tempo_minutos = GREATEST(1, EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)::INTEGER
            WHERE hgr_tar_cad_tarefa_id = %s AND tempo_minutos IS NULL
        """, (tarefa_id,))
        # Marcar tarefa como concluída
        cur.execute("""
            UPDATE public.hgr_tar_cad_tarefa
            SET status = 'CONCLUIDA', dt_entrega = CURRENT_DATE, percentual = 100,
                updated_at = NOW(), updated_by = %s
            WHERE id = %s RETURNING *
        """, (usuario_id, tarefa_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tarefa não encontrada")
        # Gamificação — 250 XP (APEX PCK_HGR_GAM.prc_win_lose_xp)
        try:
            from backend.services.gamificacao import award_xp
            award_xp(usuario_id, 'ENTREGAR_TAREFA', referencia_tipo='TAREFA', referencia_id=tarefa_id)
        except Exception:
            pass  # não falhar entrega por erro de XP
        conn.commit()
        try:
            notify_tarefa_entregue(tarefa_id, row.get('titulo', ''), row.get('created_by') or 0, usuario_id)
        except Exception:
            pass
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
# Auto-numbering — APEX pg 204 CalcNumeroProjeto
# ============================================================
@router.get("/proximo-codigo", dependencies=[Depends(require_permission('GES'))])
async def proximo_codigo(usuario_id: int = Depends(require_user)):
    """Retorna o próximo código de tarefa disponível."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COALESCE(MAX(CAST(codigo AS INTEGER)), 0) + 1 as proximo FROM public.hgr_tar_cad_tarefa WHERE codigo ~ '^[0-9]+$'")
        return cur.fetchone()
    except Exception:
        return {"proximo": 1}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Apontamentos Avulsos (sem tarefa)
# ============================================================
@router.get("/apontamentos-avulsos", dependencies=[Depends(require_permission('GES'))])
async def listar_apontamentos_avulsos(
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    minhas: bool = False,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT a.*, u.name as usuario_nome, p.titulo as projeto_titulo
            FROM public.hgr_tar_apo_avulso a
            LEFT JOIN public.users u ON u.id = a.usuario_id
            LEFT JOIN public.hgr_prj_cad_projeto p ON p.id = a.hgr_prj_cad_projeto_id
            WHERE 1=1
        """
        params = []
        if minhas:
            query += " AND a.usuario_id = %s"
            params.append(usuario_id)
        if dt_inicio:
            query += " AND a.dt_apontamento >= %s"
            params.append(dt_inicio)
        if dt_fim:
            query += " AND a.dt_apontamento <= %s"
            params.append(dt_fim)
        query += " ORDER BY a.dt_apontamento DESC, a.created_at DESC LIMIT 500"
        cur.execute(query, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/apontamentos-avulsos", status_code=201, dependencies=[Depends(require_permission('GES', 'M'))])
async def criar_apontamento_avulso(payload: dict, usuario_id: int = Depends(require_user)):
    titulo = (payload.get("titulo") or "").strip()
    tempo = payload.get("tempo_minutos")
    if not titulo:
        raise HTTPException(400, "titulo obrigatório")
    if not tempo or int(tempo) <= 0:
        raise HTTPException(400, "tempo_minutos deve ser positivo")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_tar_apo_avulso
                (titulo, descricao, usuario_id, dt_apontamento, tempo_minutos,
                 hgr_prj_cad_projeto_id, categoria, created_by)
            VALUES (%s, %s, %s, COALESCE(%s, CURRENT_DATE), %s, %s, %s, %s)
            RETURNING *
        """, (
            titulo,
            payload.get("descricao"),
            payload.get("usuario_id") or usuario_id,
            payload.get("dt_apontamento"),
            int(tempo),
            payload.get("hgr_prj_cad_projeto_id"),
            payload.get("categoria"),
            usuario_id,
        ))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/apontamentos-avulsos/{apo_id}", status_code=204, dependencies=[Depends(require_permission('GES', 'M'))])
async def excluir_apontamento_avulso(apo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_tar_apo_avulso WHERE id = %s", (apo_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/relatorio-apontamentos", dependencies=[Depends(require_permission('GES'))])
async def relatorio_apontamentos(
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    responsavel_id: Optional[int] = None,
    projeto_id: Optional[int] = None,
    agrupar: str = Query("usuario", regex="^(usuario|projeto|dia)$"),
    usuario_id: int = Depends(require_user),
):
    """Relatório consolidado de horas: apontamentos em tarefas + avulsos."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Apontamentos vinculados a tarefas
        q_tar = """
            SELECT
                a.dt_apontamento,
                a.tempo_minutos,
                a.usuario_id,
                u.name as usuario_nome,
                t.titulo as referencia,
                'TAREFA' as tipo,
                NULL::bigint as hgr_prj_cad_projeto_id,
                NULL as projeto_titulo
            FROM public.hgr_tar_reg_apontamento a
            LEFT JOIN public.users u ON u.id = a.usuario_id
            LEFT JOIN public.hgr_tar_cad_tarefa t ON t.id = a.hgr_tar_cad_tarefa_id
            WHERE a.tempo_minutos IS NOT NULL
        """
        params_tar = []
        if dt_inicio:
            q_tar += " AND a.dt_apontamento >= %s"
            params_tar.append(dt_inicio)
        if dt_fim:
            q_tar += " AND a.dt_apontamento <= %s"
            params_tar.append(dt_fim)
        if responsavel_id:
            q_tar += " AND a.usuario_id = %s"
            params_tar.append(responsavel_id)

        # Apontamentos avulsos
        q_av = """
            SELECT
                a.dt_apontamento,
                a.tempo_minutos,
                a.usuario_id,
                u.name as usuario_nome,
                a.titulo as referencia,
                'AVULSO' as tipo,
                a.hgr_prj_cad_projeto_id,
                p.titulo as projeto_titulo
            FROM public.hgr_tar_apo_avulso a
            LEFT JOIN public.users u ON u.id = a.usuario_id
            LEFT JOIN public.hgr_prj_cad_projeto p ON p.id = a.hgr_prj_cad_projeto_id
            WHERE 1=1
        """
        params_av = []
        if dt_inicio:
            q_av += " AND a.dt_apontamento >= %s"
            params_av.append(dt_inicio)
        if dt_fim:
            q_av += " AND a.dt_apontamento <= %s"
            params_av.append(dt_fim)
        if responsavel_id:
            q_av += " AND a.usuario_id = %s"
            params_av.append(responsavel_id)
        if projeto_id:
            q_av += " AND a.hgr_prj_cad_projeto_id = %s"
            params_av.append(projeto_id)

        # Union e agrupamento
        union_q = f"({q_tar}) UNION ALL ({q_av})"
        if agrupar == "usuario":
            agg_q = f"""
                SELECT usuario_id, usuario_nome,
                       SUM(tempo_minutos) as total_minutos,
                       COUNT(*) as qtd_apontamentos,
                       MIN(dt_apontamento) as dt_inicio,
                       MAX(dt_apontamento) as dt_fim
                FROM ({union_q}) sub
                GROUP BY usuario_id, usuario_nome
                ORDER BY total_minutos DESC
            """
        elif agrupar == "projeto":
            agg_q = f"""
                SELECT hgr_prj_cad_projeto_id as projeto_id, projeto_titulo,
                       SUM(tempo_minutos) as total_minutos,
                       COUNT(*) as qtd_apontamentos,
                       MIN(dt_apontamento) as dt_inicio,
                       MAX(dt_apontamento) as dt_fim
                FROM ({union_q}) sub
                GROUP BY hgr_prj_cad_projeto_id, projeto_titulo
                ORDER BY total_minutos DESC
            """
        else:  # dia
            agg_q = f"""
                SELECT dt_apontamento,
                       SUM(tempo_minutos) as total_minutos,
                       COUNT(*) as qtd_apontamentos
                FROM ({union_q}) sub
                GROUP BY dt_apontamento
                ORDER BY dt_apontamento DESC
            """
        cur.execute(agg_q, params_tar + params_av + params_tar + params_av)
        linhas = cur.fetchall()

        # Detalhes (lista completa)
        det_q = f"SELECT * FROM ({union_q}) sub ORDER BY dt_apontamento DESC, usuario_nome"
        cur.execute(det_q, params_tar + params_av)
        detalhes = cur.fetchall()

        return {"agrupado": linhas, "detalhes": detalhes}
    finally:
        cur.close()
        conn.close()


@router.put("/kanban/mover/{tarefa_id}", dependencies=[Depends(require_permission('GES', 'M'))])
async def kanban_mover(
    tarefa_id: int,
    payload: TarefaKanbanMove,
    usuario_id: int = Depends(require_user),
):
    """Move tarefa para outra coluna kanban."""
    nova_coluna = payload.hgr_tar_cad_etp_kbn_id
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_tar_cad_tarefa
            SET hgr_tar_cad_etp_kbn_id = %s, updated_at = NOW(), updated_by = %s
            WHERE id = %s RETURNING id, titulo, hgr_tar_cad_etp_kbn_id
        """, (nova_coluna, usuario_id, tarefa_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tarefa não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
