# -*- coding: utf-8 -*-
"""
Notificações SIGS — gera notificações para eventos dos módulos.
Usa a tabela social_notifications com type prefixado 'sigs_'.
"""

import json
from datetime import datetime
from backend.database import get_db_connection
from backend.core.config import logger


def notify_sigs(user_id: int, tipo: str, mensagem: str, link: str = None, actor_id: int = None):
    """
    Cria uma notificação SIGS para um usuário.
    tipo: tarefa_atribuida, tarefa_vencendo, tarefa_entregue, projeto_participante,
          plano_atribuido, plano_vencido, rnc_aberta, no_aberta, reuniao_agendada,
          doc_compartilhado, doc_revisao, comunicado_novo, lab_agendado, fab_etapa
    """
    if not user_id:
        return
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        metadata = json.dumps({"message": mensagem, "link": link, "sigs_type": tipo})
        cur.execute("""
            INSERT INTO social_notifications (user_id, actor_id, type, metadata, created_at)
            VALUES (%s, %s, 'sigs', %s, %s)
        """, (user_id, actor_id, metadata, datetime.utcnow()))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.warning(f"Erro ao criar notificacao SIGS: {e}")
    finally:
        cur.close()
        conn.close()


def notify_sigs_multi(user_ids: list, tipo: str, mensagem: str, link: str = None, actor_id: int = None):
    """Notifica múltiplos usuários."""
    for uid in set(user_ids):
        if uid and uid != actor_id:
            notify_sigs(uid, tipo, mensagem, link, actor_id)


# ============================================================
# Helpers por módulo
# ============================================================

def notify_tarefa_atribuida(tarefa_id: int, tarefa_titulo: str, responsavel_id: int, actor_id: int = None):
    notify_sigs(responsavel_id, 'tarefa_atribuida',
                f'Tarefa atribuida a voce: {tarefa_titulo[:80]}',
                f'/tarefas/{tarefa_id}', actor_id)


def notify_tarefa_entregue(tarefa_id: int, tarefa_titulo: str, criador_id: int, actor_id: int = None):
    notify_sigs(criador_id, 'tarefa_entregue',
                f'Tarefa entregue: {tarefa_titulo[:80]}',
                f'/tarefas/{tarefa_id}', actor_id)


def notify_projeto_participante(projeto_id: int, projeto_titulo: str, user_id: int, actor_id: int = None):
    notify_sigs(user_id, 'projeto_participante',
                f'Voce foi adicionado ao projeto: {projeto_titulo[:80]}',
                f'/projetos/{projeto_id}', actor_id)


def notify_plano_atribuido(plano_id: int, plano_titulo: str, responsavel_id: int, actor_id: int = None):
    notify_sigs(responsavel_id, 'plano_atribuido',
                f'Plano de acao atribuido: {plano_titulo[:80]}',
                f'/planos-acao/{plano_id}', actor_id)


def notify_plano_implementado(plano_id: int, plano_titulo: str, user_ids: list, actor_id: int = None):
    notify_sigs_multi(user_ids, 'plano_implementado',
                      f'Plano implementado: {plano_titulo[:80]}',
                      f'/planos-acao/{plano_id}', actor_id)


def notify_rnc_aberta(rnc_id: int, codigo: str, responsavel_id: int, actor_id: int = None):
    notify_sigs(responsavel_id, 'rnc_aberta',
                f'Nova nao conformidade #{codigo} atribuida a voce',
                f'/qualidade/rq03/{rnc_id}', actor_id)


def notify_no_aberta(no_id: int, codigo: str, responsavel_id: int, actor_id: int = None):
    notify_sigs(responsavel_id, 'no_aberta',
                f'Nova nota de oportunidade #{codigo}',
                f'/qualidade/rq49/{no_id}', actor_id)


def notify_reuniao_agendada(agenda_id: int, titulo: str, participante_ids: list, actor_id: int = None):
    notify_sigs_multi(participante_ids, 'reuniao_agendada',
                      f'Reuniao agendada: {titulo[:80]}',
                      f'/reunioes/{agenda_id}', actor_id)


def notify_doc_compartilhado(doc_id: int, doc_titulo: str, user_id: int, actor_id: int = None):
    notify_sigs(user_id, 'doc_compartilhado',
                f'Documento compartilhado com voce: {doc_titulo[:80]}',
                f'/documentos/{doc_id}', actor_id)


def notify_doc_revisao(doc_id: int, doc_titulo: str, revisao: int, user_ids: list, actor_id: int = None):
    notify_sigs_multi(user_ids, 'doc_revisao',
                      f'Nova revisao {revisao} do documento: {doc_titulo[:80]}',
                      f'/documentos/{doc_id}', actor_id)


def notify_comunicado(titulo: str, filial_id: int = None, actor_id: int = None):
    """Notifica todos os usuários da filial (ou todos se filial=None)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if filial_id:
            cur.execute("SELECT id FROM users WHERE sth_cad_filial_id = %s AND COALESCE(ativo, 'S') = 'S'", (filial_id,))
        else:
            cur.execute("SELECT id FROM users WHERE COALESCE(ativo, 'S') = 'S'")
        user_ids = [r[0] for r in cur.fetchall()]
        notify_sigs_multi(user_ids, 'comunicado_novo', f'Novo comunicado: {titulo[:80]}',
                          '/comunicacao', actor_id)
    finally:
        cur.close()
        conn.close()


def notify_lab_agendado(teste_id: int, pv: str, responsavel_id: int, actor_id: int = None):
    notify_sigs(responsavel_id, 'lab_agendado',
                f'Teste laboratorio agendado - PV {pv}',
                f'/laboratorio/{teste_id}', actor_id)


def notify_atn_etapa_mudada(atn_id: int, codigo: str, etapa_nova: str, responsavel_id: int, actor_id: int = None):
    notify_sigs(responsavel_id, 'atn_etapa_mudada',
                f'Atendimento {codigo} movido para etapa: {etapa_nova[:60]}',
                f'/assistencia/{atn_id}', actor_id)
