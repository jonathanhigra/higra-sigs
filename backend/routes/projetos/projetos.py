# -*- coding: utf-8 -*-
"""CRUD de Projetos + Etapas + Participantes + Gastos + Anotações."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter, get_user_tipo
from backend.core.config import logger
from backend.routes.projetos.schemas import (
    ProjetoAnotacaoCreate,
    ProjetoCreate,
    ProjetoEtapaCreate,
    ProjetoEtapaUpdate,
    ProjetoGastoCreate,
    ProjetoParticipanteCreate,
    ProjetoParticipanteUpdate,
    ProjetoUpdate,
)

router = APIRouter()


def create_projetos_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_prj_cad_cat (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_prj_cad_projeto (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500) NOT NULL, codigo VARCHAR(50),
                descricao TEXT, objetivo TEXT, status VARCHAR(20) DEFAULT 'ABERTO',
                prioridade VARCHAR(20), dt_inicio DATE, dt_prev_termino DATE, dt_entrega DATE,
                vlr_orc NUMERIC(15,2), hgr_prj_cad_cat_id BIGINT,
                responsavel_id BIGINT, beg_processo_id BIGINT,
                sth_cad_empresa_id BIGINT, sth_cad_filial_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW(), updated_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_prj_reg_etp (
                id BIGSERIAL PRIMARY KEY, hgr_prj_cad_projeto_id BIGINT NOT NULL,
                titulo VARCHAR(200), descricao TEXT, status VARCHAR(20) DEFAULT 'PENDENTE',
                ordem INTEGER, dt_inicio DATE, dt_fim DATE, responsavel_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_prj_reg_ant (
                id BIGSERIAL PRIMARY KEY, hgr_prj_cad_projeto_id BIGINT NOT NULL,
                descricao TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_prj_reg_part (
                id BIGSERIAL PRIMARY KEY, hgr_prj_cad_projeto_id BIGINT NOT NULL,
                usuario_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_prj_cad_gast_ext (
                id BIGSERIAL PRIMARY KEY, hgr_prj_cad_projeto_id BIGINT NOT NULL,
                descricao VARCHAR(500), valor NUMERIC(15,2), dt_gasto DATE,
                categoria VARCHAR(100), fornecedor VARCHAR(300), nota_fiscal VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        cur.execute("ALTER TABLE public.hgr_prj_reg_etp ADD COLUMN IF NOT EXISTS marco VARCHAR(1) DEFAULT 'N'")
        cur.execute("ALTER TABLE public.hgr_prj_cad_projeto ADD COLUMN IF NOT EXISTS rq49_id BIGINT")
        cur.execute("ALTER TABLE public.hgr_prj_cad_projeto ADD COLUMN IF NOT EXISTS crm_neg_id BIGINT")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_prj_cad_tar_fix (
            id BIGSERIAL PRIMARY KEY,
            hgr_prj_cad_projeto_id BIGINT NOT NULL,
            titulo VARCHAR(300) NOT NULL,
            descricao TEXT,
            recorrencia VARCHAR(20) DEFAULT 'SEMANAL',
            dia_semana SMALLINT,
            dia_mes SMALLINT,
            responsavel_id BIGINT,
            ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER
        )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_prj_tar_fix ON public.hgr_prj_cad_tar_fix(hgr_prj_cad_projeto_id);")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_prj_cad_eqp (
            id BIGSERIAL PRIMARY KEY,
            nome VARCHAR(200) NOT NULL,
            descricao TEXT,
            ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by INTEGER
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_prj_cad_eqp_usr (
            id BIGSERIAL PRIMARY KEY,
            hgr_prj_cad_eqp_id BIGINT NOT NULL,
            usuario_id BIGINT NOT NULL,
            papel VARCHAR(20) DEFAULT 'COLABORADOR',
            UNIQUE(hgr_prj_cad_eqp_id, usuario_id)
        )""")
        cur.execute("ALTER TABLE public.hgr_prj_reg_part ADD COLUMN IF NOT EXISTS papel VARCHAR(20) DEFAULT 'COLABORADOR'")
        cur.execute("ALTER TABLE public.hgr_prj_cad_gast_ext ADD COLUMN IF NOT EXISTS justificativa TEXT")
        # Vínculo tarefa ↔ etapa de projeto (usado para propagação de prazos)
        cur.execute("ALTER TABLE public.hgr_tar_cad_tarefa ADD COLUMN IF NOT EXISTS hgr_prj_reg_etp_id BIGINT")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tar_prj_etp ON public.hgr_tar_cad_tarefa(hgr_prj_reg_etp_id);")
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'hgr_prj_reg_part_proj_user_uk'
                ) THEN
                    ALTER TABLE public.hgr_prj_reg_part
                    ADD CONSTRAINT hgr_prj_reg_part_proj_user_uk
                    UNIQUE (hgr_prj_cad_projeto_id, usuario_id);
                END IF;
            END $$;
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_prj_responsavel ON public.hgr_prj_cad_projeto(responsavel_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_prj_etp_projeto ON public.hgr_prj_reg_etp(hgr_prj_cad_projeto_id);")
        conn.commit()
        logger.info("Tabelas de projetos verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas projetos: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('PRJT'))])
async def listar_projetos(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT p.*,
                   COALESCE(p.responsavel_id, p.hgr_usuario_id) as _responsavel_id,
                   COALESCE(p.dt_inicio, p.dt_prev_inicio::date) as _dt_inicio,
                   COALESCE(p.sth_cad_empresa_id, p.hgr_cad_empresa_id) as _empresa_id,
                   COALESCE(p.sth_cad_filial_id, p.hgr_cad_filial_id) as _filial_id,
                   CASE p.prioridade
                       WHEN '1' THEN 'URGENTE' WHEN '2' THEN 'ALTA' WHEN '3' THEN 'MEDIA'
                       WHEN '4' THEN 'BAIXA' WHEN '5' THEN 'MUITO_BAIXA'
                       ELSE COALESCE(p.prioridade, 'MEDIA')
                   END as _prioridade,
                   CASE p.status
                       WHEN 'A' THEN 'ABERTO' WHEN 'F' THEN 'FINALIZADO'
                       WHEN 'P' THEN 'PARALISADO' WHEN 'C' THEN 'CANCELADO'
                       WHEN 'E' THEN 'EM_ANDAMENTO'
                       ELSE COALESCE(p.status, 'ABERTO')
                   END as _status,
                   u.name as responsavel_nome, COALESCE(c.descricao, c.categoria) as categoria
            FROM public.hgr_prj_cad_projeto p
            LEFT JOIN public.users u ON u.id = COALESCE(p.responsavel_id, p.hgr_usuario_id)
            LEFT JOIN public.hgr_prj_cad_cat c ON c.id = p.hgr_prj_cad_cat_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND p.status = %s"
            params.append(status)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'p',
            filial_col='COALESCE(p.sth_cad_filial_id, p.hgr_cad_filial_id)')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY COALESCE(p.created_at, p.created) DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


# --- Categorias (MUST be before /{id}) ---
@router.get("/categorias", dependencies=[Depends(require_permission('PRJT'))])
async def listar_categorias(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT id, COALESCE(descricao, categoria) as descricao, sigla,
            COALESCE(ativo, status) as ativo
            FROM public.hgr_prj_cad_cat ORDER BY COALESCE(descricao, categoria)""")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/categorias", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_categoria(payload: dict, usuario_id: int = Depends(require_user)):
    descricao = (payload.get("descricao") or "").strip()
    if not descricao:
        raise HTTPException(400, "Descrição obrigatória")
    sigla = (payload.get("sigla") or "").strip()[:20] or None
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_prj_cad_cat (descricao, sigla, ativo)
            VALUES (%s, %s, 'S')
            RETURNING id, descricao, sigla, ativo
        """, (descricao, sigla))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/categorias/{cat_id}", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def atualizar_categoria(cat_id: int, payload: dict, usuario_id: int = Depends(require_user)):
    descricao = payload.get("descricao")
    sigla = payload.get("sigla")
    ativo = payload.get("ativo")
    if descricao is not None and not str(descricao).strip():
        raise HTTPException(400, "Descrição não pode ser vazia")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_prj_cad_cat SET
                descricao = COALESCE(%s, descricao),
                sigla     = COALESCE(%s, sigla),
                ativo     = COALESCE(%s, ativo)
            WHERE id = %s
            RETURNING id, descricao, sigla, ativo
        """, (descricao, sigla, ativo, cat_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Categoria não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/categorias/{cat_id}", status_code=204, dependencies=[Depends(require_permission('PRJT', 'E'))])
async def remover_categoria(cat_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Impede exclusão se houver projetos vinculados; faz soft-delete (ativo='N')
        cur.execute(
            "SELECT COUNT(*) FROM public.hgr_prj_cad_projeto WHERE hgr_prj_cad_cat_id = %s",
            (cat_id,),
        )
        (total,) = cur.fetchone()
        if total and total > 0:
            cur.execute(
                "UPDATE public.hgr_prj_cad_cat SET ativo='N' WHERE id=%s",
                (cat_id,),
            )
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(404, "Categoria não encontrada")
            return
        cur.execute("DELETE FROM public.hgr_prj_cad_cat WHERE id=%s", (cat_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Categoria não encontrada")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Kanban do projeto (tarefas agrupadas por status) ---
@router.get("/kanban/{id}", dependencies=[Depends(require_permission('PRJT'))])
async def kanban_projeto(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Verificar projeto existe
        cur.execute("SELECT id FROM public.hgr_prj_cad_projeto WHERE id = %s", (id,))
        if not cur.fetchone():
            raise HTTPException(404, "Projeto não encontrado")
        # Tarefas do projeto se FK existir
        try:
            cur.execute("""
                SELECT t.id, t.titulo,
                       COALESCE(t.status, t.hgr_tar_status, 'ABERTA') as status,
                       t.dt_previsao as dt_prazo,
                       u.name as responsavel_nome
                FROM public.hgr_tar_cad_tarefa t
                LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
                WHERE t.hgr_prj_cad_projeto_id = %s
                ORDER BY COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) ASC NULLS LAST
            """, (id,))
            tarefas = cur.fetchall()
        except Exception:
            conn.rollback()
            tarefas = []
        colunas = {
            'PENDENTE':     [],
            'EM_ANDAMENTO': [],
            'CONCLUIDO':    [],
        }
        for t in tarefas:
            st = (t.get('status') or 'ABERTA').upper()
            if st in ('CONCLUIDA', 'CONCLUIDO', 'FINALIZADO', 'C'):
                colunas['CONCLUIDO'].append(t)
            elif st in ('EM_ANDAMENTO', 'E', 'EM_ESPERA'):
                colunas['EM_ANDAMENTO'].append(t)
            else:
                colunas['PENDENTE'].append(t)
        return {"colunas": colunas, "total": len(tarefas)}
    finally:
        cur.close()
        conn.close()


# --- Copiar projeto ---
@router.post("/copiar/{id}", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def copiar_projeto(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_prj_cad_projeto WHERE id = %s", (id,))
        orig = cur.fetchone()
        if not orig:
            raise HTTPException(404, "Projeto não encontrado")
        novo_titulo = f"Cópia de {orig['titulo']}"
        cur.execute("""
            INSERT INTO public.hgr_prj_cad_projeto
                (titulo, codigo, descricao, objetivo, status, prioridade,
                 dt_inicio, dt_prev_termino, vlr_orc, hgr_prj_cad_cat_id,
                 responsavel_id, beg_processo_id, sth_cad_empresa_id,
                 sth_cad_filial_id, created_by)
            SELECT %s, NULL, descricao, objetivo, 'ABERTO', prioridade,
                 dt_inicio, dt_prev_termino, vlr_orc, hgr_prj_cad_cat_id,
                 responsavel_id, beg_processo_id, sth_cad_empresa_id,
                 sth_cad_filial_id, %s
            FROM public.hgr_prj_cad_projeto WHERE id = %s
            RETURNING *
        """, (novo_titulo, usuario_id, id))
        novo = cur.fetchone()
        novo_id = novo['id']
        # Copiar etapas com status resetado para PENDENTE
        cur.execute("""
            INSERT INTO public.hgr_prj_reg_etp
                (hgr_prj_cad_projeto_id, titulo, descricao, status, ordem, dt_inicio, dt_fim, responsavel_id)
            SELECT %s, titulo, descricao, 'PENDENTE', ordem, dt_inicio, dt_fim, responsavel_id
            FROM public.hgr_prj_reg_etp WHERE hgr_prj_cad_projeto_id = %s
            ORDER BY COALESCE(ordem, seq)
        """, (novo_id, id))
        conn.commit()
        return novo
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Alterar prazos do projeto ---
@router.put("/alterar-prazos/{id}", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def alterar_prazos(id: int, payload: dict, usuario_id: int = Depends(require_user)):
    """Altera prazos do projeto com propagação opcional para etapas e tarefas vinculadas.

    Body:
      - dt_prev_termino (obrigatório)
      - dt_inicio (opcional)
      - propagar_etapas (bool) — reescala datas de etapas proporcionalmente
      - propagar_tarefas (bool) — reescala dt_previsao/dt_termino de tarefas linkadas às etapas
    """
    dt_prev_termino = payload.get("dt_prev_termino")
    dt_inicio_novo = payload.get("dt_inicio")
    propagar_etapas = payload.get("propagar_etapas", False)
    propagar_tarefas = payload.get("propagar_tarefas", False)
    if not dt_prev_termino:
        raise HTTPException(400, "dt_prev_termino é obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_prj_cad_projeto WHERE id = %s", (id,))
        proj = cur.fetchone()
        if not proj:
            raise HTTPException(404, "Projeto não encontrado")
        old_dt = proj.get('dt_prev_termino')
        old_inicio = proj.get('dt_inicio')
        # Update projeto
        if dt_inicio_novo:
            cur.execute("""
                UPDATE public.hgr_prj_cad_projeto
                SET dt_prev_termino = %s, dt_inicio = %s, updated_at = NOW(), updated_by = %s
                WHERE id = %s RETURNING *
            """, (dt_prev_termino, dt_inicio_novo, usuario_id, id))
        else:
            cur.execute("""
                UPDATE public.hgr_prj_cad_projeto
                SET dt_prev_termino = %s, updated_at = NOW(), updated_by = %s
                WHERE id = %s RETURNING *
            """, (dt_prev_termino, usuario_id, id))
        updated = cur.fetchone()

        tarefas_afetadas = 0
        etapas_afetadas = 0
        if (propagar_etapas or propagar_tarefas) and old_dt:
            from datetime import date
            old_end = old_dt if isinstance(old_dt, date) else date.fromisoformat(str(old_dt))
            new_end = date.fromisoformat(str(dt_prev_termino))
            base_inicio = old_inicio
            if base_inicio:
                base = base_inicio if isinstance(base_inicio, date) else date.fromisoformat(str(base_inicio))
                old_span = (old_end - base).days or 1
                new_span = (new_end - base).days or 1
                ratio = new_span / old_span
                if propagar_etapas:
                    cur.execute("""
                        UPDATE public.hgr_prj_reg_etp
                        SET
                            dt_inicio = CASE WHEN dt_inicio IS NOT NULL
                                THEN %s::date + (((dt_inicio - %s::date) * %s)::int)
                                ELSE dt_inicio END,
                            dt_fim = CASE WHEN dt_fim IS NOT NULL
                                THEN %s::date + (((dt_fim - %s::date) * %s)::int)
                                ELSE dt_fim END
                        WHERE hgr_prj_cad_projeto_id = %s
                    """, (base, base, ratio, base, base, ratio, id))
                    etapas_afetadas = cur.rowcount
                if propagar_tarefas:
                    # Atualiza tarefas linkadas a qualquer etapa deste projeto
                    cur.execute("""
                        UPDATE public.hgr_tar_cad_tarefa t
                        SET
                            dt_inicio = CASE WHEN t.dt_inicio IS NOT NULL
                                THEN %s::date + (((t.dt_inicio - %s::date) * %s)::int)
                                ELSE t.dt_inicio END,
                            dt_termino = CASE WHEN t.dt_termino IS NOT NULL
                                THEN %s::date + (((t.dt_termino - %s::date) * %s)::int)
                                ELSE t.dt_termino END,
                            dt_previsao = CASE WHEN t.dt_previsao IS NOT NULL
                                THEN %s::date + (((t.dt_previsao - %s::date) * %s)::int)
                                ELSE t.dt_previsao END,
                            updated_at = NOW(),
                            updated_by = %s
                        WHERE t.hgr_prj_reg_etp_id IN (
                            SELECT id FROM public.hgr_prj_reg_etp WHERE hgr_prj_cad_projeto_id = %s
                        )
                        AND (t.status IS NULL OR t.status NOT IN ('CONCLUIDA','CANCELADA'))
                    """, (base, base, ratio, base, base, ratio, base, base, ratio, usuario_id, id))
                    tarefas_afetadas = cur.rowcount
        conn.commit()
        return {**(updated or {}), "etapas_afetadas": etapas_afetadas, "tarefas_afetadas": tarefas_afetadas}
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('PRJT'))])
async def obter_projeto(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT p.*,
                   COALESCE(p.responsavel_id, p.hgr_usuario_id) as _responsavel_id,
                   COALESCE(p.sth_cad_empresa_id, p.hgr_cad_empresa_id) as _empresa_id,
                   COALESCE(p.sth_cad_filial_id, p.hgr_cad_filial_id) as _filial_id,
                   CASE p.prioridade
                       WHEN '1' THEN 'URGENTE' WHEN '2' THEN 'ALTA' WHEN '3' THEN 'MEDIA'
                       WHEN '4' THEN 'BAIXA' WHEN '5' THEN 'MUITO_BAIXA'
                       ELSE COALESCE(p.prioridade, 'MEDIA')
                   END as _prioridade,
                   CASE p.status
                       WHEN 'A' THEN 'ABERTO' WHEN 'F' THEN 'FINALIZADO'
                       WHEN 'P' THEN 'PARALISADO' WHEN 'C' THEN 'CANCELADO'
                       WHEN 'E' THEN 'EM_ANDAMENTO'
                       ELSE COALESCE(p.status, 'ABERTO')
                   END as _status,
                   u.name as responsavel_nome, COALESCE(c.descricao, c.categoria) as categoria
            FROM public.hgr_prj_cad_projeto p
            LEFT JOIN public.users u ON u.id = COALESCE(p.responsavel_id, p.hgr_usuario_id)
            LEFT JOIN public.hgr_prj_cad_cat c ON c.id = p.hgr_prj_cad_cat_id
            WHERE p.id = %s
        """, (id,))
        proj = cur.fetchone()
        if not proj:
            raise HTTPException(404, "Projeto não encontrado")

        # Scope validation
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = proj.get('sth_cad_filial_id') or proj.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")

        # Etapas
        cur.execute("""SELECT e.*, COALESCE(e.ordem, e.seq) as _ordem
            FROM public.hgr_prj_reg_etp e
            WHERE e.hgr_prj_cad_projeto_id = %s ORDER BY COALESCE(e.ordem, e.seq)""", (id,))
        proj["etapas"] = cur.fetchall()
        # Participantes
        cur.execute("""SELECT pa.*, u.name as usuario_nome FROM public.hgr_prj_reg_part pa
            LEFT JOIN public.users u ON u.id = COALESCE(pa.usuario_id, pa.hgr_usuario_id)
            WHERE pa.hgr_prj_cad_projeto_id = %s""", (id,))
        proj["participantes"] = cur.fetchall()
        # Anotações
        cur.execute("""SELECT a.*, u.name as autor FROM public.hgr_prj_reg_ant a
            LEFT JOIN public.users u ON u.id = COALESCE(a.created_by, a.createdby)
            WHERE a.hgr_prj_cad_projeto_id = %s ORDER BY COALESCE(a.created_at, a.created) DESC""", (id,))
        proj["anotacoes"] = cur.fetchall()
        # Gastos
        cur.execute("""SELECT g.*, g.forn as fornecedor, g.descr as descricao_gasto,
               COALESCE(g.dt_gasto, g.created::date) as _dt_gasto
            FROM public.hgr_prj_cad_gast_ext g
            WHERE g.hgr_prj_cad_projeto_id = %s
            ORDER BY COALESCE(g.dt_gasto, g.created::date) DESC""", (id,))
        proj["gastos"] = cur.fetchall()
        # RQ49 vinculadas
        try:
            cur.execute("""
                SELECT v.id as vinculo_id, v.beg_rq49_id, v.created_at,
                       r.codigo, r.titulo, r.status, r.dt_abertura
                FROM public.hgr_rq49_reg_prj v
                LEFT JOIN public.beg_rq49 r ON r.id = v.beg_rq49_id
                WHERE v.hgr_prj_cad_prj_id = %s
                ORDER BY v.created_at DESC
            """, (id,))
            proj["rq49_vinculos"] = cur.fetchall()
        except Exception:
            conn.rollback()
            proj["rq49_vinculos"] = []
        # Tarefas Fixas
        try:
            cur.execute("""
                SELECT tf.*, u.name as responsavel_nome
                FROM public.hgr_prj_cad_tar_fix tf
                LEFT JOIN public.users u ON u.id = tf.responsavel_id
                WHERE tf.hgr_prj_cad_projeto_id = %s AND tf.ativo = 'S'
                ORDER BY tf.titulo
            """, (id,))
            proj["tarefas_fixas"] = cur.fetchall()
        except Exception:
            conn.rollback()
            proj["tarefas_fixas"] = []
        return proj
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_projeto(payload: ProjetoCreate, usuario_id: int = Depends(require_user)):
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
            INSERT INTO public.hgr_prj_cad_projeto
                (titulo, codigo, descricao, objetivo, status, prioridade, dt_inicio, dt_prev_termino,
                 vlr_orc, hgr_prj_cad_cat_id, responsavel_id, beg_processo_id,
                 sth_cad_empresa_id, sth_cad_filial_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.get("titulo"), data.get("codigo"), data.get("descricao"), data.get("objetivo"),
              data.get("status", "ABERTO"), data.get("prioridade"), data.get("dt_inicio"),
              data.get("dt_prev_termino"), data.get("vlr_orc"), data.get("hgr_prj_cad_cat_id"),
              data.get("responsavel_id"), data.get("beg_processo_id"),
              data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def atualizar_projeto(id: int, payload: ProjetoUpdate, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_prj_cad_projeto SET
                titulo=COALESCE(%s,titulo),
                codigo=COALESCE(%s,codigo),
                descricao=COALESCE(%s,descricao),
                objetivo=COALESCE(%s,objetivo),
                status=COALESCE(%s,status),
                prioridade=COALESCE(%s,prioridade),
                dt_inicio=COALESCE(%s,dt_inicio),
                dt_prev_termino=COALESCE(%s,dt_prev_termino),
                dt_entrega=COALESCE(%s,dt_entrega),
                vlr_orc=COALESCE(%s,vlr_orc),
                hgr_prj_cad_cat_id=COALESCE(%s,hgr_prj_cad_cat_id),
                responsavel_id=COALESCE(%s,responsavel_id),
                beg_processo_id=COALESCE(%s,beg_processo_id),
                sth_cad_empresa_id=COALESCE(%s,sth_cad_empresa_id),
                sth_cad_filial_id=COALESCE(%s,sth_cad_filial_id),
                updated_at=NOW(), updated_by=%s
            WHERE id=%s RETURNING *
        """, (
            data.get("titulo"), data.get("codigo"), data.get("descricao"), data.get("objetivo"),
            data.get("status"), data.get("prioridade"), data.get("dt_inicio"),
            data.get("dt_prev_termino"), data.get("dt_entrega"), data.get("vlr_orc"),
            data.get("hgr_prj_cad_cat_id"), data.get("responsavel_id"), data.get("beg_processo_id"),
            data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id"), usuario_id, id,
        ))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Projeto não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Etapas ---
@router.post("/{projeto_id}/etapas", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_etapa(
    projeto_id: int,
    payload: ProjetoEtapaCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_prj_reg_etp
                (hgr_prj_cad_projeto_id, titulo, descricao, ordem, dt_inicio, dt_fim, responsavel_id, marco)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (projeto_id, data.get("titulo"), data.get("descricao"), data.get("ordem"),
              data.get("dt_inicio"), data.get("dt_fim"), data.get("responsavel_id"),
              (data.get("marco") or 'N').upper()[:1]))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/etapas/{etapa_id}", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def atualizar_etapa(
    etapa_id: int,
    payload: ProjetoEtapaUpdate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.hgr_prj_reg_etp SET
                titulo=COALESCE(%s,titulo),
                descricao=COALESCE(%s,descricao),
                status=COALESCE(%s,status),
                ordem=COALESCE(%s,ordem),
                dt_inicio=COALESCE(%s,dt_inicio),
                dt_fim=COALESCE(%s,dt_fim),
                responsavel_id=COALESCE(%s,responsavel_id),
                marco=COALESCE(%s,marco)
            WHERE id=%s RETURNING *
        """, (
            data.get("titulo"), data.get("descricao"), data.get("status"), data.get("ordem"),
            data.get("dt_inicio"), data.get("dt_fim"), data.get("responsavel_id"),
            (data.get("marco") or '').upper()[:1] or None,
            etapa_id,
        ))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Etapa não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{projeto_id}/etapas/reordenar", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def reordenar_etapas(
    projeto_id: int,
    payload: dict,
    usuario_id: int = Depends(require_user),
):
    """Reordena etapas de um projeto. Body: {"ordem": [etapa_id_1, etapa_id_2, ...]}"""
    ordem_ids = payload.get("ordem", [])
    if not isinstance(ordem_ids, list) or not ordem_ids:
        raise HTTPException(400, "Campo 'ordem' (lista de ids) obrigatório")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Valida que todas etapas pertencem ao projeto
        cur.execute(
            "SELECT id FROM public.hgr_prj_reg_etp WHERE hgr_prj_cad_projeto_id=%s",
            (projeto_id,),
        )
        etapas_projeto = {r[0] for r in cur.fetchall()}
        for eid in ordem_ids:
            if eid not in etapas_projeto:
                raise HTTPException(400, f"Etapa {eid} não pertence ao projeto {projeto_id}")
        # Atualiza em lote
        for idx, etapa_id in enumerate(ordem_ids, start=1):
            cur.execute(
                "UPDATE public.hgr_prj_reg_etp SET ordem=%s WHERE id=%s",
                (idx, etapa_id),
            )
        conn.commit()
        return {"ok": True, "total": len(ordem_ids)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Anotações ---
@router.post("/{projeto_id}/anotacoes", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_anotacao(
    projeto_id: int,
    payload: ProjetoAnotacaoCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_prj_reg_ant (hgr_prj_cad_projeto_id, descricao, created_by)
            VALUES (%s, %s, %s) RETURNING *
        """, (projeto_id, data.get("descricao"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Participantes ---
_PAPEIS_VALIDOS = {"RESPONSAVEL", "COLABORADOR", "APROVADOR"}


@router.post("/{projeto_id}/participantes", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def adicionar_participante(
    projeto_id: int,
    payload: ProjetoParticipanteCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    papel = (data.get("papel") or "COLABORADOR").upper()
    if papel not in _PAPEIS_VALIDOS:
        raise HTTPException(400, f"Papel inválido. Use: {sorted(_PAPEIS_VALIDOS)}")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_prj_reg_part (hgr_prj_cad_projeto_id, usuario_id, papel)
            VALUES (%s, %s, %s)
            ON CONFLICT (hgr_prj_cad_projeto_id, usuario_id) DO UPDATE SET papel = EXCLUDED.papel
            RETURNING *
        """, (projeto_id, data.get("usuario_id"), papel))
        conn.commit()
        row = cur.fetchone()
        if row:
            return row
        # ON CONFLICT DO UPDATE sempre retorna — fallback defensivo
        cur.execute("""
            SELECT * FROM public.hgr_prj_reg_part
            WHERE hgr_prj_cad_projeto_id=%s AND usuario_id=%s
        """, (projeto_id, data.get("usuario_id")))
        return cur.fetchone() or {"message": "Já é participante"}
    except HTTPException:
        raise
    except Exception as ex:
        conn.rollback()
        # Caso a constraint única não exista ainda (instâncias antigas), tenta sem ON CONFLICT
        if "ON CONFLICT" in str(ex) or "there is no unique" in str(ex).lower():
            try:
                cur.execute("""
                    INSERT INTO public.hgr_prj_reg_part (hgr_prj_cad_projeto_id, usuario_id, papel)
                    VALUES (%s, %s, %s) RETURNING *
                """, (projeto_id, data.get("usuario_id"), papel))
                conn.commit()
                return cur.fetchone()
            except Exception:
                conn.rollback()
                raise
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/participantes/{participante_id}", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def atualizar_participante(
    participante_id: int,
    payload: ProjetoParticipanteUpdate,
    usuario_id: int = Depends(require_user),
):
    papel = (payload.papel or "").upper()
    if papel not in _PAPEIS_VALIDOS:
        raise HTTPException(400, f"Papel inválido. Use: {sorted(_PAPEIS_VALIDOS)}")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_prj_reg_part SET papel=%s WHERE id=%s RETURNING *",
            (papel, participante_id),
        )
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Participante não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/participantes/{participante_id}", status_code=204, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def remover_participante(
    participante_id: int,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_prj_reg_part WHERE id=%s", (participante_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Participante não encontrado")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Gastos ---
@router.post("/{projeto_id}/gastos", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_gasto(
    projeto_id: int,
    payload: ProjetoGastoCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_prj_cad_gast_ext
                (hgr_prj_cad_projeto_id, descricao, valor, dt_gasto, categoria, fornecedor, nota_fiscal, justificativa)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (projeto_id, data.get("descricao"), data.get("valor"), data.get("dt_gasto"),
              data.get("categoria"), data.get("fornecedor"), data.get("nota_fiscal"),
              data.get("justificativa")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


    # categorias endpoint moved to top (before /{id})


# ─────────────────────────────────────────────────────
# Equipes Padrão (templates reutilizáveis de participantes)
# ─────────────────────────────────────────────────────

@router.get("/equipes-padrao", dependencies=[Depends(require_permission('PRJT'))])
async def listar_equipes_padrao(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT e.*, COUNT(eu.id) as total_membros
            FROM public.hgr_prj_cad_eqp e
            LEFT JOIN public.hgr_prj_cad_eqp_usr eu ON eu.hgr_prj_cad_eqp_id = e.id
            WHERE e.ativo = 'S'
            GROUP BY e.id
            ORDER BY e.nome
        """)
        equipes = cur.fetchall()
        # Carrega membros de cada equipe
        for eq in equipes:
            cur.execute("""
                SELECT eu.id, eu.usuario_id, eu.papel, u.name as usuario_nome
                FROM public.hgr_prj_cad_eqp_usr eu
                LEFT JOIN public.users u ON u.id = eu.usuario_id
                WHERE eu.hgr_prj_cad_eqp_id = %s
                ORDER BY u.name
            """, (eq["id"],))
            eq["membros"] = cur.fetchall()
        return {"items": equipes}
    finally:
        cur.close()
        conn.close()


@router.post("/equipes-padrao", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_equipe_padrao(payload: dict, usuario_id: int = Depends(require_user)):
    nome = (payload.get("nome") or "").strip()
    if not nome:
        raise HTTPException(400, "Nome da equipe obrigatório")
    membros = payload.get("membros") or []
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_prj_cad_eqp (nome, descricao, created_by) VALUES (%s, %s, %s) RETURNING *",
            (nome, payload.get("descricao"), usuario_id),
        )
        eq = cur.fetchone()
        eq_id = eq["id"]
        for m in membros:
            papel = (m.get("papel") or "COLABORADOR").upper()
            if papel not in _PAPEIS_VALIDOS:
                papel = "COLABORADOR"
            cur.execute(
                "INSERT INTO public.hgr_prj_cad_eqp_usr (hgr_prj_cad_eqp_id, usuario_id, papel) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (eq_id, m.get("usuario_id"), papel),
            )
        conn.commit()
        return eq
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/equipes-padrao/{eqp_id}/membros", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def adicionar_membro_equipe(eqp_id: int, payload: dict, usuario_id: int = Depends(require_user)):
    uid = payload.get("usuario_id")
    if not uid:
        raise HTTPException(400, "usuario_id obrigatório")
    papel = (payload.get("papel") or "COLABORADOR").upper()
    if papel not in _PAPEIS_VALIDOS:
        raise HTTPException(400, f"Papel inválido. Use: {sorted(_PAPEIS_VALIDOS)}")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id FROM public.hgr_prj_cad_eqp WHERE id=%s AND ativo='S'", (eqp_id,)
        )
        if not cur.fetchone():
            raise HTTPException(404, "Equipe não encontrada")
        cur.execute("""
            INSERT INTO public.hgr_prj_cad_eqp_usr (hgr_prj_cad_eqp_id, usuario_id, papel)
            VALUES (%s, %s, %s)
            ON CONFLICT (hgr_prj_cad_eqp_id, usuario_id) DO UPDATE SET papel = EXCLUDED.papel
            RETURNING *
        """, (eqp_id, int(uid), papel))
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


@router.delete("/equipes-padrao/{eqp_id}/membros/{usr_id}", status_code=204, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def remover_membro_equipe(eqp_id: int, usr_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM public.hgr_prj_cad_eqp_usr WHERE hgr_prj_cad_eqp_id=%s AND usuario_id=%s",
            (eqp_id, usr_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Membro não encontrado na equipe")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/equipes-padrao/{eqp_id}", status_code=204, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def remover_equipe_padrao(eqp_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE public.hgr_prj_cad_eqp SET ativo='N' WHERE id=%s",
            (eqp_id,),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Equipe não encontrada")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{projeto_id}/aplicar-equipe/{eqp_id}", status_code=200, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def aplicar_equipe_padrao(projeto_id: int, eqp_id: int, usuario_id: int = Depends(require_user)):
    """Aplica todos os membros de uma equipe padrão como participantes do projeto."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id FROM public.hgr_prj_cad_projeto WHERE id=%s", (projeto_id,)
        )
        if not cur.fetchone():
            raise HTTPException(404, "Projeto não encontrado")
        cur.execute(
            "SELECT eu.usuario_id, eu.papel FROM public.hgr_prj_cad_eqp_usr eu WHERE eu.hgr_prj_cad_eqp_id=%s",
            (eqp_id,),
        )
        membros = cur.fetchall()
        if not membros:
            raise HTTPException(400, "Equipe sem membros")
        adicionados = 0
        for m in membros:
            try:
                cur.execute("""
                    INSERT INTO public.hgr_prj_reg_part (hgr_prj_cad_projeto_id, usuario_id, papel)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (hgr_prj_cad_projeto_id, usuario_id) DO NOTHING
                """, (projeto_id, m["usuario_id"], m.get("papel", "COLABORADOR")))
                adicionados += cur.rowcount
            except Exception:
                conn.rollback()
        conn.commit()
        return {"adicionados": adicionados, "total_membros": len(membros)}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ─────────────────────────────────────────────────────
# Tarefas Fixas do projeto (recorrentes)
# ─────────────────────────────────────────────────────

_RECORRENCIAS_VALIDAS = {"DIARIA", "SEMANAL", "MENSAL"}


@router.get("/tarefas-fixas", dependencies=[Depends(require_permission('PRJT'))])
async def listar_todas_tarefas_fixas(
    projeto_id: Optional[int] = None,
    usuario_id: int = Depends(require_user),
):
    """Lista todas as tarefas fixas (opcionalmente filtradas por projeto)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        q = """
            SELECT tf.*, u.name as responsavel_nome,
                   p.titulo as projeto_titulo, p.codigo as projeto_codigo
            FROM public.hgr_prj_cad_tar_fix tf
            LEFT JOIN public.users u ON u.id = tf.responsavel_id
            LEFT JOIN public.hgr_prj_cad_projeto p ON p.id = tf.hgr_prj_cad_projeto_id
            WHERE tf.ativo = 'S'
        """
        params = []
        if projeto_id:
            q += " AND tf.hgr_prj_cad_projeto_id = %s"
            params.append(projeto_id)
        q += " ORDER BY p.titulo, tf.titulo"
        cur.execute(q, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/{projeto_id}/tarefas-fixas", dependencies=[Depends(require_permission('PRJT'))])
async def listar_tarefas_fixas(projeto_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT tf.*, u.name as responsavel_nome
            FROM public.hgr_prj_cad_tar_fix tf
            LEFT JOIN public.users u ON u.id = tf.responsavel_id
            WHERE tf.hgr_prj_cad_projeto_id = %s AND tf.ativo = 'S'
            ORDER BY tf.titulo
        """, (projeto_id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{projeto_id}/tarefas-fixas", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def criar_tarefa_fixa(projeto_id: int, payload: dict, usuario_id: int = Depends(require_user)):
    titulo = (payload.get("titulo") or "").strip()
    if not titulo:
        raise HTTPException(400, "Título obrigatório")
    recorrencia = (payload.get("recorrencia") or "SEMANAL").upper()
    if recorrencia not in _RECORRENCIAS_VALIDAS:
        raise HTTPException(400, f"Recorrência inválida. Use: {sorted(_RECORRENCIAS_VALIDAS)}")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_prj_cad_tar_fix
                (hgr_prj_cad_projeto_id, titulo, descricao, recorrencia, dia_semana, dia_mes, responsavel_id, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            projeto_id, titulo, payload.get("descricao"),
            recorrencia,
            payload.get("dia_semana"), payload.get("dia_mes"),
            payload.get("responsavel_id"), usuario_id,
        ))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{projeto_id}/tarefas-fixas/{tf_id}", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def atualizar_tarefa_fixa(projeto_id: int, tf_id: int, payload: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        recorrencia = payload.get("recorrencia")
        if recorrencia and recorrencia.upper() not in _RECORRENCIAS_VALIDAS:
            raise HTTPException(400, f"Recorrência inválida. Use: {sorted(_RECORRENCIAS_VALIDAS)}")
        cur.execute("""
            UPDATE public.hgr_prj_cad_tar_fix SET
                titulo      = COALESCE(%s, titulo),
                descricao   = COALESCE(%s, descricao),
                recorrencia = COALESCE(%s, recorrencia),
                dia_semana  = COALESCE(%s, dia_semana),
                dia_mes     = COALESCE(%s, dia_mes),
                responsavel_id = COALESCE(%s, responsavel_id)
            WHERE id = %s AND hgr_prj_cad_projeto_id = %s
            RETURNING *
        """, (
            payload.get("titulo"), payload.get("descricao"),
            recorrencia.upper() if recorrencia else None,
            payload.get("dia_semana"), payload.get("dia_mes"),
            payload.get("responsavel_id"),
            tf_id, projeto_id,
        ))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tarefa fixa não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{projeto_id}/tarefas-fixas/{tf_id}", status_code=204, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def remover_tarefa_fixa(projeto_id: int, tf_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Soft delete
        cur.execute(
            "UPDATE public.hgr_prj_cad_tar_fix SET ativo='N' WHERE id=%s AND hgr_prj_cad_projeto_id=%s",
            (tf_id, projeto_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Tarefa fixa não encontrada")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ─────────────────────────────────────────────────────
# Vínculo Projeto ↔ Negócio CRM (read-only do lado SIGS)
# ─────────────────────────────────────────────────────

@router.put("/{id}/vincular-neg", dependencies=[Depends(require_permission('PRJT', 'M'))])
async def vincular_neg_crm(id: int, payload: dict, usuario_id: int = Depends(require_user)):
    """Vincula um Negócio CRM (ID) ao projeto. Não modifica nada no CRM."""
    crm_neg_id = payload.get("crm_neg_id")
    if not crm_neg_id:
        raise HTTPException(400, "crm_neg_id obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_prj_cad_projeto SET crm_neg_id=%s, updated_at=NOW(), updated_by=%s WHERE id=%s RETURNING id, crm_neg_id",
            (int(crm_neg_id), usuario_id, id),
        )
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Projeto não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{id}/desvincular-neg", status_code=204, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def desvincular_neg_crm(id: int, usuario_id: int = Depends(require_user)):
    """Remove o vínculo do projeto com o Negócio CRM."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE public.hgr_prj_cad_projeto SET crm_neg_id=NULL, updated_at=NOW(), updated_by=%s WHERE id=%s",
            (usuario_id, id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Projeto não encontrado")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{id}/crm-neg", dependencies=[Depends(require_permission('PRJT'))])
async def obter_neg_crm(id: int, usuario_id: int = Depends(require_user)):
    """Retorna dados read-only do Negócio CRM vinculado ao projeto."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT crm_neg_id FROM public.hgr_prj_cad_projeto WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Projeto não encontrado")
        neg_id = row.get("crm_neg_id")
        if not neg_id:
            return {"crm_neg_id": None}
        # Tenta buscar dados do Negócio CRM (read-only)
        try:
            cur.execute("""
                SELECT id,
                       COALESCE(cod_neg, CAST(id AS VARCHAR)) as cod_neg,
                       COALESCE(titulo, descricao, '') as titulo,
                       status,
                       COALESCE(vlr_total, valor, 0) as vlr_total,
                       dt_fechamento,
                       responsavel_id
                FROM public.hgr_crm_cad_neg
                WHERE id = %s
            """, (neg_id,))
            neg = cur.fetchone()
            return neg or {"crm_neg_id": neg_id, "titulo": f"Negócio #{neg_id}", "status": None}
        except Exception:
            conn.rollback()
            return {"crm_neg_id": neg_id, "titulo": f"Negócio #{neg_id}", "status": None}
    finally:
        cur.close()
        conn.close()


# ─────────────────────────────────────────────────────
# Vínculo Projeto ↔ RQ49 (oportunidade virou projeto)
# ─────────────────────────────────────────────────────

@router.get("/{id}/rq49-vinculos", dependencies=[Depends(require_permission('PRJT'))])
async def listar_rq49_vinculos(id: int, usuario_id: int = Depends(require_user)):
    """Lista RQ49s vinculadas ao projeto."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT v.id as vinculo_id, v.beg_rq49_id, v.created_at,
                   r.codigo, r.titulo, r.status, r.dt_abertura
            FROM public.hgr_rq49_reg_prj v
            LEFT JOIN public.beg_rq49 r ON r.id = v.beg_rq49_id
            WHERE v.hgr_prj_cad_prj_id = %s
            ORDER BY v.created_at DESC
        """, (id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{id}/vincular-rq49", status_code=201, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def vincular_rq49(id: int, payload: dict, usuario_id: int = Depends(require_user)):
    """Vincula uma RQ49 ao projeto (oportunidade → projeto)."""
    rq49_id = payload.get("rq49_id")
    if not rq49_id:
        raise HTTPException(400, "rq49_id obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id FROM public.hgr_prj_cad_projeto WHERE id=%s", (id,)
        )
        if not cur.fetchone():
            raise HTTPException(404, "Projeto não encontrado")
        cur.execute(
            "SELECT id FROM public.beg_rq49 WHERE id=%s", (int(rq49_id),)
        )
        if not cur.fetchone():
            raise HTTPException(404, "RQ49 não encontrada")
        cur.execute("""
            INSERT INTO public.hgr_rq49_reg_prj (beg_rq49_id, hgr_prj_cad_prj_id, created_by)
            VALUES (%s, %s, %s)
            ON CONFLICT (beg_rq49_id, hgr_prj_cad_prj_id) DO NOTHING
            RETURNING id, beg_rq49_id, hgr_prj_cad_prj_id, created_at
        """, (int(rq49_id), id, usuario_id))
        conn.commit()
        return cur.fetchone() or {"beg_rq49_id": rq49_id, "hgr_prj_cad_prj_id": id, "vinculado": True}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{id}/vincular-rq49/{rq49_id}", status_code=204, dependencies=[Depends(require_permission('PRJT', 'M'))])
async def desvincular_rq49(id: int, rq49_id: int, usuario_id: int = Depends(require_user)):
    """Remove o vínculo entre RQ49 e projeto."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM public.hgr_rq49_reg_prj WHERE hgr_prj_cad_prj_id=%s AND beg_rq49_id=%s",
            (id, rq49_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Vínculo não encontrado")
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
