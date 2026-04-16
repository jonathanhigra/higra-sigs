# -*- coding: utf-8 -*-
"""
Reset historico do chat: historico_chat + historico_conversas.
"""

from psycopg2 import errors
from psycopg2 import OperationalError

from backend.database import get_db_connection
from backend.core.config import logger


def reset_chat_history():
    try:
        conn = get_db_connection()
    except OperationalError as e:
        logger.warning(
            "Reset do historico ignorado: banco indisponivel (%s).",
            e,
        )
        return

    cur = conn.cursor()
    try:
        try:
            cur.execute(
                """
                TRUNCATE historico_chat, historico_conversas
                RESTART IDENTITY CASCADE;
            """
            )
            conn.commit()
            logger.info("Historico do chat resetado com sucesso")
        except errors.UndefinedTable:
            conn.rollback()
            logger.info(
                "Reset do historico ignorado: tabelas ainda nao existem "
                "(primeira inicializacao)."
            )
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    reset_chat_history()
