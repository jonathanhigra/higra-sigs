# -*- coding: utf-8 -*-
"""
Gamificação / XP — equivalente ao PCK_HGR_GAM do Oracle.
Registra pontos XP por ações do usuário.

APEX XP awards:
- Criar reunião: 500 XP (pg 25 process game_create_reuniao)
- Entregar tarefa: 250 XP (pg 204 process entrega_tarefa)
- Criar projeto: 300 XP
- Registrar apontamento: 50 XP
"""

from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection, ensure_table_columns
from backend.core.config import logger


def create_gamificacao_tables():
    """Cria tabela de XP se não existir."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_gam_reg_xp (
                id BIGSERIAL PRIMARY KEY,
                usuario_id BIGINT NOT NULL,
                pontos INTEGER NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                descricao TEXT,
                referencia_tipo VARCHAR(30),
                referencia_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gam_xp_usuario ON public.hgr_gam_reg_xp(usuario_id);")
        conn.commit()
        logger.info("Tabela de gamificação verificada/criada.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabela gamificação: {e}")
    finally:
        cur.close()
        conn.close()


# XP awards por ação (APEX PCK_HGR_GAM constants)
XP_AWARDS = {
    'CRIAR_REUNIAO': 500,
    'ENTREGAR_TAREFA': 250,
    'CRIAR_PROJETO': 300,
    'CRIAR_RQ03': 200,
    'CRIAR_RQ49': 200,
    'REGISTRAR_APONTAMENTO': 50,
    'CRIAR_PLANO_ACAO': 100,
    'CONCLUIR_PLANO_ACAO': 150,
}


def award_xp(usuario_id: int, tipo: str, descricao: str = None,
             referencia_tipo: str = None, referencia_id: int = None):
    """
    Registra XP para o usuário. Equivalente a PCK_HGR_GAM.prc_win_lose_xp.
    """
    pontos = XP_AWARDS.get(tipo, 0)
    if pontos <= 0:
        return

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_gam_reg_xp
                (usuario_id, pontos, tipo, descricao, referencia_tipo, referencia_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (usuario_id, pontos, tipo, descricao or f"+{pontos} XP: {tipo}",
              referencia_tipo, referencia_id))
        conn.commit()
        logger.info(f"[XP] User {usuario_id}: +{pontos} ({tipo})")
        return cur.fetchone()
    except Exception as e:
        conn.rollback()
        logger.warning(f"Erro ao registrar XP: {e}")
    finally:
        cur.close()
        conn.close()


def get_ranking(limit: int = 20):
    """Retorna ranking de XP. APEX pg 21 — Ranking."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT u.id, u.name, u.email,
                   COALESCE(SUM(x.pontos), 0) as total_xp,
                   COUNT(x.id) as total_acoes
            FROM public.users u
            LEFT JOIN public.hgr_gam_reg_xp x ON x.usuario_id = u.id
            GROUP BY u.id, u.name, u.email
            HAVING COALESCE(SUM(x.pontos), 0) > 0
            ORDER BY total_xp DESC
            LIMIT %s
        """, (limit,))
        return cur.fetchall()
    except Exception:
        return []
    finally:
        cur.close()
        conn.close()


def get_user_xp(usuario_id: int):
    """Retorna XP total e histórico do usuário."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COALESCE(SUM(pontos), 0) as total_xp FROM public.hgr_gam_reg_xp WHERE usuario_id = %s", (usuario_id,))
        total = cur.fetchone()
        cur.execute("""
            SELECT * FROM public.hgr_gam_reg_xp
            WHERE usuario_id = %s ORDER BY created_at DESC LIMIT 50
        """, (usuario_id,))
        historico = cur.fetchall()
        return {"total_xp": total["total_xp"], "historico": historico}
    except Exception:
        return {"total_xp": 0, "historico": []}
    finally:
        cur.close()
        conn.close()
