# -*- coding: utf-8 -*-
"""
SIGS Functions — equivalentes Python das functions, procedures e packages PL/SQL do Oracle.

Pacotes replicados:
- PCK_STH_STM: FNC_RETURN_USUARIO, FNC_TP_USER, FNC_USER_ID/EMP/FIL/PROC
- PCK_STH_CAD: FNC_FIL_DESC, FNC_EMP_DESC, FNC_PROC_DESC, FNC_FIL_COLOR
- PCK_HGR_GAM: PRC_PROFILE, PRC_AVATAR
- PCK_STH_TAR: FNC_READ_ONLY_TAR
- PCK_STH_RNC: FNC_RNC_CALC
- PCK_HGR_PRJ: FNC_RETURN_TIT_PRJ, FNC_RETURN_COD_PRJ
- PCK_HGR_CHM: FNC_CHM_NUMERO, FNC_CHM_TITULO
- PCK_HGR_ASS: FNC_RETURN_COD_ATN, FNC_RETURN_TIT_ATN, FNC_RETURN_DESC_ATN,
                FNC_RETURN_TIPO_ATN, FNC_RETURN_CAT_ATN, FNC_RETURN_CLI_ATN,
                FNC_ATN_ACE_CFG_CAD_ATN, FNC_ATN_ACE_CFG_CAD_EMP_UND,
                FNC_ATN_ACE_CFG_CAD_USU, FNC_ATN_ACE_CFG_CAD_VW_ACE,
                FNC_ASS_USER_DEL_BTN, FNC_ASS_USER_DETACH_BTN,
                FNC_ASS_EMP_DEL_BTN, FNC_ASS_EMP_DETACH_BTN,
                FNC_ASS_FIL_DEL_BTN, FNC_ASS_FIL_DETACH_BTN

Standalone:
- FNC_SEMAFORO, FNC_SEMAFORO_COLOR, FNC_SEMAFORO_COR
- FNC_PROGRESS
- FNC_TAR_TMP, FNC_TAR_NUM
- FNC_PRJ_NUM
- FNC_DIAS_UTEIS
- FNC_CALC_XP
"""

from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from datetime import date, timedelta


# ============================================================
# PCK_STH_STM — System/Security (616+ references)
# ============================================================

def fnc_return_usuario(usuario_id: int) -> str:
    """PCK_STH_STM.FNC_RETURN_USUARIO — Returns formatted user display name."""
    if not usuario_id:
        return '—'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT name FROM public.users WHERE id = %s", (usuario_id,))
        row = cur.fetchone()
        return row["name"] if row else '—'
    except Exception:
        return '—'
    finally:
        cur.close()
        conn.close()


def fnc_tp_user(usuario_id: int) -> str:
    """PCK_STH_STM.FNC_TP_USER — Returns user type code (A/D/F/I/G/R/L/P)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT COALESCE(t.hgr_vlr_retorno, 'I') as tipo
            FROM public.users u
            LEFT JOIN public.hgr_stm_cad_tipo_usu t ON t.id = u.hgr_stm_cad_tipo_usu_id
            WHERE u.id = %s
        """, (usuario_id,))
        row = cur.fetchone()
        return row["tipo"] if row else 'I'
    except Exception:
        return 'I'
    finally:
        cur.close()
        conn.close()


def fnc_user_context(usuario_id: int) -> dict:
    """Returns user_id, empresa_id, filial_id, processo_id for current user."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT id, sth_cad_empresa_id, sth_cad_filial_id, beg_processo_id
            FROM public.users WHERE id = %s
        """, (usuario_id,))
        return cur.fetchone() or {}
    except Exception:
        return {}
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_STH_CAD — Master Data (240+ references)
# ============================================================

def fnc_fil_desc(filial_id: int) -> str:
    """PCK_STH_CAD.FNC_FIL_DESC — Returns branch description."""
    if not filial_id:
        return '—'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT descricao FROM public.sth_cad_filial WHERE id = %s", (filial_id,))
        row = cur.fetchone()
        return row["descricao"] if row else '—'
    except Exception:
        return '—'
    finally:
        cur.close()
        conn.close()


def fnc_emp_desc(empresa_id: int) -> str:
    """PCK_STH_CAD.FNC_EMP_DESC — Returns company description."""
    if not empresa_id:
        return '—'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT descricao FROM public.sth_cad_empresa WHERE id = %s", (empresa_id,))
        row = cur.fetchone()
        return row["descricao"] if row else '—'
    except Exception:
        return '—'
    finally:
        cur.close()
        conn.close()


def fnc_proc_desc(processo_id: int) -> str:
    """PCK_STH_CAD.FNC_PROC_DESC — Returns process description."""
    if not processo_id:
        return '—'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT nome FROM public.beg_processo WHERE id = %s", (processo_id,))
        row = cur.fetchone()
        return row["nome"] if row else '—'
    except Exception:
        return '—'
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_HGR_GAM — Gamification display (156 references)
# ============================================================

def prc_avatar(usuario_id: int) -> dict:
    """PCK_HGR_GAM.PRC_AVATAR — Returns avatar data for user."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, name, email FROM public.users WHERE id = %s", (usuario_id,))
        row = cur.fetchone()
        if not row:
            return {"initials": "?", "name": "—", "color": "#6b7280"}
        name = row["name"] or "?"
        initials = name[0].upper() if name else "?"
        # Gerar cor consistente baseada no ID
        colors = ["#00A0DF", "#4caf50", "#ff9800", "#ef4444", "#9c27b0", "#3f51b5", "#009688", "#795548"]
        color = colors[usuario_id % len(colors)]
        return {"initials": initials, "name": name, "email": row.get("email"), "color": color}
    except Exception:
        return {"initials": "?", "name": "—", "color": "#6b7280"}
    finally:
        cur.close()
        conn.close()


def prc_profile(usuario_id: int) -> dict:
    """PCK_HGR_GAM.PRC_PROFILE — Returns full profile data."""
    avatar = prc_avatar(usuario_id)
    avatar["user_id"] = usuario_id
    avatar["xp"] = fnc_calc_xp(usuario_id)
    return avatar


# ============================================================
# Semáforo / KPI (standalone functions)
# ============================================================

def fnc_semaforo(meta_id: int) -> str:
    """FNC_SEMAFORO — Returns traffic light indicator for a KPI goal."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT m.meta_valor, m.meta_minima, rm.valor_realizado
            FROM public.hgr_ges_cad_meta m
            LEFT JOIN LATERAL (
                SELECT valor_realizado FROM public.hgr_ges_reg_meta
                WHERE hgr_ges_cad_meta_id = m.id ORDER BY periodo DESC LIMIT 1
            ) rm ON true
            WHERE m.id = %s
        """, (meta_id,))
        row = cur.fetchone()
        if not row or row["valor_realizado"] is None:
            return "sem_dados"
        realizado = float(row["valor_realizado"])
        meta = float(row["meta_valor"] or 0)
        minima = float(row["meta_minima"] or 0)
        if realizado >= meta:
            return "verde"
        elif realizado >= minima:
            return "amarelo"
        else:
            return "vermelho"
    except Exception:
        return "sem_dados"
    finally:
        cur.close()
        conn.close()


def fnc_semaforo_color(meta_id: int) -> str:
    """FNC_SEMAFORO_COLOR — Returns CSS color for semaphore."""
    COLORS = {"verde": "#4caf50", "amarelo": "#ff9800", "vermelho": "#ef4444", "sem_dados": "#6b7280"}
    return COLORS.get(fnc_semaforo(meta_id), "#6b7280")


def fnc_progress(valor: float) -> dict:
    """FNC_PROGRESS — Returns progress bar data for a percentage value."""
    valor = max(0, min(100, valor or 0))
    if valor >= 100:
        color = "#4caf50"
    elif valor >= 75:
        color = "#00A0DF"
    elif valor >= 50:
        color = "#ff9800"
    else:
        color = "#ef4444"
    return {"percent": round(valor, 1), "color": color}


# ============================================================
# Task functions (standalone)
# ============================================================

def fnc_tar_num(etapa_id: int = None, projeto_id: int = None, search: str = None) -> int:
    """FNC_TAR_NUM — Returns task count for a project stage."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = "SELECT COUNT(*) as cnt FROM public.hgr_tar_cad_tarefa WHERE 1=1"
        params = []
        if etapa_id:
            query += " AND hgr_tar_cad_etp_kbn_id = %s"
            params.append(etapa_id)
        if projeto_id:
            query += " AND id IN (SELECT hgr_tar_cad_tarefa_id FROM public.hgr_prj_reg_tar WHERE hgr_prj_cad_projeto_id = %s)"
            params.append(projeto_id)
        if search:
            query += " AND titulo ILIKE %s"
            params.append(f"%{search}%")
        cur.execute(query, params)
        return cur.fetchone()["cnt"]
    except Exception:
        return 0
    finally:
        cur.close()
        conn.close()


def fnc_tar_tmp(etapa_id: int = None, projeto_id: int = None) -> int:
    """FNC_TAR_TMP — Returns total task time (minutes) for a project stage."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT COALESCE(SUM(a.tempo_minutos), 0) as total
            FROM public.hgr_tar_reg_apontamento a
            JOIN public.hgr_tar_cad_tarefa t ON t.id = a.hgr_tar_cad_tarefa_id
            WHERE a.tempo_minutos IS NOT NULL
        """
        params = []
        if etapa_id:
            query += " AND t.hgr_tar_cad_etp_kbn_id = %s"
            params.append(etapa_id)
        if projeto_id:
            query += " AND t.id IN (SELECT hgr_tar_cad_tarefa_id FROM public.hgr_prj_reg_tar WHERE hgr_prj_cad_projeto_id = %s)"
            params.append(projeto_id)
        cur.execute(query, params)
        return cur.fetchone()["total"]
    except Exception:
        return 0
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_STH_TAR — Task read-only control (38 references)
# ============================================================

def fnc_read_only_tar(tarefa_id: int) -> bool:
    """PCK_STH_TAR.FNC_READ_ONLY_TAR — Returns True if task is read-only."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT status FROM public.hgr_tar_cad_tarefa WHERE id = %s", (tarefa_id,))
        row = cur.fetchone()
        if not row:
            return True
        return row["status"] in ('CONCLUIDA', 'CANCELADA')
    except Exception:
        return True
    finally:
        cur.close()
        conn.close()


# ============================================================
# BEG_PCK_APEX — Read-only controls (65 references)
# ============================================================

def fnc_read_only_rq03(rq03_id: int) -> bool:
    """BEG_PCK_APEX.FNC_READ_ONLY_RNC — Returns True if RQ03 is read-only."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT status FROM public.beg_rq03 WHERE id = %s", (rq03_id,))
        row = cur.fetchone()
        if not row:
            return True
        return row["status"] in ('FECHADA', 'CANCELADA')
    except Exception:
        return True
    finally:
        cur.close()
        conn.close()


def fnc_read_only_rq49(rq49_id: int) -> bool:
    """BEG_PCK_APEX.FNC_READ_ONLY_NO — Returns True if RQ49 is read-only."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT status FROM public.beg_rq49 WHERE id = %s", (rq49_id,))
        row = cur.fetchone()
        if not row:
            return True
        return row["status"] in ('FECHADA', 'CANCELADA')
    except Exception:
        return True
    finally:
        cur.close()
        conn.close()


# ============================================================
# Utility functions (standalone)
# ============================================================

def fnc_dias_uteis(dt_inicial: date, dt_final: date) -> int:
    """FNC_DIAS_UTEIS — Calculates business days between two dates."""
    if not dt_inicial or not dt_final:
        return 0
    count = 0
    current = dt_inicial
    while current <= dt_final:
        if current.weekday() < 5:  # Monday=0, Friday=4
            count += 1
        current += timedelta(days=1)
    return count


def fnc_calc_xp(usuario_id: int, dt_inicio: date = None, dt_fim: date = None) -> int:
    """FNC_CALC_XP — Calculates user XP for a date range."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = "SELECT COALESCE(SUM(pontos), 0) as total FROM public.hgr_gam_reg_xp WHERE usuario_id = %s"
        params = [usuario_id]
        if dt_inicio:
            query += " AND created_at >= %s"
            params.append(dt_inicio)
        if dt_fim:
            query += " AND created_at <= %s"
            params.append(dt_fim)
        cur.execute(query, params)
        return cur.fetchone()["total"]
    except Exception:
        return 0
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_HGR_PRJ — Project helpers (8 references)
# ============================================================

def fnc_return_tit_prj(projeto_id: int) -> str:
    """PCK_HGR_PRJ.FNC_RETURN_TIT_PRJ — Returns project title."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT titulo FROM public.hgr_prj_cad_projeto WHERE id = %s", (projeto_id,))
        row = cur.fetchone()
        return row["titulo"] if row else '—'
    except Exception:
        return '—'
    finally:
        cur.close()
        conn.close()


def fnc_return_cod_prj(projeto_id: int) -> str:
    """PCK_HGR_PRJ.FNC_RETURN_COD_PRJ — Returns project code."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT codigo FROM public.hgr_prj_cad_projeto WHERE id = %s", (projeto_id,))
        row = cur.fetchone()
        return row["codigo"] if row else '—'
    except Exception:
        return '—'
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_HGR_CHM — Chamado helpers (13 references)
# ============================================================

def fnc_chm_numero(chamado_id: int) -> str:
    """PCK_HGR_CHM.FNC_CHM_NUMERO — Returns ticket formatted number."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT codigo FROM public.hgr_chm_cad_chm WHERE id = %s", (chamado_id,))
        row = cur.fetchone()
        return row["codigo"] if row and row["codigo"] else f"CHM-{chamado_id}"
    except Exception:
        return f"CHM-{chamado_id}"
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_HGR_ASS — Assistance helpers
# ============================================================

ADMIN_TYPES = ('A', 'D', 'G')


def _check_ace_cfg(user_id: int, tp_user: str, codigo: str) -> str:
    if tp_user in ADMIN_TYPES:
        return 'S'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_ace_cfg_reg_usu ru
            JOIN public.hgr_ass_cad_ace_cfg ac ON ac.id = ru.hgr_ass_cad_ace_cfg_id
            WHERE ru.beg_usuarios_id = %s AND ac.codigo = %s AND ac.ativo = 'S'
            LIMIT 1
        """, (user_id, codigo))
        return 'S' if cur.fetchone() else 'N'
    except Exception:
        return 'N'
    finally:
        cur.close()
        conn.close()


def fnc_atn_ace_cfg_cad_atn(user_id: int, tp_user: str) -> str:
    return _check_ace_cfg(user_id, tp_user, 'CAD_ATN')


def fnc_atn_ace_cfg_cad_emp_und(user_id: int, tp_user: str) -> str:
    return _check_ace_cfg(user_id, tp_user, 'CFG_CAD_EMP_UND')


def fnc_atn_ace_cfg_cad_usu(user_id: int, tp_user: str) -> str:
    return _check_ace_cfg(user_id, tp_user, 'CFG_CAD_USU')


def fnc_atn_ace_cfg_cad_vw_ace(user_id: int, tp_user: str) -> str:
    return _check_ace_cfg(user_id, tp_user, 'CFG_CAD_VW_ACE')


def fnc_ass_permissions(user_id: int) -> dict:
    tp_user = fnc_tp_user(user_id)
    return {
        "f_ass_cad_atn": fnc_atn_ace_cfg_cad_atn(user_id, tp_user),
        "f_ass_cfg_cad_emp_und": fnc_atn_ace_cfg_cad_emp_und(user_id, tp_user),
        "f_ass_cfg_cad_usu": fnc_atn_ace_cfg_cad_usu(user_id, tp_user),
        "f_ass_cfg_cad_vw_ace": fnc_atn_ace_cfg_cad_vw_ace(user_id, tp_user),
        "tp_user": tp_user,
    }


def fnc_return_cod_atn(atendimento_id: int) -> str:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT codigo FROM public.hgr_ass_cad_atn WHERE id = %s", (atendimento_id,))
        row = cur.fetchone()
        return row["codigo"] if row and row["codigo"] else f"ATN-{atendimento_id}"
    except Exception:
        return f"ATN-{atendimento_id}"
    finally:
        cur.close()
        conn.close()


def fnc_return_tit_atn(atendimento_id: int) -> str:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT titulo FROM public.hgr_ass_cad_atn WHERE id = %s", (atendimento_id,))
        row = cur.fetchone()
        return row["titulo"] if row and row["titulo"] else ""
    except Exception:
        return ""
    finally:
        cur.close()
        conn.close()


def fnc_return_desc_atn(atendimento_id: int) -> str:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT descricao FROM public.hgr_ass_cad_atn WHERE id = %s", (atendimento_id,))
        row = cur.fetchone()
        return row["descricao"] if row and row["descricao"] else ""
    except Exception:
        return ""
    finally:
        cur.close()
        conn.close()


def fnc_return_tipo_atn(atendimento_id: int) -> str:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.descricao FROM public.hgr_ass_cad_atn a
            JOIN public.hgr_ass_cad_tp_atn t ON t.id = a.hgr_ass_cad_tp_atn_id
            WHERE a.id = %s
        """, (atendimento_id,))
        row = cur.fetchone()
        return row["descricao"] if row and row["descricao"] else ""
    except Exception:
        return ""
    finally:
        cur.close()
        conn.close()


def fnc_return_cat_atn(atendimento_id: int) -> str:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.categoria FROM public.hgr_ass_cad_atn a
            JOIN public.hgr_ass_cad_tp_atn t ON t.id = a.hgr_ass_cad_tp_atn_id
            WHERE a.id = %s
        """, (atendimento_id,))
        row = cur.fetchone()
        return row["categoria"] if row and row["categoria"] else ""
    except Exception:
        return ""
    finally:
        cur.close()
        conn.close()


def fnc_return_cli_atn(atendimento_id: int) -> str:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT cliente FROM public.hgr_ass_cad_atn WHERE id = %s", (atendimento_id,))
        row = cur.fetchone()
        return row["cliente"] if row and row["cliente"] else ""
    except Exception:
        return ""
    finally:
        cur.close()
        conn.close()


def fnc_ass_user_del_btn(beg_usuarios_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_ace_cfg_reg_usu
            WHERE beg_usuarios_id = %s LIMIT 1
        """, (beg_usuarios_id,))
        return cur.fetchone() is None
    except Exception:
        return False
    finally:
        cur.close()
        conn.close()


def fnc_ass_user_detach_btn(beg_usuarios_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_ace_cfg_reg_usu
            WHERE beg_usuarios_id = %s LIMIT 1
        """, (beg_usuarios_id,))
        return cur.fetchone() is not None
    except Exception:
        return False
    finally:
        cur.close()
        conn.close()


def fnc_ass_emp_del_btn(sth_cad_empresa_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_cad_atn
            WHERE sth_cad_empresa_id = %s LIMIT 1
        """, (sth_cad_empresa_id,))
        return cur.fetchone() is None
    except Exception:
        return False
    finally:
        cur.close()
        conn.close()


def fnc_ass_emp_detach_btn(sth_cad_empresa_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_cad_atn
            WHERE sth_cad_empresa_id = %s LIMIT 1
        """, (sth_cad_empresa_id,))
        return cur.fetchone() is not None
    except Exception:
        return False
    finally:
        cur.close()
        conn.close()


def fnc_ass_fil_del_btn(sth_cad_filial_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_cad_atn
            WHERE sth_cad_filial_id = %s LIMIT 1
        """, (sth_cad_filial_id,))
        return cur.fetchone() is None
    except Exception:
        return False
    finally:
        cur.close()
        conn.close()


def fnc_ass_fil_detach_btn(sth_cad_filial_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM public.hgr_ass_cad_atn
            WHERE sth_cad_filial_id = %s LIMIT 1
        """, (sth_cad_filial_id,))
        return cur.fetchone() is not None
    except Exception:
        return False
    finally:
        cur.close()
        conn.close()


# ============================================================
# PCK_HGR_MAIL — Email (structure only, sending requires SMTP config)
# ============================================================

def prc_send_mail(usuario_id: int, assunto: str, corpo_html: str):
    """
    PCK_HGR_MAIL.PRC_SEND_MAIL — Sends email notification to a user.
    TODO: Integrate with actual SMTP (smtp.higra.com.br or similar).
    For now, logs the email intent.
    """
    from backend.core.config import logger
    email = None
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT email FROM public.users WHERE id = %s", (usuario_id,))
        row = cur.fetchone()
        email = row["email"] if row else None
    except Exception:
        pass
    finally:
        cur.close()
        conn.close()

    if email:
        logger.info(f"[EMAIL] To: {email} | Subject: {assunto} | Body length: {len(corpo_html)}")
        # TODO: Implementar envio real via SMTP
        # import smtplib
        # from email.mime.text import MIMEText
        # msg = MIMEText(corpo_html, 'html')
        # msg['Subject'] = assunto
        # msg['From'] = 'noreply@higra.com.br'
        # msg['To'] = email
        # with smtplib.SMTP('smtp.higra.com.br', 587) as server:
        #     server.starttls()
        #     server.login('user', 'pass')
        #     server.send_message(msg)
    return {"sent": False, "email": email, "assunto": assunto, "reason": "SMTP not configured"}
