# -*- coding: utf-8 -*-
"""
RQ03 — Reclamações de Cliente (Não Conformidades / RAM)
Fluxo APEX: Abertura → Análise Extensão → Causa Raiz → Implementação → Eficácia → Fechamento
Cada etapa de análise é um modal separado (APEX pg 368, 371, 374, 377, 378)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter, get_user_tipo
from backend.core.config import logger
from backend.routes.qualidade.rq03_schemas import (
    Rq03AnaliseUpdate,
    Rq03AnotacaoCreate,
    Rq03Create,
    Rq03ParticipanteCreate,
    Rq03SstUpdate,
    Rq03TransicaoIn,
    Rq03Update,
    RQ03_LABELS,
    RQ03_PREREQUISITES,
    RQ03_TRANSITIONS,
    STATUS_NORM,
)
from backend.services.sigs_notifications import notify_rnc_aberta, notify_sigs

router = APIRouter()


def create_rq03_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.beg_rq03 (
                id BIGSERIAL PRIMARY KEY, codigo VARCHAR(50),
                reclamante VARCHAR(300), descricao TEXT, analise_extensao TEXT,
                causa_raiz TEXT, acao_imediata TEXT, acao_corretiva TEXT,
                analise_implementacao TEXT, analise_eficacia TEXT,
                status VARCHAR(30) DEFAULT 'ABERTA',
                dt_abertura DATE DEFAULT CURRENT_DATE, dt_fechamento DATE,
                beg_processo_id BIGINT, responsavel_id BIGINT,
                classificacao VARCHAR(50), prioridade VARCHAR(20),
                tipo VARCHAR(20) DEFAULT 'EXTERNA',
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_reg_ant (
                id BIGSERIAL PRIMARY KEY, beg_rq03_id BIGINT NOT NULL,
                descricao TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_reg_anx (
                id BIGSERIAL PRIMARY KEY, beg_rq03_id BIGINT NOT NULL,
                descricao VARCHAR(500), titulo VARCHAR(300),
                arquivo BYTEA, filename VARCHAR(500), mimetype VARCHAR(200),
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_reg_part (
                id BIGSERIAL PRIMARY KEY, beg_rq03_id BIGINT NOT NULL,
                usuario_id BIGINT, created_at TIMESTAMPTZ DEFAULT NOW())""",
            # SST — sub-formulário de acidente de trabalho
            """CREATE TABLE IF NOT EXISTS public.beg_rq03_reg_sst (
                id BIGSERIAL PRIMARY KEY, beg_rq03_id BIGINT NOT NULL,
                dt_ocorrencia DATE, dt_notificacao DATE, descricao TEXT,
                local_ocorrencia VARCHAR(300), turno VARCHAR(20),
                atividade VARCHAR(200), cat_profissional VARCHAR(200),
                tempo_empresa VARCHAR(50), afastamento VARCHAR(1),
                dias_afastamento INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Cadastros auxiliares SST
            """CREATE TABLE IF NOT EXISTS public.hgr_sst_cad_prt_crp (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_sst_cad_tp_lesao (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
        ]:
            cur.execute(sql)
        # Ação de Contenção (tarefa 262)
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS acao_contencao TEXT")
        # Origem da NC (tarefa 268)
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS origem VARCHAR(30)")
        # Evidências antes/depois (tarefa 263)
        cur.execute("ALTER TABLE public.hgr_rq03_reg_anx ADD COLUMN IF NOT EXISTS tipo_evidencia VARCHAR(20)")
        # ind_acidente — indica se é acidente de trabalho (SST)
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS ind_acidente CHAR(1) DEFAULT 'N'")
        # 5 Porquês (tarefa 258)
        for col in ['pq1', 'pq2', 'pq3', 'pq4', 'pq5']:
            cur.execute(f"ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS {col} TEXT")
        # Análise Extensão estruturada (tarefa 259)
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS ext_afeta_outros CHAR(1) DEFAULT 'N'")
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS ext_processos_afetados TEXT")
        # Análise Implementação estruturada (tarefa 260)
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS impl_realizada CHAR(1) DEFAULT 'N'")
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS impl_evidencias TEXT")
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS impl_data DATE")
        # Análise Eficácia estruturada (tarefa 261)
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS efic_periodo_dias INTEGER")
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS efic_eficaz CHAR(1)")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_rq03_reg_transicao (
            id BIGSERIAL PRIMARY KEY,
            beg_rq03_id BIGINT NOT NULL,
            status_anterior VARCHAR(30),
            status_novo VARCHAR(30) NOT NULL,
            motivo TEXT,
            usuario_id BIGINT,
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rq03_status ON public.beg_rq03(status);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rq03_responsavel ON public.beg_rq03(responsavel_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rq03_vencimento ON public.beg_rq03(dt_vencimento) WHERE dt_vencimento IS NOT NULL;")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rq03_created ON public.beg_rq03(created_at DESC NULLS LAST);")
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS produto_lote VARCHAR(200)")
        cur.execute("ALTER TABLE public.beg_rq03 ADD COLUMN IF NOT EXISTS responsavel_acao_id BIGINT")
        conn.commit()
        logger.info("Tabelas RQ03/SST verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas RQ03: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/resumo", dependencies=[Depends(require_permission('RNCO'))])
async def resumo_rq03(usuario_id: int = Depends(require_user)):
    """Contagens para dashboard RQ03: total por status + ações corretivas vencidas."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'r')

        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE r.status NOT IN ('F','FECHADA','C','CANCELADA')) AS abertas,
                COUNT(*) FILTER (WHERE r.status IN ('F','FECHADA')) AS fechadas,
                COUNT(*) FILTER (WHERE
                    r.status NOT IN ('F','FECHADA','C','CANCELADA')
                    AND COALESCE(r.dt_abertura, r.dt_rnc)::date + INTERVAL '30 days'
                        BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
                ) AS vencendo_7dias
            FROM public.beg_rq03 r
            WHERE 1=1 {scope_sql}
        """, scope_params)
        counts = cur.fetchone()

        # Ações corretivas (GAC) vinculadas a RQ03 com prazo vencido e não concluídas
        cur.execute("""
            SELECT COUNT(*) AS acoes_vencidas
            FROM public.hgr_gac_reg_tar g
            WHERE g.origem_tipo = 'RNCO'
              AND g.dt_prazo IS NOT NULL
              AND g.dt_prazo < CURRENT_DATE
              AND g.status NOT IN ('CONCLUIDA', 'CANCELADA', 'CONCLUIDO', 'CANCELADO')
              AND (g.deleted_at IS NULL OR g.deleted_at > NOW())
        """)
        gac = cur.fetchone()

        return {
            "abertas": counts["abertas"] or 0,
            "fechadas": counts["fechadas"] or 0,
            "vencendo_7dias": counts["vencendo_7dias"] or 0,
            "acoes_vencidas": gac["acoes_vencidas"] or 0,
        }
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('RNCO'))])
async def listar_rq03(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None, tipo: Optional[str] = None,
    vencendo_7dias: Optional[bool] = Query(None),
    acoes_vencidas: Optional[bool] = Query(None),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT r.*,
                   r.num_rnc::text as codigo,
                   COALESCE(r.dt_abertura, r.dt_rnc) as dt_abertura,
                   COALESCE(r.dt_fechamento, r.dt_encerramento) as dt_fechamento,
                   COALESCE(r.responsavel_id, r.beg_usuario_id) as responsavel_id,
                   r.sth_cad_processo_id as beg_processo_id,
                   CASE r.status
                       WHEN 'A' THEN 'ABERTA'
                       WHEN 'F' THEN 'FECHADA'
                       WHEN 'C' THEN 'CANCELADA'
                       WHEN 'E' THEN 'EM_ANALISE'
                       ELSE COALESCE(r.status, 'ABERTA')
                   END as status,
                   COALESCE(r.tipo, r.tp_rnc) as tipo,
                   u.name as responsavel_nome, p.nome as processo_nome,
                   ua.name as responsavel_acao_nome,
                   (SELECT COUNT(*) FROM public.hgr_rq03_reg_part WHERE beg_rq03_id = r.id) as qtd_equipe
            FROM public.beg_rq03 r
            LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
            LEFT JOIN public.users ua ON ua.id = r.responsavel_acao_id
            LEFT JOIN public.beg_processo p ON p.id = r.sth_cad_processo_id
            WHERE 1=1
        """
        params = []
        if status:
            query += """ AND CASE r.status
                WHEN 'A' THEN 'ABERTA' WHEN 'F' THEN 'FECHADA' WHEN 'C' THEN 'CANCELADA'
                WHEN 'E' THEN 'EM_ANALISE' ELSE COALESCE(r.status, 'ABERTA') END = %s"""
            params.append(status)
        if tipo:
            query += " AND COALESCE(r.tipo, r.tp_rnc) = %s"
            params.append(tipo)
        if vencendo_7dias:
            # SLA de 30 dias para resolução de não conformidades.
            # "Vencendo em 7 dias" = prazo de 30 dias vence entre hoje e hoje+7.
            query += """
                AND r.status NOT IN ('F', 'FECHADA', 'C', 'CANCELADA')
                AND COALESCE(r.dt_abertura, r.dt_rnc)::date + INTERVAL '30 days'
                    BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
            """
        if acoes_vencidas:
            query += """
                AND r.status NOT IN ('F', 'FECHADA', 'C', 'CANCELADA')
                AND r.dt_vencimento IS NOT NULL
                AND r.dt_vencimento < CURRENT_DATE
            """
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'r')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY COALESCE(r.dt_abertura, r.dt_rnc) DESC NULLS LAST LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('RNCO'))])
async def obter_rq03(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.*,
                   r.num_rnc::text as codigo,
                   COALESCE(r.dt_abertura, r.dt_rnc) as dt_abertura,
                   COALESCE(r.dt_fechamento, r.dt_encerramento) as dt_fechamento,
                   COALESCE(r.responsavel_id, r.beg_usuario_id) as responsavel_id,
                   r.sth_cad_processo_id as beg_processo_id,
                   u.name as responsavel_nome, p.nome as processo_nome
            FROM public.beg_rq03 r
            LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
            LEFT JOIN public.beg_processo p ON p.id = r.sth_cad_processo_id
            WHERE r.id = %s
        """, (id,))
        rq = cur.fetchone()
        if not rq:
            raise HTTPException(404, "RQ03 não encontrada")

        # Scope validation
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = rq.get('sth_cad_filial_id') or rq.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")

        # Equipe
        cur.execute("""SELECT pa.*, u.name as usuario_nome FROM public.hgr_rq03_reg_part pa
            LEFT JOIN public.users u ON u.id = COALESCE(pa.usuario_id, pa.beg_usuarios_id)
            WHERE pa.beg_rq03_id = %s""", (id,))
        rq["equipe"] = cur.fetchall()
        # Anotações
        cur.execute("""SELECT a.*, u.name as autor FROM public.hgr_rq03_reg_ant a
            LEFT JOIN public.users u ON u.id = COALESCE(a.created_by, a.createdby)
            WHERE a.beg_rq03_id = %s ORDER BY COALESCE(a.created_at, a.created) DESC""", (id,))
        rq["anotacoes"] = cur.fetchall()
        # SST
        cur.execute("SELECT * FROM public.beg_rq03_reg_sst WHERE beg_rq03_id = %s", (id,))
        rq["sst"] = cur.fetchone()
        return rq
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_rq03(payload: Rq03Create, usuario_id: int = Depends(require_user)):
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
        # Auto-numbering (APEX pg 359 DA "Num RNC": max(codigo) + 1)
        cur.execute("SELECT COALESCE(MAX(CAST(codigo AS INTEGER)), 0) + 1 as prox FROM public.beg_rq03 WHERE codigo ~ '^[0-9]+$'")
        prox = cur.fetchone()["prox"]
        cur.execute("""
            INSERT INTO public.beg_rq03
                (codigo, reclamante, descricao, classificacao, prioridade, tipo,
                 beg_processo_id, responsavel_id, sth_cad_empresa_id, sth_cad_filial_id,
                 dt_abertura, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_DATE,%s) RETURNING *
        """, (str(prox), data.get("reclamante"), data.get("descricao"), data.get("classificacao"),
              data.get("prioridade"), data.get("tipo", "EXTERNA"),
              data.get("beg_processo_id"), data.get("responsavel_id"),
              data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id"), usuario_id))
        conn.commit()
        row = cur.fetchone()
        try:
            resp_id = data.get("responsavel_id")
            if resp_id and resp_id != usuario_id:
                notify_rnc_aberta(row['id'], str(row.get('id', '')), resp_id, usuario_id)
        except Exception:
            pass
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def atualizar_rq03(id: int, payload: Rq03Update, usuario_id: int = Depends(require_user)):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq03 SET
                reclamante=COALESCE(%s,reclamante), descricao=COALESCE(%s,descricao),
                status=COALESCE(%s,status), classificacao=COALESCE(%s,classificacao),
                prioridade=COALESCE(%s,prioridade), tipo=COALESCE(%s,tipo),
                beg_processo_id=COALESCE(%s,beg_processo_id),
                responsavel_id=COALESCE(%s,responsavel_id),
                sth_cad_empresa_id=COALESCE(%s,sth_cad_empresa_id),
                sth_cad_filial_id=COALESCE(%s,sth_cad_filial_id),
                ind_acidente=COALESCE(%s,ind_acidente),
                origem=COALESCE(%s,origem),
                updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (data.get("reclamante"), data.get("descricao"), data.get("status"),
              data.get("classificacao"), data.get("prioridade"), data.get("tipo"),
              data.get("beg_processo_id"), data.get("responsavel_id"),
              data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id"),
              data.get("ind_acidente"), data.get("origem"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ03 não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Análises (cada uma é um modal no APEX: pg 368, 371, 374, 377, 378) ---
@router.put("/{id}/analise/{etapa}", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def salvar_analise(
    id: int,
    etapa: str,
    payload: Rq03AnaliseUpdate,
    usuario_id: int = Depends(require_user),
):
    """Salva uma etapa de análise. etapa: extensao, causa_raiz, implementacao, eficacia."""
    data = payload.model_dump()
    CAMPOS = {
        'extensao': 'analise_extensao',
        'causa_raiz': 'causa_raiz',
        'acao_imediata': 'acao_imediata',
        'contencao': 'acao_contencao',
        'acao_corretiva': 'acao_corretiva',
        'implementacao': 'analise_implementacao',
        'eficacia': 'analise_eficacia',
    }
    campo = CAMPOS.get(etapa)
    if not campo:
        raise HTTPException(400, f"Etapa inválida. Opções: {', '.join(CAMPOS.keys())}")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if etapa == 'causa_raiz':
            # 5 Porquês (tarefa 258)
            cur.execute("""
                UPDATE public.beg_rq03 SET
                    causa_raiz=%s, pq1=%s, pq2=%s, pq3=%s, pq4=%s, pq5=%s, updated_at=NOW()
                WHERE id=%s RETURNING id, status, causa_raiz, pq1, pq2, pq3, pq4, pq5
            """, (data.get("texto"), data.get("pq1"), data.get("pq2"),
                  data.get("pq3"), data.get("pq4"), data.get("pq5"), id))
        elif etapa == 'extensao':
            # Análise de Extensão estruturada (tarefa 259)
            cur.execute("""
                UPDATE public.beg_rq03 SET
                    analise_extensao=%s, ext_afeta_outros=COALESCE(%s, ext_afeta_outros),
                    ext_processos_afetados=%s, updated_at=NOW()
                WHERE id=%s RETURNING id, status, analise_extensao, ext_afeta_outros, ext_processos_afetados
            """, (data.get("texto"), data.get("ext_afeta_outros"),
                  data.get("ext_processos_afetados"), id))
        elif etapa == 'implementacao':
            # Análise de Implementação estruturada (tarefa 260)
            impl_data = data.get("impl_data") or None
            cur.execute("""
                UPDATE public.beg_rq03 SET
                    analise_implementacao=%s, impl_realizada=COALESCE(%s, impl_realizada),
                    impl_evidencias=%s, impl_data=%s, updated_at=NOW()
                WHERE id=%s RETURNING id, status, analise_implementacao, impl_realizada, impl_evidencias, impl_data
            """, (data.get("texto"), data.get("impl_realizada"),
                  data.get("impl_evidencias"), impl_data, id))
        elif etapa == 'eficacia':
            # Análise de Eficácia estruturada (tarefa 261)
            cur.execute("""
                UPDATE public.beg_rq03 SET
                    analise_eficacia=%s, efic_periodo_dias=COALESCE(%s, efic_periodo_dias),
                    efic_eficaz=COALESCE(%s, efic_eficaz), updated_at=NOW()
                WHERE id=%s RETURNING id, status, analise_eficacia, efic_periodo_dias, efic_eficaz
            """, (data.get("texto"), data.get("efic_periodo_dias"),
                  data.get("efic_eficaz"), id))
        else:
            CAMPO_MAP = {
                'acao_imediata':  'acao_imediata',
                'contencao':      'acao_contencao',
                'acao_corretiva': 'acao_corretiva',
            }
            col = CAMPO_MAP[campo]
            cur.execute(f"UPDATE public.beg_rq03 SET {col}=%s, updated_at=NOW() WHERE id=%s RETURNING id, status, {col}",
                        (data.get("texto"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ03 não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Anotações ---
@router.post("/{rq03_id}/anotacoes", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def add_anotacao(
    rq03_id: int,
    payload: Rq03AnotacaoCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq03_reg_ant (beg_rq03_id, descricao, created_by)
            VALUES (%s, %s, %s) RETURNING *""", (rq03_id, data.get("descricao"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Encerramento / Reabertura (APEX pg 359 pl_encerra_rnc / Reabertura de RNC) ---
@router.post("/{id}/encerrar", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def encerrar_rq03(id: int, usuario_id: int = Depends(require_user)):
    """Encerra RQ03 — APEX pg 359 process pl_encerra_rnc. Auto-set DT_ENCERRAMENTO.
    Tarefa 269: auto-gera Plano de Ação se houver acao_corretiva preenchida."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq03
            SET status = 'FECHADA', dt_fechamento = CURRENT_DATE, updated_at = NOW()
            WHERE id = %s RETURNING id, status, dt_fechamento, acao_corretiva, responsavel_id,
                  COALESCE(num_rnc::text, id::text) as codigo
        """, (id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ03 não encontrada")
        # Auto-gerar Plano de Ação se houver ação corretiva (tarefa 269)
        plano_id = None
        if row.get("acao_corretiva"):
            cur.execute("""
                INSERT INTO public.hgr_gac_reg_tar
                    (titulo, descricao, responsavel_id, status, origem_tipo, origem_id, created_by)
                VALUES (%s, %s, %s, 'PENDENTE', 'RNCO', %s, %s)
                RETURNING id
            """, (
                f"Ação Corretiva — NC {row['codigo']}",
                row["acao_corretiva"],
                row.get("responsavel_id"),
                id,
                usuario_id,
            ))
            plano_row = cur.fetchone()
            plano_id = plano_row["id"] if plano_row else None
        conn.commit()
        result = dict(row)
        if plano_id:
            result["plano_acao_gerado_id"] = plano_id
        return result
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{id}/reabrir", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def reabrir_rq03(id: int, usuario_id: int = Depends(require_user)):
    """Reabre RQ03 — APEX pg 359 DA "Reabertura de RNC". Limpa dados de encerramento."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.beg_rq03
            SET status = 'EM_ANALISE', dt_fechamento = NULL, updated_at = NOW()
            WHERE id = %s RETURNING id, status
        """, (id,))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "RQ03 não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Equipe ---
@router.post("/{rq03_id}/equipe", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def add_participante(
    rq03_id: int,
    payload: Rq03ParticipanteCreate,
    usuario_id: int = Depends(require_user),
):
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq03_reg_part (beg_rq03_id, usuario_id)
            VALUES (%s, %s) RETURNING *""", (rq03_id, data.get("usuario_id")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- SST — Sub-formulário de acidente de trabalho (APEX pg 501 MODAL) ---
@router.get("/{rq03_id}/sst", dependencies=[Depends(require_permission('RNCO'))])
async def obter_sst(rq03_id: int, usuario_id: int = Depends(require_user)):
    """Retorna dados SST vinculados à RQ03."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.beg_rq03_reg_sst WHERE beg_rq03_id = %s", (rq03_id,))
        return cur.fetchone() or {"beg_rq03_id": rq03_id, "preenchido": False}
    finally:
        cur.close()
        conn.close()


@router.post("/{rq03_id}/sst", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def salvar_sst(
    rq03_id: int,
    payload: Rq03SstUpdate,
    usuario_id: int = Depends(require_user),
):
    """Salva/atualiza dados SST — APEX pg 501 Modal."""
    data = payload.model_dump()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Upsert
        cur.execute("SELECT id FROM public.beg_rq03_reg_sst WHERE beg_rq03_id = %s", (rq03_id,))
        existing = cur.fetchone()
        if existing:
            cur.execute("""
                UPDATE public.beg_rq03_reg_sst SET
                    dt_ocorrencia=%s, dt_notificacao=%s, descricao=%s,
                    local_ocorrencia=%s, turno=%s, atividade=%s,
                    cat_profissional=%s, tempo_empresa=%s,
                    afastamento=%s, dias_afastamento=%s
                WHERE beg_rq03_id=%s RETURNING *
            """, (data.get("dt_ocorrencia"), data.get("dt_notificacao"),
                  data.get("descricao"), data.get("local_ocorrencia"),
                  data.get("turno"), data.get("atividade"),
                  data.get("cat_profissional"), data.get("tempo_empresa"),
                  data.get("afastamento"), data.get("dias_afastamento"), rq03_id))
        else:
            cur.execute("""
                INSERT INTO public.beg_rq03_reg_sst
                    (beg_rq03_id, dt_ocorrencia, dt_notificacao, descricao,
                     local_ocorrencia, turno, atividade,
                     cat_profissional, tempo_empresa, afastamento, dias_afastamento)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
            """, (rq03_id, data.get("dt_ocorrencia"), data.get("dt_notificacao"),
                  data.get("descricao"), data.get("local_ocorrencia"),
                  data.get("turno"), data.get("atividade"),
                  data.get("cat_profissional"), data.get("tempo_empresa"),
                  data.get("afastamento"), data.get("dias_afastamento")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Evidências Antes/Depois (tarefa 263) ---
@router.get("/{rq03_id}/evidencias", dependencies=[Depends(require_permission('RNCO'))])
async def listar_evidencias(rq03_id: int, tipo: Optional[str] = None, usuario_id: int = Depends(require_user)):
    """Lista evidências (antes/depois) de uma RQ03."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        sql = "SELECT id, titulo, filename, mimetype, tipo_evidencia, created_at FROM public.hgr_rq03_reg_anx WHERE beg_rq03_id = %s"
        params = [rq03_id]
        if tipo:
            sql += " AND tipo_evidencia = %s"
            params.append(tipo)
        sql += " ORDER BY created_at ASC"
        cur.execute(sql, params)
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/{rq03_id}/evidencias", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def upload_evidencia(
    rq03_id: int,
    file: UploadFile = File(...),
    tipo: str = Form("ANTES"),
    titulo: str = Form(""),
    usuario_id: int = Depends(require_user),
):
    """Upload de evidência (antes/depois) para uma RQ03 (tarefa 263)."""
    if tipo not in ("ANTES", "DEPOIS"):
        raise HTTPException(400, "tipo deve ser ANTES ou DEPOIS")
    conteudo = await file.read()
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_rq03_reg_anx
                (beg_rq03_id, titulo, arquivo, filename, mimetype, tipo_evidencia, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, titulo, filename, mimetype, tipo_evidencia, created_at
        """, (rq03_id, titulo or file.filename, conteudo, file.filename, file.content_type, tipo, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{rq03_id}/evidencias/{evid_id}/imagem", dependencies=[Depends(require_permission('RNCO'))])
async def get_evidencia_imagem(rq03_id: int, evid_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT arquivo, mimetype FROM public.hgr_rq03_reg_anx WHERE id=%s AND beg_rq03_id=%s", (evid_id, rq03_id))
        row = cur.fetchone()
        if not row or not row[0]:
            raise HTTPException(404)
        return Response(content=bytes(row[0]), media_type=row[1] or "image/jpeg")
    finally:
        cur.close()
        conn.close()


@router.delete("/{rq03_id}/evidencias/{evid_id}", status_code=204, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def delete_evidencia(rq03_id: int, evid_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_rq03_reg_anx WHERE id=%s AND beg_rq03_id=%s", (evid_id, rq03_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- PDF (tarefa 270) ---
@router.get("/{id}/pdf", dependencies=[Depends(require_permission('RNCO'))])
async def gerar_pdf_rq03(id: int, usuario_id: int = Depends(require_user)):
    """Gera PDF profissional de uma RQ03 — APEX pg 359 "Imprimir" (tarefa 270)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.*, COALESCE(r.num_rnc::text, r.id::text) as codigo,
                   COALESCE(r.dt_abertura, r.dt_rnc) as dt_ab,
                   u.name as responsavel_nome
            FROM public.beg_rq03 r
            LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
            WHERE r.id = %s
        """, (id,))
        rq = cur.fetchone()
        if not rq:
            raise HTTPException(404, "RQ03 não encontrada")
    finally:
        cur.close()
        conn.close()

    from fpdf import FPDF

    class RQ03PDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 11)
            self.set_fill_color(30, 30, 80)
            self.set_text_color(255, 255, 255)
            self.cell(0, 9, f"  NÃO CONFORMIDADE — {rq['codigo']}", fill=True, ln=True)
            self.set_text_color(0, 0, 0)
            self.ln(2)

        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(120, 120, 120)
            self.cell(0, 5, f"Página {self.page_no()} — Gerado em {__import__('datetime').date.today().strftime('%d/%m/%Y')}", align="C")

    pdf = RQ03PDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    def label_value(lbl, val, w_lbl=40):
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(w_lbl, 5.5, lbl + ":", ln=False)
        pdf.set_font("Helvetica", "", 8)
        pdf.multi_cell(0, 5.5, str(val or "—"))

    def section(title):
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(220, 225, 240)
        pdf.cell(0, 6, f"  {title}", fill=True, ln=True)
        pdf.ln(1)

    # Identificação
    section("IDENTIFICAÇÃO")
    label_value("Status", rq.get("status", ""))
    label_value("Tipo", rq.get("tipo", ""))
    label_value("Origem", rq.get("origem", ""))
    label_value("Prioridade", rq.get("prioridade", ""))
    label_value("Reclamante", rq.get("reclamante", ""))
    dt = rq.get("dt_ab")
    label_value("Data de Abertura", dt.strftime("%d/%m/%Y") if dt else "")
    label_value("Responsável", rq.get("responsavel_nome", ""))
    label_value("Descrição", rq.get("descricao", ""))

    # Análises
    for campo, titulo in [
        ("analise_extensao", "ANÁLISE DE EXTENSÃO"),
        ("causa_raiz",       "CAUSA RAIZ"),
        ("acao_imediata",    "AÇÃO IMEDIATA"),
        ("acao_contencao",   "AÇÃO DE CONTENÇÃO"),
        ("acao_corretiva",   "AÇÃO CORRETIVA"),
        ("analise_implementacao", "ANÁLISE DE IMPLEMENTAÇÃO"),
        ("analise_eficacia", "ANÁLISE DE EFICÁCIA"),
    ]:
        val = rq.get(campo)
        if val:
            section(titulo)
            pdf.set_font("Helvetica", "", 8)
            pdf.multi_cell(0, 5, str(val))

    # 5 Porquês
    pqs = [rq.get(f"pq{i}") for i in range(1, 6) if rq.get(f"pq{i}")]
    if pqs:
        section("TÉCNICA DOS 5 PORQUÊS")
        for i, pq in enumerate(pqs, 1):
            pdf.set_font("Helvetica", "B", 8)
            pdf.cell(18, 5, f"{i}º Por quê:", ln=False)
            pdf.set_font("Helvetica", "", 8)
            pdf.multi_cell(0, 5, str(pq))

    pdf_bytes = bytes(pdf.output())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="RQ03_{rq["codigo"]}.pdf"'},
    )


# --- State Machine: Transições de Status (tarefa 267) ---

def _normalize_status(raw: str | None) -> str:
    if not raw:
        return 'ABERTA'
    return STATUS_NORM.get(raw.strip().upper(), raw.strip().upper())


def _check_prerequisites(rq: dict, target: str) -> list[str]:
    reqs = RQ03_PREREQUISITES.get(target, [])
    missing = []
    for field in reqs:
        val = rq.get(field)
        if not val or (isinstance(val, str) and not val.strip()):
            missing.append(field)
    return missing


@router.get("/{id}/transicoes", dependencies=[Depends(require_permission('RNCO'))])
async def transicoes_disponiveis(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.beg_rq03 WHERE id = %s", (id,))
        rq = cur.fetchone()
        if not rq:
            raise HTTPException(404, "RQ03 não encontrada")
        current = _normalize_status(rq.get("status"))
        targets = RQ03_TRANSITIONS.get(current, [])
        result = []
        for t in targets:
            missing = _check_prerequisites(rq, t)
            result.append({
                "status": t,
                "label": RQ03_LABELS.get(t, t),
                "permitido": len(missing) == 0,
                "campos_pendentes": missing,
            })
        return {
            "status_atual": current,
            "status_label": RQ03_LABELS.get(current, current),
            "transicoes": result,
        }
    finally:
        cur.close()
        conn.close()


@router.post("/{id}/transicao", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def executar_transicao(id: int, payload: Rq03TransicaoIn, usuario_id: int = Depends(require_user)):
    novo = _normalize_status(payload.novo_status)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.beg_rq03 WHERE id = %s FOR UPDATE", (id,))
        rq = cur.fetchone()
        if not rq:
            raise HTTPException(404, "RQ03 não encontrada")

        current = _normalize_status(rq.get("status"))
        allowed = RQ03_TRANSITIONS.get(current, [])
        if novo not in allowed:
            raise HTTPException(
                400,
                f"Transição {current} → {novo} não permitida. "
                f"Transições válidas: {', '.join(allowed) or 'nenhuma'}"
            )

        missing = _check_prerequisites(rq, novo)
        if missing:
            raise HTTPException(
                400,
                f"Pré-requisitos não atendidos para {RQ03_LABELS.get(novo, novo)}: "
                f"preencha {', '.join(missing)}"
            )

        extra_sets = ""
        extra_params: list = []
        if novo == 'FECHADA':
            extra_sets = ", dt_fechamento = CURRENT_DATE"
        elif novo == 'EM_ANALISE' and current == 'FECHADA':
            extra_sets = ", dt_fechamento = NULL"

        cur.execute(
            f"UPDATE public.beg_rq03 SET status=%s, updated_at=NOW(){extra_sets} "
            f"WHERE id=%s RETURNING id, status, dt_fechamento",
            [novo] + extra_params + [id],
        )
        row = cur.fetchone()

        cur.execute("""
            INSERT INTO public.hgr_rq03_reg_transicao
                (beg_rq03_id, status_anterior, status_novo, motivo, usuario_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (id, current, novo, payload.motivo, usuario_id))

        plano_id = None
        if novo == 'FECHADA' and rq.get("acao_corretiva"):
            cur.execute("""
                INSERT INTO public.hgr_gac_reg_tar
                    (titulo, descricao, responsavel_id, status, origem_tipo, origem_id, created_by)
                VALUES (%s, %s, %s, 'PENDENTE', 'RNCO', %s, %s)
                RETURNING id
            """, (
                f"Ação Corretiva — NC {rq.get('num_rnc') or rq['id']}",
                rq["acao_corretiva"],
                rq.get("responsavel_id"),
                id,
                usuario_id,
            ))
            plano_row = cur.fetchone()
            plano_id = plano_row["id"] if plano_row else None

        conn.commit()
        result = dict(row)
        result["transicao"] = f"{current} → {novo}"
        if plano_id:
            result["plano_acao_gerado_id"] = plano_id
        # Notificação ao responsável (tarefa 306)
        resp_id = rq.get("responsavel_id") or rq.get("beg_usuario_id")
        if resp_id and resp_id != usuario_id:
            try:
                notify_sigs(resp_id, 'rnc_etapa_mudada',
                            f'NC {rq.get("num_rnc") or rq["id"]} → {RQ03_LABELS.get(novo, novo)}',
                            f'/qualidade/rq03/{id}', actor_id=usuario_id)
            except Exception:
                pass
        return result
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{id}/historico-transicoes", dependencies=[Depends(require_permission('RNCO'))])
async def historico_transicoes(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.*, u.name as usuario_nome
            FROM public.hgr_rq03_reg_transicao t
            LEFT JOIN public.users u ON u.id = t.usuario_id
            WHERE t.beg_rq03_id = %s
            ORDER BY t.created_at DESC
        """, (id,))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# --- Analytics (tarefas 271-272) ---
@router.get("/analytics/pareto-causas", dependencies=[Depends(require_user)])
async def pareto_causas(limit: int = 10, usuario_id: int = Depends(require_user)):
    """Ranking de causas mais frequentes de NC — Pareto (tarefa 271)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Group by classificacao (primary category) counting occurrences
        cur.execute("""
            SELECT
                COALESCE(classificacao, 'Não informada') as causa,
                COUNT(*) as total,
                ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) as percentual
            FROM public.beg_rq03
            GROUP BY classificacao
            ORDER BY total DESC
            LIMIT %s
        """, (limit,))
        rows = cur.fetchall()
        # Compute cumulative percentage (Pareto)
        acum = 0
        for r in rows:
            acum += float(r["percentual"] or 0)
            r["percentual_acum"] = round(acum, 1)
        return {"items": rows}
    finally:
        cur.close()
        conn.close()


@router.get("/analytics/tempo-fechamento", dependencies=[Depends(require_user)])
async def tempo_medio_fechamento(usuario_id: int = Depends(require_user)):
    """Indicador: tempo médio de fechamento de NC em dias (tarefa 272)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT
                ROUND(AVG(EXTRACT(EPOCH FROM (
                    COALESCE(dt_fechamento, dt_encerramento)::timestamp
                    - COALESCE(dt_abertura, dt_rnc)::timestamp
                )) / 86400), 1) AS media_dias,
                COUNT(*) FILTER (WHERE status IN ('FECHADA','F')) AS total_fechadas,
                COUNT(*) FILTER (WHERE status NOT IN ('FECHADA','F','CANCELADA','C')) AS total_abertas,
                MIN(EXTRACT(EPOCH FROM (
                    COALESCE(dt_fechamento, dt_encerramento)::timestamp
                    - COALESCE(dt_abertura, dt_rnc)::timestamp
                )) / 86400) FILTER (
                    WHERE status IN ('FECHADA','F')
                    AND COALESCE(dt_fechamento, dt_encerramento) IS NOT NULL
                ) AS min_dias,
                MAX(EXTRACT(EPOCH FROM (
                    COALESCE(dt_fechamento, dt_encerramento)::timestamp
                    - COALESCE(dt_abertura, dt_rnc)::timestamp
                )) / 86400) FILTER (
                    WHERE status IN ('FECHADA','F')
                    AND COALESCE(dt_fechamento, dt_encerramento) IS NOT NULL
                ) AS max_dias
            FROM public.beg_rq03
            WHERE COALESCE(dt_fechamento, dt_encerramento) IS NOT NULL
              AND COALESCE(dt_abertura, dt_rnc) IS NOT NULL
        """)
        stats = cur.fetchone()

        # Trend by month (last 6 months)
        cur.execute("""
            SELECT
                TO_CHAR(DATE_TRUNC('month', COALESCE(dt_fechamento, dt_encerramento)), 'YYYY-MM') as mes,
                COUNT(*) as fechadas,
                ROUND(AVG(EXTRACT(EPOCH FROM (
                    COALESCE(dt_fechamento, dt_encerramento)::timestamp
                    - COALESCE(dt_abertura, dt_rnc)::timestamp
                )) / 86400), 1) as media_dias_mes
            FROM public.beg_rq03
            WHERE status IN ('FECHADA','F')
              AND COALESCE(dt_fechamento, dt_encerramento) >= CURRENT_DATE - INTERVAL '6 months'
              AND COALESCE(dt_abertura, dt_rnc) IS NOT NULL
            GROUP BY 1
            ORDER BY 1
        """)
        trend = cur.fetchall()
        return {"stats": stats, "trend": trend}
    finally:
        cur.close()
        conn.close()


# --- Timeline unificada RQ03 (tarefa 298) ---
@router.get("/{id}/timeline", dependencies=[Depends(require_permission('RNCO'))])
async def timeline_rq03(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        eventos = []
        # Transições de status
        cur.execute("""
            SELECT 'transicao' AS tipo, t.created_at AS dt,
                   t.status_anterior, t.status_novo, t.motivo AS descricao,
                   u.name AS autor
            FROM public.hgr_rq03_reg_transicao t
            LEFT JOIN public.users u ON u.id=t.usuario_id
            WHERE t.beg_rq03_id=%s
        """, (id,))
        eventos += cur.fetchall()
        # Anotações
        cur.execute("""
            SELECT 'anotacao' AS tipo, a.created_at AS dt,
                   NULL AS status_anterior, NULL AS status_novo,
                   a.descricao, u.name AS autor
            FROM public.hgr_rq03_reg_ant a
            LEFT JOIN public.users u ON u.id=a.created_by
            WHERE a.beg_rq03_id=%s
        """, (id,))
        eventos += cur.fetchall()
        # Equipe
        cur.execute("""
            SELECT 'equipe' AS tipo, p.created_at AS dt,
                   NULL AS status_anterior, NULL AS status_novo,
                   u.name AS descricao, u.name AS autor
            FROM public.hgr_rq03_reg_part p
            LEFT JOIN public.users u ON u.id=p.usuario_id
            WHERE p.beg_rq03_id=%s
        """, (id,))
        eventos += cur.fetchall()
        eventos.sort(key=lambda x: str(x.get("dt") or ""))
        return {"eventos": eventos}
    finally:
        cur.close()
        conn.close()


# --- Rastreabilidade (tarefa 308) ---
@router.get("/{id}/rastreabilidade", dependencies=[Depends(require_permission('RNCO'))])
async def rastreabilidade_rq03(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT produto_lote, descricao_ocorrencia FROM public.beg_rq03 WHERE id=%s", (id,))
        base = cur.fetchone()
        similares = []
        if base and base.get("produto_lote"):
            cur.execute("""
                SELECT id, codigo, titulo, status, produto_lote, created_at
                FROM public.beg_rq03
                WHERE produto_lote = %s AND id <> %s
                ORDER BY created_at DESC LIMIT 20
            """, (base["produto_lote"], id))
            similares = cur.fetchall()
        return {"produto_lote": base.get("produto_lote") if base else None, "similares": similares}
    finally:
        cur.close()
        conn.close()
