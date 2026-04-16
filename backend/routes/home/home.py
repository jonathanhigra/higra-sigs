# -*- coding: utf-8 -*-
"""Página inicial — widgets de resumo para o usuário logado."""

from fastapi import APIRouter, Depends
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import get_user_permissions, get_user_scope, build_scope_filter

router = APIRouter()


@router.get("/dashboard")
async def home_dashboard(usuario_id: int = Depends(require_user)):
    """Retorna dados para a página inicial: tarefas pendentes, resumo, permissões."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        result = {}

        # Escopo do usuário
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 't',
            filial_col='COALESCE(t.sth_cad_filial_id, t.hgr_cad_filial_id)')

        # Tarefas pendentes do usuário (filtradas por filial)
        try:
            q = """
                SELECT t.id, t.titulo, t.prioridade,
                       CASE COALESCE(t.status, t.hgr_tar_status)
                           WHEN 'A' THEN 'ABERTA' WHEN 'C' THEN 'CONCLUIDA'
                           WHEN 'E' THEN 'EM_ESPERA' WHEN 'X' THEN 'CANCELADA'
                           ELSE COALESCE(t.status, t.hgr_tar_status, 'ABERTA')
                       END as status,
                       COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as dt_previsao,
                       t.percentual
                FROM public.hgr_tar_cad_tarefa t
                WHERE COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s
                  AND COALESCE(t.status, t.hgr_tar_status) NOT IN ('CONCLUIDA', 'CANCELADA', 'C', 'X')
            """
            p = [usuario_id]
            q += scope_sql
            p.extend(scope_params)
            q += """ ORDER BY
                    CASE t.prioridade WHEN 'URGENTE' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END,
                    COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) ASC NULLS LAST
                LIMIT 10"""
            cur.execute(q, p)
            result["tarefas_pendentes"] = cur.fetchall()
        except Exception:
            result["tarefas_pendentes"] = []

        # Contadores (filtrados por filial)
        try:
            q2 = """
                SELECT
                    COUNT(*) FILTER (WHERE COALESCE(t.status, t.hgr_tar_status) NOT IN ('CONCLUIDA', 'CANCELADA', 'C', 'X')) as abertas,
                    COUNT(*) FILTER (WHERE COALESCE(t.status, t.hgr_tar_status) IN ('CONCLUIDA', 'C')) as concluidas,
                    COUNT(*) FILTER (WHERE COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) < CURRENT_DATE
                                     AND COALESCE(t.status, t.hgr_tar_status) NOT IN ('CONCLUIDA', 'CANCELADA', 'C', 'X')) as atrasadas
                FROM public.hgr_tar_cad_tarefa t
                WHERE COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s
            """
            p2 = [usuario_id]
            q2 += scope_sql
            p2.extend(scope_params)
            cur.execute(q2, p2)
            result["contadores"] = cur.fetchone()
        except Exception:
            result["contadores"] = {"abertas": 0, "concluidas": 0, "atrasadas": 0}

        # Projetos ativos
        try:
            q3 = """SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE p.status IN ('A','ABERTO','EM_ANDAMENTO','E')) as ativos,
                COUNT(*) FILTER (WHERE p.dt_prev_termino < CURRENT_DATE AND p.status NOT IN ('F','FINALIZADO','C','CANCELADO')) as atrasados
                FROM public.hgr_prj_cad_projeto p WHERE 1=1"""
            p3 = []
            q3 += scope_sql.replace('t.', 'p.').replace('hgr_cad_filial_id', 'COALESCE(p.sth_cad_filial_id, p.hgr_cad_filial_id)')
            p3.extend(scope_params)
            cur.execute(q3, p3)
            result["projetos"] = cur.fetchone()
        except Exception:
            result["projetos"] = {"total": 0, "ativos": 0, "atrasados": 0}

        # RQ03 abertas
        try:
            q4 = "SELECT COUNT(*) FILTER (WHERE r.status IN ('A','ABERTA')) as abertas FROM public.beg_rq03 r WHERE 1=1"
            p4 = []
            q4 += scope_sql.replace('t.', 'r.')
            p4.extend(scope_params)
            cur.execute(q4, p4)
            result["rq03"] = cur.fetchone()
        except Exception:
            result["rq03"] = {"abertas": 0}

        # Reuniões próximas (7 dias)
        try:
            q5 = """SELECT COUNT(*) as proximas FROM public.sth_reu_agenda a
                WHERE COALESCE(a.dt_agenda, a.dt_hr_inicio::date) BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
                AND COALESCE(a.status, CASE WHEN a.ind_cancelada='S' THEN 'CANCELADA' ELSE 'AGENDADA' END) != 'CANCELADA'"""
            p5 = []
            q5_scope = scope_sql.replace('t.', 'a.')
            q5 += q5_scope
            p5.extend(scope_params)
            cur.execute(q5, p5)
            result["reunioes"] = cur.fetchone()
        except Exception:
            result["reunioes"] = {"proximas": 0}

        # Kanban de tarefas por status (para SigsHeader)
        try:
            kanban_cols = [
                ('ABERTA', 'A Fazer', '#3b82f6'),
                ('EM_ANDAMENTO', 'Em Andamento', '#f59e0b'),
                ('EM_ESPERA', 'Em Espera', '#8b5cf6'),
                ('CONCLUIDA', 'Concluido', '#22c55e'),
            ]
            kanban = []
            for status_key, label, color in kanban_cols:
                oracle_keys = {'ABERTA': "'A','ABERTA'", 'EM_ANDAMENTO': "'EM_ANDAMENTO'", 'EM_ESPERA': "'E','EM_ESPERA'", 'CONCLUIDA': "'C','CONCLUIDA'"}
                qk = f"""SELECT t.id, t.titulo,
                    COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as dt_previsao,
                    t.prioridade, u.name as responsavel_nome
                    FROM public.hgr_tar_cad_tarefa t
                    LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
                    WHERE COALESCE(t.status, t.hgr_tar_status) IN ({oracle_keys[status_key]})
                    AND COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s"""
                pk = [usuario_id]
                qk += scope_sql
                pk.extend(scope_params)
                qk += " ORDER BY COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) ASC NULLS LAST LIMIT 20"
                cur.execute(qk, pk)
                items = cur.fetchall()
                kanban.append({'key': status_key, 'label': label, 'color': color, 'items': items, 'count': len(items)})
            result["kanban"] = kanban
        except Exception:
            result["kanban"] = []

        # Permissões (para o menu de acesso rápido)
        result["permissoes"] = get_user_permissions(usuario_id)

        return result
    finally:
        cur.close()
        conn.close()


# ============================================================
# 689 — Metas atingidas + 690 — Ultimos comunicados
# ============================================================
@router.get("/widgets")
async def home_widgets(usuario_id: int = Depends(require_user)):
    """686-690 — Widgets configuráveis para a home."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        widgets = {}

        # 686 — Proximas reunioes (7 dias)
        try:
            cur.execute("""SELECT a.id, a.descricao, COALESCE(a.dt_agenda, a.dt_hr_inicio::date) as dt,
                           a.local FROM public.sth_reu_agenda a
                WHERE COALESCE(a.dt_agenda, a.dt_hr_inicio::date) BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
                AND COALESCE(a.status, CASE WHEN a.ind_cancelada='S' THEN 'CANCELADA' ELSE 'AGENDADA' END) NOT IN ('CANCELADA','ENCERRADA')
                ORDER BY COALESCE(a.dt_agenda, a.dt_hr_inicio::date) ASC LIMIT 5""")
            widgets["proximas_reunioes"] = cur.fetchall()
        except Exception:
            widgets["proximas_reunioes"] = []

        # 687 — Tarefas do dia (vencem hoje ou atrasadas)
        try:
            cur.execute("""SELECT t.id, t.titulo, COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as dt_previsao,
                           t.prioridade
                FROM public.hgr_tar_cad_tarefa t
                WHERE COALESCE(t.responsavel_id, t.hgr_usuario_id) = %s
                AND COALESCE(t.status, t.hgr_tar_status) NOT IN ('C','CONCLUIDA','CANCELADA')
                AND COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) <= CURRENT_DATE
                ORDER BY COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) ASC LIMIT 10""", (usuario_id,))
            widgets["tarefas_dia"] = cur.fetchall()
        except Exception:
            widgets["tarefas_dia"] = []

        # 689 — Metas do trimestre
        try:
            cur.execute("""SELECT m.id, m.descricao, m.vlr_meta, m.vlr_atual,
                           CASE WHEN m.vlr_meta > 0 THEN ROUND((m.vlr_atual/m.vlr_meta*100)::numeric,1) ELSE 0 END as pct
                FROM public.hgr_ges_cad_meta m WHERE m.ativo='S'
                ORDER BY pct DESC LIMIT 5""")
            widgets["metas_trimestre"] = cur.fetchall()
        except Exception:
            widgets["metas_trimestre"] = []

        # 690 — Ultimos comunicados
        try:
            cur.execute("""SELECT e.id, e.titulo, COALESCE(e.created_at, e.created) as created_at
                FROM public.hgr_com_cad_inf e WHERE e.ativo='S'
                ORDER BY COALESCE(e.created_at, e.created) DESC LIMIT 5""")
            widgets["ultimos_comunicados"] = cur.fetchall()
        except Exception:
            try:
                cur.execute("""SELECT e.id, e.titulo, e.created_at
                    FROM public.hgr_com_cad_evento e WHERE e.status != 'INATIVO'
                    ORDER BY e.created_at DESC LIMIT 5""")
                widgets["ultimos_comunicados"] = cur.fetchall()
            except Exception:
                widgets["ultimos_comunicados"] = []

        # 688 — RQ03 sob responsabilidade
        try:
            cur.execute("""SELECT r.id, r.descricao, r.status FROM public.beg_rq03 r
                WHERE COALESCE(r.responsavel_id, r.beg_usuarios_id) = %s
                AND r.status IN ('A','ABERTA','EM_ANALISE') LIMIT 5""", (usuario_id,))
            widgets["rq03_pendentes"] = cur.fetchall()
        except Exception:
            widgets["rq03_pendentes"] = []

        return widgets
    finally:
        cur.close()
        conn.close()


# ============================================================
# 627 — /api/notificacoes/unread-count
# 692 — Centro de Notificacoes
# ============================================================
@router.get("/notificacoes")
async def listar_notificacoes(
    page: int = 1,
    per_page: int = 20,
    somente_nao_lidas: bool = False,
    usuario_id: int = Depends(require_user)
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_sgs_cad_notificacao (
            id BIGSERIAL PRIMARY KEY,
            usuario_id BIGINT NOT NULL,
            titulo VARCHAR(300) NOT NULL,
            mensagem TEXT,
            modulo VARCHAR(50),
            link VARCHAR(500),
            lida VARCHAR(1) DEFAULT 'N',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        conn.commit()
        offset = (page - 1) * per_page
        conds = ["n.usuario_id = %s"]
        params = [usuario_id]
        if somente_nao_lidas:
            conds.append("n.lida = 'N'")
        where = " AND ".join(conds)
        cur.execute(f"SELECT COUNT(*) as total FROM public.hgr_sgs_cad_notificacao n WHERE {where}", params)
        total = cur.fetchone()["total"]
        cur.execute(f"SELECT * FROM public.hgr_sgs_cad_notificacao n WHERE {where} ORDER BY n.created_at DESC LIMIT %s OFFSET %s",
                    params + [per_page, offset])
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/notificacoes/unread-count")
async def unread_count(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT COUNT(*) as total FROM public.hgr_sgs_cad_notificacao
            WHERE usuario_id = %s AND lida = 'N'""", (usuario_id,))
        result = cur.fetchone()
        return {"unread": int(result["total"])}
    except Exception:
        return {"unread": 0}
    finally:
        cur.close()
        conn.close()


@router.patch("/notificacoes/{notif_id}/ler")
async def marcar_como_lida(notif_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_sgs_cad_notificacao SET lida='S' WHERE id=%s AND usuario_id=%s",
                    (notif_id, usuario_id))
        conn.commit()
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.patch("/notificacoes/ler-todas")
async def marcar_todas_como_lidas(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.hgr_sgs_cad_notificacao SET lida='S' WHERE usuario_id=%s AND lida='N'",
                    (usuario_id,))
        conn.commit()
        return {"ok": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
