# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Historico de conversas do chat (cabecalhos) - PostgreSQL.
"""

from fastapi import HTTPException
from backend.database import get_db_connection
from backend.core.config import logger


def criar_tabela_historico_conversas():
    """
    Cria a tabela historico_conversas caso nao exista.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS historico_conversas (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            titulo VARCHAR(160) NOT NULL DEFAULT 'Nova conversa',
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_conversas_usuario_atualizado
        ON historico_conversas(usuario_id, atualizado_em DESC);
    """)

    conn.commit()
    cur.close()
    conn.close()
    logger.info("Tabela historico_conversas verificada/criada com sucesso")


def criar_conversa(usuario_id: int, titulo: str | None = None) -> int:
    """
    Cria uma conversa e retorna o id.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        if titulo:
            cur.execute("""
                INSERT INTO historico_conversas (usuario_id, titulo)
                VALUES (%s, %s)
                RETURNING id;
            """, (usuario_id, titulo))
        else:
            cur.execute("""
                INSERT INTO historico_conversas (usuario_id)
                VALUES (%s)
                RETURNING id;
            """, (usuario_id,))

        conversa_id = cur.fetchone()[0]
        conn.commit()
        return conversa_id
    finally:
        cur.close()
        conn.close()


def atualizar_titulo(conversa_id: int, titulo: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE historico_conversas
            SET titulo = %s, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (titulo, conversa_id))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def tocar_conversa(conversa_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE historico_conversas
            SET atualizado_em = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (conversa_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def listar_conversas(usuario_id: int, limite: int = 20):
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT c.id, c.titulo, c.criado_em, c.atualizado_em
            FROM historico_conversas c
            WHERE c.usuario_id = %s
            ORDER BY c.atualizado_em DESC
            LIMIT %s;
        """, (usuario_id, limite))
        rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "titulo": r[1],
                "criado_em": r[2],
                "atualizado_em": r[3],
            }
            for r in rows
        ]
    finally:
        cur.close()
        conn.close()


def conversa_existe(conversa_id: int, usuario_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 1
            FROM historico_conversas
            WHERE id = %s AND usuario_id = %s;
        """, (conversa_id, usuario_id))
        return cur.fetchone() is not None
    finally:
        cur.close()
        conn.close()


def obter_titulo(conversa_id: int) -> str | None:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT titulo
            FROM historico_conversas
            WHERE id = %s;
        """, (conversa_id,))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        cur.close()
        conn.close()


async def renomear_conversa(conversa_id: int, usuario_id: int, titulo: str):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE historico_conversas
            SET titulo = %s, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = %s AND usuario_id = %s
            """,
            (titulo or None, conversa_id, usuario_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
        conn.commit()
        return True
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao renomear conversa")
        raise HTTPException(status_code=500, detail="Erro ao renomear conversa.")
    finally:
        if conn:
            conn.close()


def excluir_conversa(conversa_id: int, usuario_id: int) -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            DELETE FROM historico_conversas
            WHERE id = %s AND usuario_id = %s;
        """, (conversa_id, usuario_id))
        deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        cur.close()
        conn.close()
