# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Historico do chat - PostgreSQL (com conversas).
"""

import json
from backend.database import get_db_connection
from backend.core.config import logger
from backend.services.historico_conversas_service import tocar_conversa


def criar_tabela_historico_chat():
    """
    Cria a tabela historico_chat caso nao exista e garante conversa_id.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS historico_chat (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversa_id INTEGER REFERENCES historico_conversas(id) ON DELETE CASCADE,
            tipo VARCHAR(20) NOT NULL DEFAULT 'assistant',
            conteudo TEXT NOT NULL,
            avaliacao JSONB,
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        ALTER TABLE historico_chat
        ADD COLUMN IF NOT EXISTS conversa_id INTEGER
        REFERENCES historico_conversas(id) ON DELETE CASCADE;
    """)
    cur.execute("""
        ALTER TABLE historico_chat
        ADD COLUMN IF NOT EXISTS avaliacao JSONB;
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_historico_usuario_criado
        ON historico_chat(usuario_id, criado_em DESC);
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_historico_conversa_criado
        ON historico_chat(conversa_id, criado_em ASC);
    """)

    conn.commit()
    cur.close()
    conn.close()
    logger.info("Tabela historico_chat verificada/criada com sucesso")


def salvar_historico_chat(
    usuario_id: int,
    conversa_id: int,
    pergunta: str,
    resposta: str,
    avaliacao: dict | None = None
):
    """
    Salva pergunta (tipo 'user') e resposta (tipo 'assistant') no historico.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO historico_chat (usuario_id, conversa_id, tipo, conteudo)
            VALUES (%s, %s, 'user', %s)
        """, (usuario_id, conversa_id, pergunta))

        avaliacao_json = json.dumps(avaliacao) if avaliacao else None
        cur.execute("""
            INSERT INTO historico_chat (usuario_id, conversa_id, tipo, conteudo, avaliacao)
            VALUES (%s, %s, 'assistant', %s, %s)
        """, (usuario_id, conversa_id, resposta, avaliacao_json))

        conn.commit()
        if conversa_id:
            tocar_conversa(conversa_id)
        logger.info("Historico salvo com sucesso")
    except Exception as e:
        conn.rollback()
        logger.error(f"Falha ao salvar historico: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def salvar_mensagem_sistema(usuario_id: int, conversa_id: int, texto: str):
    """
    Salva uma mensagem de contexto/sistema no historico (nao enviada ao LLM).
    """
    if not conversa_id or not texto:
        return
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO historico_chat (usuario_id, conversa_id, tipo, conteudo)
            VALUES (%s, %s, 'system', %s)
        """, (usuario_id, conversa_id, texto))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Falha ao salvar mensagem de sistema: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def obter_historico_chat(usuario_id: int, conversa_id: int, limite: int = 50, incluir_system: bool = False):
    """
    Retorna o historico da conversa no formato esperado pelo LLM:
    [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
    ]
    """
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        if incluir_system:
            cur.execute("""
                SELECT tipo, conteudo
                FROM historico_chat
                WHERE usuario_id = %s AND conversa_id = %s
                ORDER BY criado_em ASC
                LIMIT %s
            """, (usuario_id, conversa_id, limite))
        else:
            cur.execute("""
                SELECT tipo, conteudo
                FROM historico_chat
                WHERE usuario_id = %s AND conversa_id = %s
                  AND tipo IN ('user', 'assistant')
                ORDER BY criado_em ASC
                LIMIT %s
            """, (usuario_id, conversa_id, limite))

        rows = cur.fetchall()
        mensagens = []
        for tipo, conteudo in rows:
            if tipo == "system":
                role = "system"
            else:
                role = "user" if tipo == "user" else "assistant"
            mensagens.append({"role": role, "content": conteudo})

        return mensagens
    except Exception as e:
        logger.error(f"Falha ao obter historico: {e}")
        return []
    finally:
        cur.close()
        conn.close()
