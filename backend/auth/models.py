# -*- coding: utf-8 -*-
"""
Módulo de modelos e operações de banco para autenticação.
Usa o backend/database.py como fonte da conexão.
"""
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection, ensure_table_columns
from backend.core.config import logger

def create_user_table():
    """Cria a tabela de usuários caso ainda não exista."""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Migrar tabela antiga 'usuarios' para 'users'
        cur.execute("""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuarios')
                   AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')
                THEN
                    ALTER TABLE usuarios RENAME TO users;
                END IF;
            END $$;
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(100),
                password_hash TEXT NOT NULL,
                photo BYTEA,
                photo_mime VARCHAR(50),
                bio TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        ensure_table_columns(
            conn,
            "users",
            [
                ("bio", "bio TEXT"),
                ("cover_photo", "cover_photo BYTEA"),
                ("cover_photo_mime", "cover_photo_mime VARCHAR(50)"),
                ("is_ai", "is_ai BOOLEAN DEFAULT FALSE"),
                ("is_founder", "is_founder BOOLEAN DEFAULT FALSE"),
                ("is_admin", "is_admin BOOLEAN DEFAULT FALSE"),
                ("profile_complete", "profile_complete BOOLEAN DEFAULT FALSE"),
            ],
        )
        conn.commit()
        conn.close()
        logger.info("🗂️ Tabela 'users' verificada/criada com sucesso.")
    except Exception as e:
        logger.error(f"❌ Erro ao criar tabela de usuários: {e}")
        raise

def get_user_by_email(email: str):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE email = %s;", (email,))
    user = cur.fetchone()
    conn.close()
    return user

def get_user_by_id(user_id: int):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
    user = cur.fetchone()
    conn.close()
    return user

def insert_user(username: str, email: str, name: str, password_hash: str):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        INSERT INTO users (username, email, name, password_hash)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
    """, (username, email, name, password_hash))
    user_id = cur.fetchone()["id"]
    conn.commit()
    conn.close()
    logger.info(f"👤 Usuário inserido: {email}")
    return user_id

def update_user_profile(user_id: int, name=None, photo=None, photo_mime=None, bio=None, username=None):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    if username:
        # Check uniqueness (exclude self)
        cur.execute("SELECT id FROM users WHERE username = %s AND id != %s", (username, user_id))
        if cur.fetchone():
            conn.close()
            raise ValueError("Username já está em uso")
    if photo:
        if username:
            cur.execute("""
                UPDATE users
                SET name=%s, photo=%s, photo_mime=%s, bio=%s, username=%s
                WHERE id=%s;
            """, (name, photo, photo_mime, bio, username, user_id))
        else:
            cur.execute("""
                UPDATE users
                SET name=%s, photo=%s, photo_mime=%s, bio=%s
                WHERE id=%s;
            """, (name, photo, photo_mime, bio, user_id))
    else:
        if username:
            cur.execute("UPDATE users SET name=%s, bio=%s, username=%s WHERE id=%s;", (name, bio, username, user_id))
        else:
            cur.execute("UPDATE users SET name=%s, bio=%s WHERE id=%s;", (name, bio, user_id))
    conn.commit()
    conn.close()
    logger.info(f"✏️ Perfil atualizado: user_id={user_id}")

def remove_user_photo(user_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE users SET photo=NULL, photo_mime=NULL WHERE id=%s;", (user_id,))
    conn.commit()
    conn.close()
    logger.info(f"🗑️ Foto removida: user_id={user_id}")


def update_user_cover(user_id: int, cover_photo: bytes, cover_photo_mime: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET cover_photo=%s, cover_photo_mime=%s WHERE id=%s;",
        (cover_photo, cover_photo_mime, user_id),
    )
    conn.commit()
    conn.close()
    logger.info(f"✏️ Capa atualizada: user_id={user_id}")


def remove_user_cover(user_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE users SET cover_photo=NULL, cover_photo_mime=NULL WHERE id=%s;", (user_id,))
    conn.commit()
    conn.close()
    logger.info(f"🗑️ Capa removida: user_id={user_id}")
