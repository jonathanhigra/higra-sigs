# -*- coding: utf-8 -*-
"""
Servicos do modulo social (feed, curtidas, comentarios, follows, notificacoes).
Usa conexao direta com PostgreSQL via psycopg2.
"""

import asyncio
import base64
import json
import logging
import math
import re
import time
import threading
from datetime import datetime
from fastapi import HTTPException
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection, ensure_table_columns


def _fire_and_forget(coro):
    """Schedule an async coroutine from a sync context (threadpool → event loop)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, loop)
    except Exception:
        pass

logger = logging.getLogger(__name__)

# ==========================================================
# Feed cache in-memory com TTL (estilo Twitter timeline cache)
# ==========================================================
_feed_cache = {}
_feed_cache_lock = threading.Lock()
_FEED_CACHE_TTL = 30  # segundos

# ==========================================================
# Cache de afinidade e interesses para recomendação
# ==========================================================
_affinity_cache = {}  # {usuario_id: {"data": {...}, "ts": float}}
_affinity_cache_lock = threading.Lock()
_AFFINITY_CACHE_TTL = 300  # 5 minutos


def _get_user_affinity(usuario_id: int):
    """Retorna scores de afinidade com autores e tags de interesse (cacheado 5min)."""
    with _affinity_cache_lock:
        entry = _affinity_cache.get(usuario_id)
        if entry and (time.time() - entry["ts"]) < _AFFINITY_CACHE_TTL:
            return entry["data"]

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Afinidade com autores: likes (peso 1) + comments (peso 2) + reposts (peso 1.5)
        cur.execute("""
            SELECT author_id, SUM(score) AS affinity FROM (
                SELECT p.user_id AS author_id, COUNT(*) AS score
                FROM social_post_likes l
                JOIN social_posts p ON p.id = l.post_id
                WHERE l.user_id = %s AND l.created_at > NOW() - INTERVAL '30 days'
                GROUP BY p.user_id
                UNION ALL
                SELECT p.user_id AS author_id, COUNT(*) * 2 AS score
                FROM social_post_comments c
                JOIN social_posts p ON p.id = c.post_id
                WHERE c.user_id = %s AND c.created_at > NOW() - INTERVAL '30 days'
                GROUP BY p.user_id
                UNION ALL
                SELECT p.user_id AS author_id, COUNT(*) * 1.5 AS score
                FROM social_reposts r
                JOIN social_posts p ON p.id = r.post_id
                WHERE r.user_id = %s AND r.created_at > NOW() - INTERVAL '30 days'
                GROUP BY p.user_id
                UNION ALL
                SELECT p.user_id AS author_id, COUNT(*) * 0.5 AS score
                JOIN social_posts p ON p.id = b.post_id
                WHERE b.user_id = %s AND b.created_at > NOW() - INTERVAL '30 days'
                GROUP BY p.user_id
            ) sub
            GROUP BY author_id
            ORDER BY affinity DESC
            LIMIT 50;
        """, (usuario_id, usuario_id, usuario_id, usuario_id))
        author_scores = {row["author_id"]: float(row["affinity"]) for row in cur.fetchall()}

        # Tags de interesse: tags dos posts que o usuario curtiu/comentou/repostou
        cur.execute("""
            SELECT tag, COUNT(*) AS cnt FROM (
                SELECT UNNEST(p.tags) AS tag
                FROM social_post_likes l
                JOIN social_posts p ON p.id = l.post_id
                WHERE l.user_id = %s AND p.tags IS NOT NULL AND p.tags != '{}'
                AND l.created_at > NOW() - INTERVAL '30 days'
                UNION ALL
                SELECT UNNEST(p.tags) AS tag
                FROM social_post_comments c
                JOIN social_posts p ON p.id = c.post_id
                WHERE c.user_id = %s AND p.tags IS NOT NULL AND p.tags != '{}'
                AND c.created_at > NOW() - INTERVAL '30 days'
            ) sub
            GROUP BY tag
            ORDER BY cnt DESC
            LIMIT 30;
        """, (usuario_id, usuario_id))
        tag_scores = {row["tag"]: int(row["cnt"]) for row in cur.fetchall()}

        data = {"authors": author_scores, "tags": tag_scores}
        with _affinity_cache_lock:
            _affinity_cache[usuario_id] = {"data": data, "ts": time.time()}
        return data
    except Exception as e:
        logger.warning(f"Erro ao calcular afinidade do usuario {usuario_id}: {e}")
        return {"authors": {}, "tags": {}}
    finally:
        if conn:
            conn.close()


def _score_post_for_user(post, affinity, max_author_affinity, max_tag_count):
    """Calcula score de recomendação para um post baseado na afinidade do usuario."""
    # 1. Afinidade com autor (40%)
    author_aff = affinity["authors"].get(post["user_id"], 0)
    author_score = (author_aff / max_author_affinity) if max_author_affinity > 0 else 0

    # 2. Engajamento do post (25%)
    engagement = (
        post.get("like_count", 0) * 2 +
        post.get("comment_count", 0) * 3 +
        post.get("repost_count", 0) * 2
    )
    # Normalizar com log para evitar dominio de posts virais
    engagement_score = math.log1p(engagement) / 10.0  # log(1+x), cap ~1.0 para ~22000 engagement

    # 3. Recencia (20%) — decay exponencial: 1.0 para agora, ~0.5 para 24h, ~0.1 para 72h
    created = post.get("created_at")
    if hasattr(created, "timestamp"):
        hours_age = (time.time() - created.timestamp()) / 3600.0
    else:
        hours_age = 0
    recency_score = math.exp(-0.03 * hours_age)  # meia-vida ~23h

    # 4. Relevancia de topico (15%)
    post_tags = post.get("tags") or []
    tag_match = 0
    if post_tags and affinity["tags"]:
        for tag in post_tags:
            if tag in affinity["tags"]:
                tag_match += affinity["tags"][tag]
        tag_score = (tag_match / max_tag_count) if max_tag_count > 0 else 0
    else:
        tag_score = 0

    # Bonus: artigos recebem leve boost (+5%)
    article_bonus = 0.05 if post.get("is_article") else 0

    # Bonus: posts de quem o usuario segue (ja inclusos no feed) ganham boost
    # Announcements ficam no topo
    announcement_bonus = 10.0 if post.get("is_announcement") else 0
    pinned_bonus = 5.0 if post.get("pinned") else 0

    score = (
        author_score * 0.40 +
        engagement_score * 0.25 +
        recency_score * 0.20 +
        tag_score * 0.15 +
        article_bonus +
        announcement_bonus +
        pinned_bonus
    )
    return score


def _get_cached_feed(key):
    with _feed_cache_lock:
        entry = _feed_cache.get(key)
        if entry and (time.time() - entry["ts"]) < _FEED_CACHE_TTL:
            return entry["data"]
        return None


def _set_cached_feed(key, data):
    with _feed_cache_lock:
        _feed_cache[key] = {"data": data, "ts": time.time()}
        # Limpar entradas expiradas (max 500 entradas)
        if len(_feed_cache) > 500:
            now = time.time()
            expired = [k for k, v in _feed_cache.items() if now - v["ts"] > _FEED_CACHE_TTL]
            for k in expired:
                del _feed_cache[k]


def invalidar_feed_cache(usuario_id=None):
    """Invalida cache do feed. Sem usuario_id = limpa tudo."""
    with _feed_cache_lock:
        if usuario_id is None:
            _feed_cache.clear()
        else:
            keys_to_remove = [k for k in _feed_cache if k[0] == usuario_id]
            for k in keys_to_remove:
                del _feed_cache[k]


def _safe_execute(cur, conn, sql, label=""):
    """Execute DDL with automatic recovery from aborted transaction."""
    try:
        cur.execute(sql)
    except Exception as e:
        logger.warning(f"DDL falhou ({label}): {e}")
        try:
            conn.rollback()
        except Exception:
            pass


def criar_tabelas_social():
    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit = True  # DDL: cada statement é independente
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                media JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        ensure_table_columns(
            conn,
            "social_posts",
            [
                ("media", "media JSONB"),
                ("title", "title TEXT"),
                ("is_article", "is_article BOOLEAN DEFAULT FALSE"),
                ("view_count", "view_count INTEGER DEFAULT 0"),
                ("tags", "tags TEXT[] DEFAULT '{}'"),
                ("pinned", "pinned BOOLEAN DEFAULT FALSE"),
                ("thread_id", "thread_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL"),
                ("is_announcement", "is_announcement BOOLEAN DEFAULT FALSE"),
                ("scheduled_at", "scheduled_at TIMESTAMP NULL"),
                ("like_count", "like_count INTEGER DEFAULT 0"),
                ("comment_count", "comment_count INTEGER DEFAULT 0"),
                ("repost_count", "repost_count INTEGER DEFAULT 0"),
                ("quoted_post_id", "quoted_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL"),
            ],
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_post_likes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, user_id)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_post_comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                parent_comment_id INTEGER REFERENCES social_post_comments(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        ensure_table_columns(
            conn,
            "social_post_comments",
            [
                (
                    "parent_comment_id",
                    "parent_comment_id INTEGER REFERENCES social_post_comments(id) ON DELETE CASCADE",
                ),
            ],
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_follows (
                id SERIAL PRIMARY KEY,
                follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(follower_id, following_id),
                CHECK (follower_id <> following_id)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_comment_likes (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER REFERENCES social_post_comments(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, user_id)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(20) NOT NULL,
                post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
                comment_id INTEGER REFERENCES social_post_comments(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP NULL
            );
            """
        )
        ensure_table_columns(
            conn,
            "social_notifications",
            [("metadata", "metadata JSONB")],
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_posts_cursor ON social_posts(created_at DESC, id DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_post_likes_post_id ON social_post_likes(post_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_id ON social_post_comments(post_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_post_comments_parent_id ON social_post_comments(parent_comment_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_comment_likes_comment_id ON social_comment_likes(comment_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_notifications_user_id ON social_notifications(user_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_notifications_user_created ON social_notifications(user_id, created_at DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_notifications_user_read ON social_notifications(user_id, read_at, created_at DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_notifications_user_type ON social_notifications(user_id, type, created_at DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON social_posts(user_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_posts_user_created ON social_posts(user_id, created_at DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows(follower_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows(following_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_post_likes_user_post ON social_post_likes(user_id, post_id);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_reposts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, post_id)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_reposts_user_id ON social_reposts(user_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_reposts_post_id ON social_reposts(post_id);"
        )
        # Índices compostos (post_id, user_id) para LEFT JOINs no feed
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_reposts_post_user ON social_reposts(post_id, user_id);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_dm_conversations (
                id SERIAL PRIMARY KEY,
                user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user1_id, user2_id),
                CHECK (user1_id < user2_id)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_dm_conv_users ON social_dm_conversations(user1_id, user2_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_dm_conv_last_msg ON social_dm_conversations(last_message_at DESC);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_dm_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES social_dm_conversations(id) ON DELETE CASCADE,
                sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                read_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_dm_messages_conv ON social_dm_messages(conversation_id, created_at DESC);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_dm_messages_sender ON social_dm_messages(sender_id);"
        )
        ensure_table_columns(
            conn,
            "social_dm_messages",
            [
                ("media_url", "media_url TEXT NULL"),
                ("reply_to_id", "reply_to_id INTEGER NULL"),
                ("edited_at", "edited_at TIMESTAMP NULL"),
            ],
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_dm_reactions (
                id SERIAL PRIMARY KEY,
                message_id INTEGER REFERENCES social_dm_messages(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                emoji VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(message_id, user_id, emoji)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_dm_reactions_msg ON social_dm_reactions(message_id);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_blocks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, blocked_id),
                CHECK (user_id <> blocked_id)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_blocks_user ON social_blocks(user_id);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_mutes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                muted_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, muted_id),
                CHECK (user_id <> muted_id)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_mutes_user ON social_mutes(user_id);"
        )
        # Índices compostos para queries do feed (blocks/mutes por user+target)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_blocks_user_blocked ON social_blocks(user_id, blocked_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_mutes_user_muted ON social_mutes(user_id, muted_id);"
        )
        # Índice composto para follows (usado no WHERE do feed "following")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_follows_follower_following ON social_follows(follower_id, following_id);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_polls (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE UNIQUE,
                question TEXT NOT NULL,
                expires_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_poll_options (
                id SERIAL PRIMARY KEY,
                poll_id INTEGER REFERENCES social_polls(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                position INTEGER DEFAULT 0
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_poll_votes (
                id SERIAL PRIMARY KEY,
                poll_id INTEGER REFERENCES social_polls(id) ON DELETE CASCADE,
                option_id INTEGER REFERENCES social_poll_options(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(poll_id, user_id)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_poll_votes_poll ON social_poll_votes(poll_id);"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_notification_prefs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                like_enabled BOOLEAN DEFAULT TRUE,
                comment_enabled BOOLEAN DEFAULT TRUE,
                follow_enabled BOOLEAN DEFAULT TRUE,
                article_enabled BOOLEAN DEFAULT TRUE,
                repost_enabled BOOLEAN DEFAULT TRUE,
                quote_enabled BOOLEAN DEFAULT TRUE
            );
            """
        )
        # Reações expandidas em posts (além do like)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS social_post_reactions (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                reaction VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, user_id, reaction)
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_post_reactions_post ON social_post_reactions(post_id);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_social_post_reactions_user_post ON social_post_reactions(user_id, post_id);"
        )
        logger.info("Tabelas do modulo social verificadas/criadas com sucesso.")

        # Migração: preencher contadores desnormalizados (roda apenas se houver pendências)
        try:
            conn.autocommit = False  # transação para a migração de dados
            cur.execute("""
                SELECT COUNT(*) FROM social_posts
                WHERE like_count = 0 AND comment_count = 0 AND repost_count = 0
                  AND EXISTS (
                      SELECT 1 FROM social_post_likes WHERE post_id = social_posts.id
                      UNION ALL
                      SELECT 1 FROM social_post_comments WHERE post_id = social_posts.id
                      UNION ALL
                      SELECT 1 FROM social_reposts WHERE post_id = social_posts.id
                  )
                LIMIT 1;
            """)
            pending = cur.fetchone()[0]
            if pending > 0:
                logger.info(f"Migrando contadores desnormalizados para {pending} posts...")
                cur.execute("""
                    UPDATE social_posts p SET
                        like_count = COALESCE((SELECT COUNT(*) FROM social_post_likes WHERE post_id = p.id), 0),
                        comment_count = COALESCE((SELECT COUNT(*) FROM social_post_comments WHERE post_id = p.id), 0),
                        repost_count = COALESCE((SELECT COUNT(*) FROM social_reposts WHERE post_id = p.id), 0)
                    WHERE like_count = 0 AND comment_count = 0 AND repost_count = 0
                      AND EXISTS (
                          SELECT 1 FROM social_post_likes WHERE post_id = p.id
                          UNION ALL
                          SELECT 1 FROM social_post_comments WHERE post_id = p.id
                          UNION ALL
                          SELECT 1 FROM social_reposts WHERE post_id = p.id
                      );
                """)
                conn.commit()
                logger.info("Migracao de contadores concluida.")
            else:
                logger.info("Contadores desnormalizados ja estao atualizados.")
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            logger.warning("Migracao de contadores desnormalizados ignorada")
    except Exception as e:
        logger.exception(f"Erro ao criar tabelas do social: {e}")
        raise
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def _extract_tags(text: str) -> list[str]:
    if not text:
        return []
    return list(dict.fromkeys(tag.lower() for tag in re.findall(r'#(\w{2,30})', text)))


def _encode_photo(row):
    if not row:
        return row
    if not row.get("photo"):
        row["photo"] = None
    else:
        photo = row["photo"]
        if isinstance(photo, memoryview):
            photo = bytes(photo)
        row["photo"] = base64.b64encode(photo).decode()
    if row.get("cover_photo"):
        cp = row["cover_photo"]
        if isinstance(cp, memoryview):
            cp = bytes(cp)
        row["cover_photo"] = base64.b64encode(cp).decode()
    return row


def _normalize_media(media):
    if not media:
        return []
    if not isinstance(media, list):
        raise HTTPException(status_code=400, detail="Midia invalida.")
    normalized = []
    for item in media[:4]:
        if not isinstance(item, dict):
            continue
        data = item.get("data")
        mime = item.get("mime") or "image/jpeg"
        if not data or not isinstance(data, str):
            continue
        if not mime.startswith("image/"):
            continue
        if len(data) > 7_000_000:
            raise HTTPException(status_code=400, detail="Imagem muito grande.")
        normalized.append({"data": data, "mime": mime})
    return normalized


def _check_notif_pref(cur, user_id: int, notif_type: str) -> bool:
    """Check if user has this notification type enabled. Returns True if enabled."""
    col_map = {"like": "like_enabled", "comment": "comment_enabled", "follow": "follow_enabled",
               "article": "article_enabled", "repost": "repost_enabled", "quote": "quote_enabled"}
    col = col_map.get(notif_type)
    if not col:
        return True
    # col is safe — only values from the hardcoded col_map above
    from psycopg2 import sql
    cur.execute(sql.SQL("SELECT {} FROM social_notification_prefs WHERE user_id = %s;").format(sql.Identifier(col)), (user_id,))
    row = cur.fetchone()
    if not row:
        return True  # default all enabled
    return row[0] if isinstance(row, tuple) else row[col]


def listar_feed(
    usuario_id: int, limit: int = 20, offset: int = 0,
    mode: str = "following",
    cursor_created_at: str = None, cursor_id: int = None,
):
    # Cache: só para primeira página (sem cursor)
    cache_key = (usuario_id, mode) if not cursor_created_at else None
    if cache_key:
        cached = _get_cached_feed(cache_key)
        if cached:
            return cached

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Colunas compartilhadas — sem u.photo (avatar via /social/avatar/{user_id})
        _select = """
                SELECT
                    p.id,
                    p.user_id,
                    p.content,
                    p.title,
                    p.is_article,
                    p.media,
                    p.created_at,
                    COALESCE(p.view_count, 0) AS view_count,
                    COALESCE(p.tags, '{}'::text[]) AS tags,
                    COALESCE(p.pinned, FALSE) AS pinned,
                    p.quoted_post_id,
                    p.thread_id,
                    COALESCE(p.is_announcement, FALSE) AS is_announcement,
                    u.name,
                    u.username,
                    COALESCE(u.is_founder, FALSE) AS is_founder,
                    COALESCE(u.is_ai, FALSE) AS is_ai,
                    COALESCE(p.like_count, 0) AS like_count,
                    COALESCE(p.comment_count, 0) AS comment_count,
                    COALESCE(p.repost_count, 0) AS repost_count,
                    (rp.post_id IS NOT NULL) AS reposted,
                    (lk.post_id IS NOT NULL) AS liked
                FROM social_posts p
                JOIN users u ON u.id = p.user_id
                LEFT JOIN social_reposts rp ON rp.post_id = p.id AND rp.user_id = %(uid)s
                LEFT JOIN social_post_likes lk ON lk.post_id = p.id AND lk.user_id = %(uid)s
        """

        # Cursor pagination: WHERE p.created_at < cursor (mais rápido que OFFSET)
        _cursor_clause = ""
        if cursor_created_at and cursor_id:
            _cursor_clause = "AND (p.created_at < %(cursor_ts)s OR (p.created_at = %(cursor_ts)s AND p.id < %(cursor_id)s))"

        params = {
            "uid": usuario_id,
            "lim": limit,
            "off": offset,
            "cursor_ts": cursor_created_at,
            "cursor_id": cursor_id,
        }

        # Excluir posts agendados que ainda nao chegaram na hora
        _sched_filter = "AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())"

        if mode == "all":
            _pagination = f"LIMIT %(lim)s OFFSET %(off)s" if not cursor_created_at else "LIMIT %(lim)s"
            cur.execute(
                f"""{_select}
                WHERE NOT EXISTS (SELECT 1 FROM social_blocks WHERE user_id = %(uid)s AND blocked_id = p.user_id)
                {_sched_filter}
                {_cursor_clause}
                ORDER BY COALESCE(p.pinned, FALSE) DESC, p.created_at DESC
                {_pagination};
                """,
                params,
            )
        elif mode == "trending":
            # Trending com time decay estilo Hacker News: score / (hours_age + 2)^1.5
            try:
                cur.execute(
                    f"""{_select}
                    WHERE p.created_at > NOW() - INTERVAL '48 hours'
                    AND NOT EXISTS (SELECT 1 FROM social_blocks WHERE user_id = %(uid)s AND blocked_id = p.user_id)
                    AND NOT EXISTS (SELECT 1 FROM social_mutes WHERE user_id = %(uid)s AND muted_id = p.user_id)
                    {_sched_filter}
                    ORDER BY (
                        (COALESCE(p.like_count, 0) * 2 +
                         COALESCE(p.comment_count, 0) * 3 +
                         COALESCE(p.repost_count, 0) * 2)::float
                        / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 + 2, 1.5)
                    ) DESC, p.created_at DESC
                    LIMIT %(lim)s OFFSET %(off)s;
                    """,
                    params,
                )
            except Exception as e:
                logger.warning(f"Trending com time decay falhou ({e}), usando fallback por created_at")
                conn.rollback()
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(
                    f"""SELECT p.id, p.user_id, p.content, p.title, p.is_article, p.media,
                               p.created_at, COALESCE(p.view_count, 0) AS view_count,
                               COALESCE(p.tags, '{{}}'::text[]) AS tags,
                               COALESCE(p.pinned, FALSE) AS pinned, p.quoted_post_id,
                               u.name, u.username,
                               COALESCE(u.is_founder, FALSE) AS is_founder,
                               COALESCE(u.is_ai, FALSE) AS is_ai,
                               0 AS like_count, 0 AS comment_count, 0 AS repost_count,
                               FALSE AS reposted, FALSE AS liked
                        FROM social_posts p JOIN users u ON u.id = p.user_id
                        WHERE p.created_at > NOW() - INTERVAL '48 hours'
                        ORDER BY p.created_at DESC
                        LIMIT %(lim)s OFFSET %(off)s;
                    """,
                    params,
                )
        elif mode == "recommended":
            # Recomendado: busca pool amplo e re-rankeia por afinidade do usuario
            _fetch_limit = limit * 4  # busca 4x mais para ter margem de rankeamento
            cur.execute(
                f"""{_select}
                WHERE p.created_at > NOW() - INTERVAL '7 days'
                AND NOT EXISTS (SELECT 1 FROM social_blocks WHERE user_id = %(uid)s AND blocked_id = p.user_id)
                AND NOT EXISTS (SELECT 1 FROM social_mutes WHERE user_id = %(uid)s AND muted_id = p.user_id)
                {_sched_filter}
                {_cursor_clause}
                ORDER BY p.created_at DESC
                LIMIT {_fetch_limit};
                """,
                params,
            )
            pool = cur.fetchall()
            for row in pool:
                if isinstance(row.get("media"), str):
                    try:
                        row["media"] = json.loads(row["media"])
                    except Exception:
                        row["media"] = []

            # Calcular scores de recomendacao
            affinity = _get_user_affinity(usuario_id)
            max_author = max(affinity["authors"].values()) if affinity["authors"] else 0
            max_tag = max(affinity["tags"].values()) if affinity["tags"] else 0

            for row in pool:
                row["_rec_score"] = _score_post_for_user(row, affinity, max_author, max_tag)

            pool.sort(key=lambda r: r["_rec_score"], reverse=True)

            # Aplicar paginação: pegar os primeiros `limit` posts
            rows = pool[:limit]
            for row in rows:
                row.pop("_rec_score", None)

            # Cursor para recomendado usa offset simples (re-rankeamento muda ordem)
            next_cursor = None
            if len(pool) > limit:
                last = rows[-1]
                created = last["created_at"]
                next_cursor = {
                    "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
                    "id": last["id"],
                }

            result = {"posts": rows, "next_cursor": next_cursor}
            if cache_key:
                _set_cached_feed(cache_key, result)
            return result
        else:
            # following — posts de quem segue + próprios (LEFT JOIN em vez de OR EXISTS)
            _pagination = f"LIMIT %(lim)s OFFSET %(off)s" if not cursor_created_at else "LIMIT %(lim)s"
            cur.execute(
                f"""{_select}
                LEFT JOIN social_follows sf ON sf.follower_id = %(uid)s AND sf.following_id = p.user_id
                WHERE (p.user_id = %(uid)s OR sf.id IS NOT NULL)
                AND NOT EXISTS (SELECT 1 FROM social_blocks WHERE user_id = %(uid)s AND blocked_id = p.user_id)
                AND NOT EXISTS (SELECT 1 FROM social_mutes WHERE user_id = %(uid)s AND muted_id = p.user_id)
                {_sched_filter}
                {_cursor_clause}
                ORDER BY COALESCE(p.pinned, FALSE) DESC, p.created_at DESC
                {_pagination};
                """,
                params,
            )

        rows = cur.fetchall()
        for row in rows:
            if isinstance(row.get("media"), str):
                try:
                    row["media"] = json.loads(row["media"])
                except Exception:
                    row["media"] = []

        # Cursor para próxima página
        next_cursor = None
        if rows and len(rows) >= limit:
            last = rows[-1]
            created = last["created_at"]
            next_cursor = {
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
                "id": last["id"],
            }

        result = {"posts": rows, "next_cursor": next_cursor}

        if cache_key:
            _set_cached_feed(cache_key, result)

        return result
    except Exception as e:
        logger.exception("Erro ao listar feed social")
        raise HTTPException(status_code=500, detail=f"Erro ao listar feed social: {e}")
    finally:
        if conn:
            conn.close()


def contar_novos_posts(usuario_id: int, since: str = None, mode: str = "following"):
    """Conta quantos posts novos existem desde o timestamp dado."""
    if not since:
        return 0
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if mode == "all":
            cur.execute(
                """SELECT COUNT(*) FROM social_posts p
                   WHERE p.created_at > %s
                   AND NOT EXISTS (SELECT 1 FROM social_blocks WHERE user_id = %s AND blocked_id = p.user_id);""",
                (since, usuario_id),
            )
        elif mode == "trending":
            return 0  # trending não tem "novos posts"
        else:
            cur.execute(
                """SELECT COUNT(*) FROM social_posts p
                   WHERE p.created_at > %s
                   AND (p.user_id = %s OR EXISTS (SELECT 1 FROM social_follows WHERE follower_id = %s AND following_id = p.user_id))
                   AND NOT EXISTS (SELECT 1 FROM social_blocks WHERE user_id = %s AND blocked_id = p.user_id)
                   AND NOT EXISTS (SELECT 1 FROM social_mutes WHERE user_id = %s AND muted_id = p.user_id);""",
                (since, usuario_id, usuario_id, usuario_id, usuario_id),
            )
        return cur.fetchone()[0]
    except Exception:
        logger.exception("Erro ao contar novos posts")
        return 0
    finally:
        if conn:
            conn.close()


def buscar_feed(usuario_id: int, query: str, limit: int = 20, mode: str = "following",
                      date_from: str = None, date_to: str = None,
                      content_type: str = None, author: str = None):
    if not query or not query.strip():
        return []
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        term = f"%{query.strip()}%"
        params = [usuario_id, term, term, term, term]

        # Build dynamic WHERE clauses
        extra_where = ""
        if mode != "all":
            extra_where += """
                AND (
                    p.user_id = %s
                    OR EXISTS (
                        SELECT 1
                        FROM social_follows f
                        WHERE f.follower_id = %s AND f.following_id = p.user_id
                    )
                )"""
            params.extend([usuario_id, usuario_id])

        if date_from:
            extra_where += "\n                AND p.created_at >= %s"
            params.append(date_from)

        if date_to:
            extra_where += "\n                AND p.created_at <= %s"
            params.append(date_to + ' 23:59:59')

        if content_type == "articles":
            extra_where += "\n                AND p.is_article = TRUE"
        elif content_type == "posts":
            extra_where += "\n                AND p.is_article = FALSE"
        elif content_type == "media":
            extra_where += "\n                AND p.media IS NOT NULL AND p.media != '[]'::jsonb"

        if author:
            extra_where += "\n                AND (u.name ILIKE %s OR u.username ILIKE %s)"
            author_term = f"%{author.strip()}%"
            params.extend([author_term, author_term])

        params.append(limit)

        sql = f"""
                SELECT
                    p.id,
                    p.user_id,
                    p.content,
                    p.title,
                    p.is_article,
                    p.media,
                    p.created_at,
                    COALESCE(p.view_count, 0) AS view_count,
                    COALESCE(p.tags, '{{}}') AS tags,
                    u.name,
                    u.username,
                    COALESCE(u.is_founder, FALSE) AS is_founder,
                    COALESCE(u.is_ai, FALSE) AS is_ai,
                    COALESCE(p.like_count, 0) AS like_count,
                    COALESCE(p.comment_count, 0) AS comment_count,
                    (lk.post_id IS NOT NULL) AS liked
                FROM social_posts p
                JOIN users u ON u.id = p.user_id
                LEFT JOIN social_post_likes lk ON lk.post_id = p.id AND lk.user_id = %s
                WHERE (
                    p.content ILIKE %s
                    OR p.title ILIKE %s
                    OR u.name ILIKE %s
                    OR u.username ILIKE %s
                ){extra_where}
                ORDER BY p.created_at DESC
                LIMIT %s;
                """
        cur.execute(sql, params)
        rows = cur.fetchall()
        for row in rows:
            if isinstance(row.get("media"), str):
                try:
                    row["media"] = json.loads(row["media"])
                except Exception:
                    row["media"] = []
        return rows
    except Exception:
        logger.exception("Erro ao buscar feed social")
        raise HTTPException(status_code=500, detail="Erro ao buscar feed social.")
    finally:
        if conn:
            conn.close()


def buscar_post(post_id: int, usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
                p.id,
                p.user_id,
                p.content,
                p.title,
                p.is_article,
                p.media,
                p.created_at,
                p.view_count,
                COALESCE(p.pinned, FALSE) AS pinned,
                p.quoted_post_id,
                p.thread_id,
                COALESCE(p.is_announcement, FALSE) AS is_announcement,
                u.name,
                u.username,
                u.photo,
                u.photo_mime,
                COALESCE(u.is_founder, FALSE) AS is_founder,
                COALESCE(p.like_count, 0) AS like_count,
                COALESCE(p.comment_count, 0) AS comment_count,
                COALESCE(p.repost_count, 0) AS repost_count,
                EXISTS (
                    SELECT 1 FROM social_reposts rpu
                    WHERE rpu.post_id = p.id AND rpu.user_id = %s
                ) AS reposted,
                EXISTS (
                    SELECT 1
                    FROM social_post_likes pl
                    WHERE pl.post_id = p.id AND pl.user_id = %s
                ) AS liked,
                EXISTS (
                    SELECT 1
                    WHERE bk.post_id = p.id AND bk.user_id = %s
            FROM social_posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.id = %s
            LIMIT 1;
            """,
            (usuario_id, usuario_id, usuario_id, post_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")
        # Incrementar view_count
        cur.execute("UPDATE social_posts SET view_count = view_count + 1 WHERE id = %s;", (post_id,))
        conn.commit()
        _encode_photo(row)
        if isinstance(row.get("media"), str):
            try:
                row["media"] = json.loads(row["media"])
            except Exception:
                row["media"] = []
        # Buscar dados do post citado (quote post)
        if row.get("quoted_post_id"):
            cur.execute(
                """
                SELECT p.id, p.content, p.title, p.is_article, p.created_at,
                       u.name, u.username, u.photo, u.photo_mime
                FROM social_posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.id = %s;
                """,
                (row["quoted_post_id"],),
            )
            quoted = cur.fetchone()
            if quoted:
                _encode_photo(quoted)
            row["quoted_post"] = quoted
        else:
            row["quoted_post"] = None
        return row
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erro ao buscar post")
        raise HTTPException(status_code=500, detail="Erro ao buscar post.")
    finally:
        if conn:
            conn.close()


def criar_post(usuario_id: int, content: str, media=None, title: str = None, quoted_post_id: int = None, thread_id: int = None, scheduled_at: str = None):
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Conteudo obrigatorio.")
    is_article = bool(title and title.strip())
    max_length = 5000 if is_article else 280
    if len(content.strip()) > max_length:
        raise HTTPException(status_code=400, detail=f"Conteudo excede o limite de {max_length} caracteres.")
    if title and len(title.strip()) > 200:
        raise HTTPException(status_code=400, detail="Titulo excede o limite de 200 caracteres.")
    media_payload = _normalize_media(media)
    title_val = title.strip() if is_article else None
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            INSERT INTO social_posts (user_id, content, media, title, is_article, tags, quoted_post_id, thread_id, scheduled_at, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (usuario_id, content.strip(), json.dumps(media_payload), title_val, is_article, _extract_tags(content), quoted_post_id, thread_id, scheduled_at, datetime.utcnow()),
        )
        post_id = cur.fetchone()["id"]

        # Notify mentioned users
        mentions = re.findall(r'@(\w+)', content)
        if mentions:
            placeholders = ','.join(['%s'] * len(mentions))
            cur.execute(
                f"SELECT id FROM users WHERE username IN ({placeholders}) AND id != %s;",
                (*mentions, usuario_id),
            )
            mentioned_users = cur.fetchall()
            for mu in mentioned_users:
                cur.execute(
                    """INSERT INTO social_notifications (user_id, actor_id, type, post_id, created_at)
                    VALUES (%s, %s, 'mention', %s, %s);""",
                    (mu["id"], usuario_id, post_id, datetime.utcnow()),
                )

        conn.commit()

        # Notificar autor do post citado
        if quoted_post_id:
            try:
                conn_q = get_db_connection()
                cur_q = conn_q.cursor()
                cur_q.execute("SELECT user_id FROM social_posts WHERE id = %s;", (quoted_post_id,))
                quoted_row = cur_q.fetchone()
                if quoted_row and quoted_row[0] != usuario_id and _check_notif_pref(cur_q, quoted_row[0], "quote"):
                    cur_q.execute(
                        """
                        INSERT INTO social_notifications (user_id, actor_id, type, post_id, created_at)
                        VALUES (%s, %s, %s, %s, %s);
                        """,
                        (quoted_row[0], usuario_id, "quote", post_id, datetime.utcnow()),
                    )
                    conn_q.commit()
                conn_q.close()
            except Exception as e:
                logger.warning(f"Erro ao notificar autor do post citado: {e}")

        # Indexar no RAG: artigos (todos) e posts de fundadores
        _should_index = is_article
        if not _should_index:
            try:
                cur.execute("SELECT is_founder FROM users WHERE id = %s", (usuario_id,))
                _row = cur.fetchone()
                _should_index = bool(_row and _row.get("is_founder"))
            except Exception:
                pass
        if _should_index:
            try:
                from backend.services.feed_rag_service import indexar_post_no_rag
                _cat = "artigo_comunidade" if is_article else "post_fundador"
                indexar_post_no_rag(post_id, title_val, content.strip(), usuario_id, category=_cat)
            except Exception as e:
                logger.warning(f"Erro ao indexar post no RAG: {e}")

            # Notificar seguidores sobre novo artigo
            try:
                conn2 = get_db_connection()
                cur2 = conn2.cursor()
                cur2.execute(
                    "SELECT follower_id FROM social_follows WHERE following_id = %s;",
                    (usuario_id,),
                )
                followers = cur2.fetchall()
                for (follower_id,) in followers:
                    if _check_notif_pref(cur2, follower_id, "article"):
                        cur2.execute(
                            """
                            INSERT INTO social_notifications (user_id, actor_id, type, post_id, created_at)
                            VALUES (%s, %s, %s, %s, %s);
                            """,
                            (follower_id, usuario_id, "article", post_id, datetime.utcnow()),
                        )
                conn2.commit()
                conn2.close()
            except Exception as e:
                logger.warning(f"Erro ao notificar seguidores: {e}")

        # Conceder convite extra a cada 10 posts
        try:
            conn_inv = get_db_connection()
            cur_inv = conn_inv.cursor()
            cur_inv.execute("SELECT COUNT(*) FROM social_posts WHERE user_id = %s;", (usuario_id,))
            total_posts = cur_inv.fetchone()[0]
            if total_posts > 0 and total_posts % 10 == 0:
                cur_inv.execute(
                    "UPDATE users SET invite_count = invite_count + 1 WHERE id = %s;",
                    (usuario_id,)
                )
                cur_inv.execute(
                    """INSERT INTO social_notifications (user_id, actor_id, type, created_at)
                    VALUES (%s, %s, 'invite_earned', CURRENT_TIMESTAMP);""",
                    (usuario_id, usuario_id)
                )
                conn_inv.commit()
                logger.info(f"User {usuario_id} ganhou +1 convite (total_posts={total_posts})")
            conn_inv.close()
        except Exception as e:
            logger.warning(f"Erro ao verificar convite por posts: {e}")

        invalidar_feed_cache()
        # Se for agendado, retornar info sem publicar no feed
        if scheduled_at:
            return {"post": {"id": post_id, "scheduled_at": scheduled_at, "content": content.strip()}}
        return buscar_post(post_id, usuario_id)
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.exception("Erro ao criar post")
        raise HTTPException(status_code=500, detail=f"Erro ao criar post: {e}")
    finally:
        if conn:
            conn.close()


def listar_posts_agendados(usuario_id: int):
    """Lista posts agendados do usuario que ainda nao foram publicados."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, content, title, is_article, scheduled_at, created_at
            FROM social_posts
            WHERE user_id = %s AND scheduled_at IS NOT NULL AND scheduled_at > NOW()
            ORDER BY scheduled_at ASC;
        """, (usuario_id,))
        return cur.fetchall()
    except Exception as e:
        logger.exception("Erro ao listar posts agendados")
        return []
    finally:
        if conn:
            conn.close()


def cancelar_post_agendado(usuario_id: int, post_id: int):
    """Cancela (exclui) um post agendado."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM social_posts WHERE id = %s AND user_id = %s AND scheduled_at IS NOT NULL AND scheduled_at > NOW();",
            (post_id, usuario_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post agendado nao encontrado.")
        conn.commit()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao cancelar post agendado: {e}")
    finally:
        if conn:
            conn.close()


def listar_posts_relacionados(post_id: int, usuario_id: int, limit: int = 5):
    """Retorna posts relacionados baseado em tags, autor e engajamento."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Buscar tags e autor do post original
        cur.execute("SELECT user_id, tags FROM social_posts WHERE id = %s;", (post_id,))
        original = cur.fetchone()
        if not original:
            return []

        author_id = original["user_id"]
        tags = original.get("tags") or []

        if tags:
            # Posts com tags em comum, excluindo o proprio
            cur.execute("""
                SELECT p.id, p.user_id, p.content, p.title, p.is_article, p.created_at,
                       u.name, u.username,
                       COALESCE(p.like_count, 0) AS like_count,
                       COALESCE(p.comment_count, 0) AS comment_count,
                       (SELECT COUNT(*) FROM UNNEST(p.tags) t WHERE t = ANY(%s)) AS tag_overlap
                FROM social_posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.id != %s
                AND (p.tags && %s OR p.user_id = %s)
                AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())
                ORDER BY tag_overlap DESC, (COALESCE(p.like_count,0) + COALESCE(p.comment_count,0)) DESC
                LIMIT %s;
            """, (tags, post_id, tags, author_id, limit))
        else:
            # Sem tags: buscar do mesmo autor ou mais engajados recentes
            cur.execute("""
                SELECT p.id, p.user_id, p.content, p.title, p.is_article, p.created_at,
                       u.name, u.username,
                       COALESCE(p.like_count, 0) AS like_count,
                       COALESCE(p.comment_count, 0) AS comment_count,
                       0 AS tag_overlap
                FROM social_posts p
                JOIN users u ON u.id = p.user_id
                WHERE p.id != %s
                AND (p.user_id = %s OR p.created_at > NOW() - INTERVAL '7 days')
                AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())
                ORDER BY (CASE WHEN p.user_id = %s THEN 1 ELSE 0 END) DESC,
                         (COALESCE(p.like_count,0) + COALESCE(p.comment_count,0)) DESC
                LIMIT %s;
            """, (post_id, author_id, author_id, limit))

        return cur.fetchall()
    except Exception as e:
        logger.warning(f"Erro ao buscar posts relacionados: {e}")
        return []
    finally:
        if conn:
            conn.close()


def listar_thread(thread_id: int, usuario_id: int):
    """Lista todos os posts de uma thread."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT p.*, u.name, u.username, u.is_founder,
                   EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id = p.id AND l.user_id = %s) AS liked
            FROM social_posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.thread_id = %s OR p.id = %s
            ORDER BY p.created_at ASC;
            """,
            (usuario_id, usuario_id, thread_id, thread_id),
        )
        rows = cur.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            if r.get("media"):
                try:
                    r["media"] = json.loads(r["media"]) if isinstance(r["media"], str) else r["media"]
                except Exception:
                    r["media"] = []
            result.append(r)
        return result
    except Exception:
        logger.exception("Erro ao listar thread")
        raise HTTPException(status_code=500, detail="Erro ao listar thread.")
    finally:
        if conn:
            conn.close()


def toggle_announcement(post_id: int, usuario_id: int):
    """Toggle announcement status (admin only)."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT is_founder FROM users WHERE id = %s;", (usuario_id,))
        user = cur.fetchone()
        if not user or not user.get("is_founder"):
            raise HTTPException(status_code=403, detail="Apenas admins podem criar anuncios.")
        cur.execute(
            "UPDATE social_posts SET is_announcement = NOT COALESCE(is_announcement, FALSE) WHERE id = %s RETURNING is_announcement;",
            (post_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")
        conn.commit()
        return {"is_announcement": row["is_announcement"]}
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao toggle anuncio")
        raise HTTPException(status_code=500, detail="Erro ao alterar anuncio.")
    finally:
        if conn:
            conn.close()


def editar_post(usuario_id: int, post_id: int, content: str, title: str = None):
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Conteudo obrigatorio.")
    is_article = bool(title and title.strip())
    title_val = title.strip() if is_article else None
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT id, is_article FROM social_posts WHERE id = %s AND user_id = %s;",
            (post_id, usuario_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")
        was_article = row["is_article"]

        cur.execute(
            """
            UPDATE social_posts
            SET content = %s, title = %s, is_article = %s, tags = %s
            WHERE id = %s AND user_id = %s;
            """,
            (content.strip(), title_val, is_article, _extract_tags(content), post_id, usuario_id),
        )
        conn.commit()

        # Atualizar RAG
        if is_article:
            try:
                from backend.services.feed_rag_service import remover_post_do_rag, indexar_post_no_rag
                remover_post_do_rag(post_id)
                indexar_post_no_rag(post_id, title_val, content.strip(), usuario_id)
            except Exception as e:
                logger.warning(f"Erro ao atualizar post no RAG: {e}")
        elif was_article:
            try:
                from backend.services.feed_rag_service import remover_post_do_rag
                remover_post_do_rag(post_id)
            except Exception as e:
                logger.warning(f"Erro ao remover post do RAG: {e}")

        return buscar_post(post_id, usuario_id)
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao editar post")
        raise HTTPException(status_code=500, detail="Erro ao editar post.")
    finally:
        if conn:
            conn.close()


def alternar_like(usuario_id: int, post_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT user_id FROM social_posts WHERE id = %s;",
            (post_id,),
        )
        post = cur.fetchone()
        if not post:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")

        cur.execute(
            """
            SELECT id FROM social_post_likes
            WHERE post_id = %s AND user_id = %s;
            """,
            (post_id, usuario_id),
        )
        liked_row = cur.fetchone()
        if liked_row:
            cur.execute(
                "DELETE FROM social_post_likes WHERE id = %s;",
                (liked_row["id"],),
            )
            cur.execute(
                "UPDATE social_posts SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0) WHERE id = %s RETURNING like_count;",
                (post_id,),
            )
            total = cur.fetchone()["like_count"]
            liked = False
        else:
            cur.execute(
                """
                INSERT INTO social_post_likes (post_id, user_id, created_at)
                VALUES (%s, %s, %s);
                """,
                (post_id, usuario_id, datetime.utcnow()),
            )
            cur.execute(
                "UPDATE social_posts SET like_count = COALESCE(like_count, 0) + 1 WHERE id = %s RETURNING like_count;",
                (post_id,),
            )
            liked = True
            total = cur.fetchone()["like_count"]
            if post["user_id"] != usuario_id and _check_notif_pref(cur, post["user_id"], "like"):
                cur.execute(
                    """
                    INSERT INTO social_notifications (user_id, actor_id, type, post_id, created_at)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (post["user_id"], usuario_id, "like", post_id, datetime.utcnow()),
                )
        conn.commit()
        invalidar_feed_cache()
        return {"liked": liked, "like_count": total}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar like")
        raise HTTPException(status_code=500, detail="Erro ao alternar like.")
    finally:
        if conn:
            conn.close()


def listar_comentarios(post_id: int, usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
                c.id,
                c.post_id,
                c.user_id,
                c.content,
                c.parent_comment_id,
                c.created_at,
                u.name,
                u.username,
                COALESCE(u.is_founder, FALSE) AS is_founder,
                COALESCE(u.is_ai, FALSE) AS is_ai,
                COALESCE(l.like_count, 0) AS like_count,
                (cl_user.comment_id IS NOT NULL) AS liked
            FROM social_post_comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN (
                SELECT comment_id, COUNT(*) AS like_count
                FROM social_comment_likes
                GROUP BY comment_id
            ) l ON l.comment_id = c.id
            LEFT JOIN social_comment_likes cl_user ON cl_user.comment_id = c.id AND cl_user.user_id = %s
            WHERE c.post_id = %s
            ORDER BY c.created_at ASC;
            """,
            (usuario_id, post_id),
        )
        rows = cur.fetchall()
        return rows
    except Exception:
        logger.exception("Erro ao listar comentarios")
        raise HTTPException(status_code=500, detail="Erro ao listar comentarios.")
    finally:
        if conn:
            conn.close()


def criar_comentario(usuario_id: int, post_id: int, content: str, parent_comment_id: int = None):
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Conteudo obrigatorio.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT user_id FROM social_posts WHERE id = %s;",
            (post_id,),
        )
        post = cur.fetchone()
        if not post:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")

        parent_comment_owner = None
        if parent_comment_id:
            cur.execute(
                """
                SELECT id, user_id FROM social_post_comments
                WHERE id = %s AND post_id = %s;
                """,
                (parent_comment_id, post_id),
            )
            parent_row = cur.fetchone()
            if not parent_row:
                raise HTTPException(status_code=404, detail="Comentario pai nao encontrado.")
            parent_comment_owner = parent_row["user_id"]

        cur.execute(
            """
            INSERT INTO social_post_comments (post_id, user_id, content, parent_comment_id, created_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (post_id, usuario_id, content.strip(), parent_comment_id, datetime.utcnow()),
        )
        comment_id = cur.fetchone()["id"]
        cur.execute(
            "UPDATE social_posts SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = %s;",
            (post_id,),
        )
        if post["user_id"] != usuario_id and _check_notif_pref(cur, post["user_id"], "comment"):
            cur.execute(
                """
                INSERT INTO social_notifications (user_id, actor_id, type, post_id, comment_id, created_at)
                VALUES (%s, %s, %s, %s, %s, %s);
                """,
                (post["user_id"], usuario_id, "comment", post_id, comment_id, datetime.utcnow()),
            )
        # Notificar autor do comentario pai (reply)
        if parent_comment_owner and parent_comment_owner != usuario_id and parent_comment_owner != post["user_id"]:
            if _check_notif_pref(cur, parent_comment_owner, "comment"):
                cur.execute(
                    """
                    INSERT INTO social_notifications (user_id, actor_id, type, post_id, comment_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    (parent_comment_owner, usuario_id, "comment", post_id, comment_id, datetime.utcnow()),
                )
        # Notificar menções (@usuario) no comentário
        mentioned = re.findall(r'@(\w+)', content)
        if mentioned:
            already_notified = {post["user_id"], usuario_id}
            if parent_comment_owner:
                already_notified.add(parent_comment_owner)
            placeholders = ",".join(["%s"] * len(mentioned))
            cur.execute(
                f"SELECT id, username FROM users WHERE username IN ({placeholders})",
                mentioned,
            )
            for mrow in cur.fetchall():
                if mrow["id"] not in already_notified:
                    cur.execute(
                        """
                        INSERT INTO social_notifications (user_id, actor_id, type, post_id, comment_id, created_at)
                        VALUES (%s, %s, 'mention', %s, %s, %s);
                        """,
                        (mrow["id"], usuario_id, post_id, comment_id, datetime.utcnow()),
                    )
                    already_notified.add(mrow["id"])
        conn.commit()
        cur.execute(
            """
            SELECT
                c.id,
                c.post_id,
                c.user_id,
                c.content,
                c.parent_comment_id,
                c.created_at,
                u.name,
                u.username,
                COALESCE(u.is_founder, FALSE) AS is_founder,
                COALESCE(u.is_ai, FALSE) AS is_ai
            FROM social_post_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = %s;
            """,
            (comment_id,),
        )
        row = cur.fetchone()
        row["like_count"] = 0
        row["liked"] = False
        invalidar_feed_cache()
        return row
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao criar comentario")
        raise HTTPException(status_code=500, detail="Erro ao criar comentario.")
    finally:
        if conn:
            conn.close()


def alternar_follow(usuario_id: int, target_id: int):
    if usuario_id == target_id:
        raise HTTPException(status_code=400, detail="Nao e possivel seguir a si mesmo.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM users WHERE id = %s;", (target_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Usuario nao encontrado.")

        cur.execute(
            """
            SELECT id FROM social_follows
            WHERE follower_id = %s AND following_id = %s;
            """,
            (usuario_id, target_id),
        )
        follow_row = cur.fetchone()
        if follow_row:
            cur.execute("DELETE FROM social_follows WHERE id = %s;", (follow_row["id"],))
            following = False
        else:
            cur.execute(
                """
                INSERT INTO social_follows (follower_id, following_id, created_at)
                VALUES (%s, %s, %s);
                """,
                (usuario_id, target_id, datetime.utcnow()),
            )
            following = True
            if _check_notif_pref(cur, target_id, "follow"):
                cur.execute(
                    """
                    INSERT INTO social_notifications (user_id, actor_id, type, created_at)
                    VALUES (%s, %s, %s, %s);
                    """,
                    (target_id, usuario_id, "follow", datetime.utcnow()),
                )
        conn.commit()
        return {"following": following}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar follow")
        raise HTTPException(status_code=500, detail="Erro ao alternar follow.")
    finally:
        if conn:
            conn.close()


def alternar_like_comentario(usuario_id: int, comment_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT user_id FROM social_post_comments WHERE id = %s;",
            (comment_id,),
        )
        comment = cur.fetchone()
        if not comment:
            raise HTTPException(status_code=404, detail="Comentario nao encontrado.")

        cur.execute(
            """
            SELECT id FROM social_comment_likes
            WHERE comment_id = %s AND user_id = %s;
            """,
            (comment_id, usuario_id),
        )
        liked_row = cur.fetchone()
        if liked_row:
            cur.execute("DELETE FROM social_comment_likes WHERE id = %s;", (liked_row["id"],))
            liked = False
        else:
            cur.execute(
                """
                INSERT INTO social_comment_likes (comment_id, user_id, created_at)
                VALUES (%s, %s, %s);
                """,
                (comment_id, usuario_id, datetime.utcnow()),
            )
            liked = True

        cur.execute(
            "SELECT COUNT(*) AS total FROM social_comment_likes WHERE comment_id = %s;",
            (comment_id,),
        )
        total = cur.fetchone()["total"]
        conn.commit()
        return {"liked": liked, "like_count": total}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar like no comentario")
        raise HTTPException(status_code=500, detail="Erro ao curtir comentario.")
    finally:
        if conn:
            conn.close()


def obter_stats_usuario(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM social_posts WHERE user_id = %s;", (usuario_id,))
        posts = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM social_follows WHERE follower_id = %s;", (usuario_id,))
        following = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM social_follows WHERE following_id = %s;", (usuario_id,))
        followers = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM nexus_invites WHERE inviter_id = %s AND status = 'accepted';", (usuario_id,))
        invited_count = cur.fetchone()[0]
        cur.execute("""
            SELECT inv_u.id, inv_u.name, inv_u.username
            FROM users u LEFT JOIN users inv_u ON inv_u.id = u.invited_by
            WHERE u.id = %s;
        """, (usuario_id,))
        row = cur.fetchone()
        invited_by = {"id": row[0], "name": row[1], "username": row[2]} if row and row[0] else None
        return {"posts": posts, "following": following, "followers": followers,
                "invited_count": invited_count, "invited_by": invited_by}
    except Exception:
        logger.exception("Erro ao obter estatisticas de usuario")
        raise HTTPException(status_code=500, detail="Erro ao obter estatisticas do usuario.")
    finally:
        if conn:
            conn.close()


def obter_perfil_usuario(target_id: int, viewer_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT u.id, u.name, u.username, u.photo, u.photo_mime, u.bio,
                   u.cover_photo, u.cover_photo_mime, u.created_at,
                   COALESCE(u.is_founder, FALSE) AS is_founder,
                   COALESCE(u.is_ai, FALSE) AS is_ai,
                   inv_u.name AS invited_by_name,
                   inv_u.username AS invited_by_username,
                   inv_u.id AS invited_by_id,
                (SELECT COUNT(*) FROM social_posts WHERE user_id = u.id) AS post_count,
                (SELECT COUNT(*) FROM social_follows WHERE follower_id = u.id) AS following_count,
                (SELECT COUNT(*) FROM social_follows WHERE following_id = u.id) AS follower_count,
                (SELECT COUNT(*) FROM nexus_invites WHERE inviter_id = u.id AND status = 'accepted') AS invited_count,
                EXISTS (
                    SELECT 1 FROM social_follows
                    WHERE follower_id = %s AND following_id = u.id
                ) AS is_following
            FROM users u
            LEFT JOIN users inv_u ON inv_u.id = u.invited_by
            WHERE u.id = %s;
            """,
            (viewer_id, target_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuario nao encontrado.")
        _encode_photo(row)
        return row
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erro ao obter perfil")
        raise HTTPException(status_code=500, detail="Erro ao obter perfil.")
    finally:
        if conn:
            conn.close()


def listar_seguidores(target_id: int, viewer_id: int, limit: int = 50, offset: int = 0):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT u.id, u.name, u.username,
                (sf.id IS NOT NULL) AS is_following
            FROM social_follows f
            JOIN users u ON u.id = f.follower_id
            LEFT JOIN social_follows sf ON sf.follower_id = %s AND sf.following_id = u.id
            WHERE f.following_id = %s
            ORDER BY f.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            (viewer_id, target_id, limit, offset),
        )
        rows = cur.fetchall()
        return rows
    except Exception:
        logger.exception("Erro ao listar seguidores")
        raise HTTPException(status_code=500, detail="Erro ao listar seguidores.")
    finally:
        if conn:
            conn.close()


def listar_seguindo(target_id: int, viewer_id: int, limit: int = 50, offset: int = 0):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT u.id, u.name, u.username,
                (sf.id IS NOT NULL) AS is_following
            FROM social_follows f
            JOIN users u ON u.id = f.following_id
            LEFT JOIN social_follows sf ON sf.follower_id = %s AND sf.following_id = u.id
            WHERE f.follower_id = %s
            ORDER BY f.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            (viewer_id, target_id, limit, offset),
        )
        rows = cur.fetchall()
        return rows
    except Exception:
        logger.exception("Erro ao listar seguindo")
        raise HTTPException(status_code=500, detail="Erro ao listar seguindo.")
    finally:
        if conn:
            conn.close()


def listar_posts_usuario(target_id: int, viewer_id: int, limit: int = 20, offset: int = 0):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
                p.id, p.user_id, p.content, p.title, p.is_article, p.media, p.created_at,
                COALESCE(p.view_count, 0) AS view_count,
                COALESCE(p.pinned, FALSE) AS pinned,
                u.name, u.username,
                COALESCE(p.like_count, 0) AS like_count,
                COALESCE(p.comment_count, 0) AS comment_count,
                (lk.post_id IS NOT NULL) AS liked
            FROM social_posts p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN social_post_likes lk ON lk.post_id = p.id AND lk.user_id = %s
            WHERE p.user_id = %s
            ORDER BY COALESCE(p.pinned, FALSE) DESC, p.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            (viewer_id, target_id, limit, offset),
        )
        rows = cur.fetchall()
        for row in rows:
            if isinstance(row.get("media"), str):
                try:
                    row["media"] = json.loads(row["media"])
                except Exception:
                    row["media"] = []
        return rows
    except Exception:
        logger.exception("Erro ao listar posts do usuario")
        raise HTTPException(status_code=500, detail="Erro ao listar posts.")
    finally:
        if conn:
            conn.close()


def listar_curtidas_usuario(target_id: int, viewer_id: int, limit: int = 20, offset: int = 0):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
                p.id, p.user_id, p.content, p.title, p.is_article, p.media, p.created_at,
                COALESCE(p.view_count, 0) AS view_count,
                u.name, u.username,
                COALESCE(p.like_count, 0) AS like_count,
                COALESCE(p.comment_count, 0) AS comment_count,
                TRUE AS liked,
            FROM social_post_likes pl_user
            JOIN social_posts p ON p.id = pl_user.post_id
            JOIN users u ON u.id = p.user_id
            WHERE pl_user.user_id = %s
            ORDER BY pl_user.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            (viewer_id, target_id, limit, offset),
        )
        rows = cur.fetchall()
        for row in rows:
            if isinstance(row.get("media"), str):
                try:
                    row["media"] = json.loads(row["media"])
                except Exception:
                    row["media"] = []
        return rows
    except Exception:
        logger.exception("Erro ao listar curtidas do usuario")
        raise HTTPException(status_code=500, detail="Erro ao listar curtidas.")
    finally:
        if conn:
            conn.close()


def listar_sugestoes(usuario_id: int, limit: int = 5):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT u.id, u.name, u.username
            FROM users u
            WHERE u.id <> %s
              AND NOT EXISTS (
                  SELECT 1
                  FROM social_follows f
                  WHERE f.follower_id = %s AND f.following_id = u.id
              )
            ORDER BY u.created_at DESC
            LIMIT %s;
            """,
            (usuario_id, usuario_id, limit),
        )
        rows = cur.fetchall()
        return rows
    except Exception:
        logger.exception("Erro ao listar sugestoes")
        raise HTTPException(status_code=500, detail="Erro ao listar sugestoes.")
    finally:
        if conn:
            conn.close()


def _agrupar_notificacoes(notificacoes):
    """Agrupa notificações do mesmo tipo no mesmo post (ex: múltiplas curtidas)."""
    grouped = []
    seen = {}
    for n in notificacoes:
        if n["type"] in ("like", "repost") and n.get("post_id"):
            key = (n["type"], n["post_id"])
            if key in seen:
                entry = seen[key]
                entry["actors"].append({
                    "id": n["actor_id"],
                    "name": n["actor_name"],
                    "username": n["actor_username"],
                })
                entry["actor_count"] += 1
                if not entry.get("read_at") and n.get("read_at"):
                    pass
                elif n.get("read_at") is None:
                    entry["read_at"] = None
                continue
            else:
                n["grouped"] = True
                n["actors"] = [{
                    "id": n["actor_id"],
                    "name": n["actor_name"],
                    "username": n["actor_username"],
                }]
                n["actor_count"] = 1
                seen[key] = n
                grouped.append(n)
        else:
            grouped.append(n)
    return grouped


def listar_notificacoes(usuario_id: int, limit: int = 20, offset: int = 0, type_filter: str = None, status_filter: str = None, grouped: bool = False):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        where = "n.user_id = %s"
        params = [usuario_id]
        if type_filter:
            where += " AND n.type = %s"
            params.append(type_filter)
        if status_filter == "unread":
            where += " AND n.read_at IS NULL"
        elif status_filter == "read":
            where += " AND n.read_at IS NOT NULL"
        params_query = [usuario_id] + params
        params_query.extend([limit, offset])
        cur.execute(
            f"""
            SELECT
                n.id, n.type, n.post_id, n.comment_id,
                n.created_at, n.read_at, n.metadata,
                u.id AS actor_id, u.name AS actor_name,
                u.username AS actor_username,
                LEFT(p.content, 100) AS post_preview,
                EXISTS(
                    SELECT 1 FROM social_follows sf
                    WHERE sf.follower_id = %s AND sf.following_id = n.actor_id
                ) AS actor_following
            FROM social_notifications n
            LEFT JOIN users u ON u.id = n.actor_id
            LEFT JOIN social_posts p ON p.id = n.post_id
            WHERE {where}
            ORDER BY n.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            params_query,
        )
        result = [dict(row) for row in cur.fetchall()]

        if grouped:
            result = _agrupar_notificacoes(result)

        return result
    except Exception as e:
        logger.exception("Erro ao listar notificacoes")
        raise HTTPException(status_code=500, detail=f"Erro ao listar notificacoes: {e}")
    finally:
        if conn:
            conn.close()


def marcar_todas_notificacoes_lidas(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE social_notifications
            SET read_at = %s
            WHERE user_id = %s AND read_at IS NULL;
            """,
            (datetime.utcnow(), usuario_id),
        )
        conn.commit()
        return {"status": "ok", "count": cur.rowcount}
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao marcar todas notificacoes como lidas")
        raise HTTPException(status_code=500, detail="Erro ao marcar notificacoes como lidas.")
    finally:
        if conn:
            conn.close()


def marcar_notificacao_lida(usuario_id: int, notification_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE social_notifications
            SET read_at = %s
            WHERE id = %s AND user_id = %s;
            """,
            (datetime.utcnow(), notification_id, usuario_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Notificacao nao encontrada.")
        conn.commit()
        return {"status": "ok"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao marcar notificacao como lida")
        raise HTTPException(status_code=500, detail="Erro ao marcar notificacao como lida.")
    finally:
        if conn:
            conn.close()


def deletar_notificacao(usuario_id: int, notification_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM social_notifications WHERE id = %s AND user_id = %s;",
            (notification_id, usuario_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Notificacao nao encontrada.")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao deletar notificacao")
        raise HTTPException(status_code=500, detail="Erro ao deletar notificacao.")
    finally:
        if conn:
            conn.close()


def criar_notificacao_sistema(user_id: int, message: str, link: str = None):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        metadata = json.dumps({"message": message, "link": link})
        cur.execute(
            """INSERT INTO social_notifications (user_id, actor_id, type, metadata, created_at)
            VALUES (%s, NULL, 'system', %s, %s);""",
            (user_id, metadata, datetime.utcnow()),
        )
        conn.commit()
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao criar notificacao de sistema")
    finally:
        if conn:
            conn.close()


def contar_notificacoes_nao_lidas(usuario_id: int) -> int:
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM social_notifications WHERE user_id = %s AND read_at IS NULL",
            (usuario_id,),
        )
        return cur.fetchone()[0]
    except Exception:
        logger.exception("Erro ao contar notificacoes nao lidas")
        return 0
    finally:
        if conn:
            conn.close()


def contar_notificacoes_por_tipo(usuario_id: int) -> dict:
    """Retorna contagem de notificações não lidas agrupadas por tipo."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT type, COUNT(*) AS count FROM social_notifications WHERE user_id = %s AND read_at IS NULL GROUP BY type",
            (usuario_id,),
        )
        rows = cur.fetchall()
        return {row["type"]: row["count"] for row in rows}
    except Exception:
        logger.exception("Erro ao contar notificacoes por tipo")
        return {}
    finally:
        if conn:
            conn.close()


def limpar_notificacoes_antigas():
    """Remove notificações expiradas segundo regras de TTL:
    - Lidas há mais de 30 dias
    - Não lidas há mais de 90 dias
    - Mais de 500 por usuário (remove as mais antigas)
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Deletar lidas com mais de 30 dias
        cur.execute("""
            DELETE FROM social_notifications
            WHERE read_at IS NOT NULL
              AND read_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
        """)
        deleted_read = cur.rowcount
        # Deletar não lidas com mais de 90 dias
        cur.execute("""
            DELETE FROM social_notifications
            WHERE read_at IS NULL
              AND created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
        """)
        deleted_unread = cur.rowcount
        # Limitar a 500 por usuário
        cur.execute("""
            DELETE FROM social_notifications
            WHERE id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY user_id ORDER BY created_at DESC
                    ) AS rn
                    FROM social_notifications
                ) ranked
                WHERE rn > 500
            );
        """)
        deleted_overflow = cur.rowcount
        conn.commit()
        total = deleted_read + deleted_unread + deleted_overflow
        if total > 0:
            logger.info(
                f"[NOTIF-CLEANUP] Removidas {total} notificacoes "
                f"(lidas={deleted_read}, expiradas={deleted_unread}, overflow={deleted_overflow})"
            )
        return total
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao limpar notificacoes antigas")
        return 0
    finally:
        if conn:
            conn.close()


def listar_tendencias(limit: int = 5, hours: int = 24):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                """
                SELECT content,
                       COALESCE(like_count, 0) AS like_count,
                       COALESCE(comment_count, 0) AS comment_count,
                       COALESCE(repost_count, 0) AS repost_count,
                       EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 AS hours_age
                FROM social_posts
                WHERE created_at >= NOW() - INTERVAL %s
                ORDER BY created_at DESC;
                """,
                (f"{hours} hours",),
            )
        except Exception:
            # Fallback se colunas de contadores não existirem ainda
            conn.rollback()
            cur.execute(
                """
                SELECT content,
                       0 AS like_count, 0 AS comment_count, 0 AS repost_count,
                       EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 AS hours_age
                FROM social_posts
                WHERE created_at >= NOW() - INTERVAL %s
                ORDER BY created_at DESC;
                """,
                (f"{hours} hours",),
            )
        rows = cur.fetchall()
        if not rows:
            return []

        import re

        hashtag_counts = {}
        word_counts = {}
        stopwords = {
            # artigos / preposições / pronomes
            "para", "com", "uma", "umas", "uns", "que", "isso", "essa", "esse",
            "mais", "menos", "como", "sao", "nao", "nos", "nas", "das", "dos",
            "por", "sobre", "quando", "onde", "porque", "entao", "aqui", "ali",
            "tambem", "pelo", "pela", "pelos", "pelas", "dela", "dele", "deles",
            "delas", "este", "esta", "isto", "aquele", "aquela", "aquilo",
            "voces", "voce", "nosso", "nossa", "muito", "muita", "todos", "todas",
            # verbos comuns / auxiliares
            "estar", "estou", "esta", "estao", "estava", "estavam",
            "ser", "sou", "somos", "eram", "foram", "seria", "seria",
            "ter", "tenho", "temos", "tinha", "tinham", "teria",
            "fazer", "faz", "fez", "fazendo", "feito",
            "pode", "podem", "podemos", "podia", "poder",
            "quer", "quero", "queria", "querem",
            "vai", "vou", "vamos", "foram", "ir",
            "disse", "dizer", "falar", "falou",
            "acho", "acha", "acham", "achei",
            "ainda", "agora", "depois", "antes", "sempre", "nunca", "ja",
            "bem", "bom", "boa", "bons", "boas",
            "qual", "quais", "quem", "cada", "tudo", "nada", "algo",
            "outro", "outra", "outros", "outras",
            "mesmo", "mesma", "mesmos", "mesmas",
            "entre", "desde", "ate", "sem", "contra", "apos",
            "so", "apenas", "ainda", "tipo", "coisa", "coisas",
            "sim", "nao", "talvez", "claro",
            # palavras genéricas da web
            "http", "https", "www", "html", "link",
        }

        for row in rows:
            content = row.get("content") or ""
            # Peso do post: 1 (base) + engajamento, com time decay
            engagement = (row.get("like_count", 0) * 2
                          + row.get("comment_count", 0) * 3
                          + row.get("repost_count", 0) * 2)
            hours_age = max(0.0, float(row.get("hours_age", 0) or 0))
            weight = (1 + engagement) / ((hours_age + 2) ** 1.2)

            # Hashtags — já agrupadas em lowercase
            for tag in re.findall(r"#(\w+)", content):
                key = tag.lower()
                if key not in hashtag_counts:
                    hashtag_counts[key] = {"score": 0.0, "count": 0}
                hashtag_counts[key]["score"] += weight
                hashtag_counts[key]["count"] += 1

            # Palavras soltas (4+ chars, lowercase)
            for word in re.findall(r"\b[\w\-]{4,}\b", content.lower()):
                if word.startswith("#"):
                    continue
                if word.isdigit():
                    continue
                if word in stopwords:
                    continue
                if word not in word_counts:
                    word_counts[word] = {"score": 0.0, "count": 0}
                word_counts[word]["score"] += weight
                word_counts[word]["count"] += 1

        trends = []

        # Tenta com min_count=2; se vazio, relaxa para 1
        for min_count in (2, 1):
            trends = []
            for tag, data in hashtag_counts.items():
                if data["count"] >= min_count:
                    trends.append({
                        "title": f"#{tag}",
                        "category": "Hashtag",
                        "count": data["count"],
                        "score": round(data["score"], 2),
                    })

            for word, data in word_counts.items():
                if data["count"] >= min_count:
                    trends.append({
                        "title": word,
                        "category": "Assunto do Momento",
                        "count": data["count"],
                        "score": round(data["score"], 2),
                    })

            if trends:
                break

        trends.sort(key=lambda item: item["score"], reverse=True)
        return trends[:limit]
    except Exception:
        logger.exception("Erro ao listar tendencias")
        return []
    finally:
        if conn:
            conn.close()


def excluir_post(usuario_id: int, post_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Verificar se é artigo antes de excluir
        cur.execute("SELECT is_article FROM social_posts WHERE id = %s AND user_id = %s;", (post_id, usuario_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")
        was_article = row[0]

        cur.execute("DELETE FROM social_posts WHERE id = %s AND user_id = %s;", (post_id, usuario_id))
        conn.commit()

        # Remover do RAG se era artigo
        if was_article:
            try:
                from backend.services.feed_rag_service import remover_post_do_rag
                remover_post_do_rag(post_id)
            except Exception as e:
                logger.warning(f"Erro ao remover post do RAG: {e}")

        invalidar_feed_cache()
        return {"status": "ok"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao excluir post")
        raise HTTPException(status_code=500, detail="Erro ao excluir post.")
    finally:
        if conn:
            conn.close()


def alternar_repost(usuario_id: int, post_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT user_id FROM social_posts WHERE id = %s;", (post_id,))
        post = cur.fetchone()
        if not post:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")

        cur.execute(
            "SELECT id FROM social_reposts WHERE user_id = %s AND post_id = %s;",
            (usuario_id, post_id),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute("DELETE FROM social_reposts WHERE id = %s;", (existing["id"],))
            cur.execute(
                "UPDATE social_posts SET repost_count = GREATEST(COALESCE(repost_count, 0) - 1, 0) WHERE id = %s RETURNING repost_count;",
                (post_id,),
            )
            total = cur.fetchone()["repost_count"]
            reposted = False
        else:
            cur.execute(
                "INSERT INTO social_reposts (user_id, post_id, created_at) VALUES (%s, %s, %s);",
                (usuario_id, post_id, datetime.utcnow()),
            )
            cur.execute(
                "UPDATE social_posts SET repost_count = COALESCE(repost_count, 0) + 1 WHERE id = %s RETURNING repost_count;",
                (post_id,),
            )
            total = cur.fetchone()["repost_count"]
            reposted = True
            if post["user_id"] != usuario_id and _check_notif_pref(cur, post["user_id"], "repost"):
                cur.execute(
                    """
                    INSERT INTO social_notifications (user_id, actor_id, type, post_id, created_at)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (post["user_id"], usuario_id, "repost", post_id, datetime.utcnow()),
                )
        conn.commit()
        invalidar_feed_cache()
        return {"reposted": reposted, "repost_count": total}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar repost")
        raise HTTPException(status_code=500, detail="Erro ao alternar repost.")
    finally:
        if conn:
            conn.close()


def listar_conversas_dm(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT c.id,
                   CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END AS other_user_id,
                   u.name AS other_name, u.username AS other_username,
                   COALESCE(u.is_ai, FALSE) AS other_is_ai,
                   c.last_message_at,
                   m.content AS last_message,
                   (SELECT COUNT(*) FROM social_dm_messages dm
                    WHERE dm.conversation_id = c.id AND dm.sender_id != %s AND dm.read_at IS NULL
                   ) AS unread_count
            FROM social_dm_conversations c
            JOIN users u ON u.id = CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END
            LEFT JOIN LATERAL (
                SELECT content FROM social_dm_messages
                WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
            ) m ON TRUE
            WHERE c.user1_id = %s OR c.user2_id = %s
            ORDER BY c.last_message_at DESC;
            """,
            (usuario_id, usuario_id, usuario_id, usuario_id, usuario_id),
        )
        rows = cur.fetchall()
        return rows
    except Exception:
        logger.exception("Erro ao listar conversas DM")
        raise HTTPException(status_code=500, detail="Erro ao listar conversas.")
    finally:
        if conn:
            conn.close()


def _check_dm_block(cur, usuario_id: int, other_id: int):
    """Check if either user has blocked the other. Raises HTTPException if blocked."""
    cur.execute(
        """SELECT EXISTS(
            SELECT 1 FROM social_blocks
            WHERE (user_id = %s AND blocked_id = %s) OR (user_id = %s AND blocked_id = %s)
        ) AS blocked;""",
        (usuario_id, other_id, other_id, usuario_id),
    )
    if cur.fetchone()["blocked"]:
        raise HTTPException(status_code=403, detail="Nao e possivel enviar mensagem para este usuario.")


def obter_ou_criar_conversa_dm(usuario_id: int, other_id: int):
    if usuario_id == other_id:
        raise HTTPException(status_code=400, detail="Nao pode enviar DM para si mesmo.")
    u1 = min(usuario_id, other_id)
    u2 = max(usuario_id, other_id)
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        _check_dm_block(cur, usuario_id, other_id)
        cur.execute(
            "SELECT id FROM social_dm_conversations WHERE user1_id = %s AND user2_id = %s;",
            (u1, u2),
        )
        row = cur.fetchone()
        if row:
            return row["id"]
        cur.execute(
            "INSERT INTO social_dm_conversations (user1_id, user2_id) VALUES (%s, %s) RETURNING id;",
            (u1, u2),
        )
        conv_id = cur.fetchone()["id"]
        conn.commit()
        return conv_id
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao criar conversa DM")
        raise HTTPException(status_code=500, detail="Erro ao criar conversa.")
    finally:
        if conn:
            conn.close()


def listar_mensagens_dm(usuario_id: int, conversation_id: int, limit: int = 50, offset: int = 0):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT id FROM social_dm_conversations WHERE id = %s AND (user1_id = %s OR user2_id = %s);",
            (conversation_id, usuario_id, usuario_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
        # Mark messages as read and notify sender
        cur.execute(
            """
            UPDATE social_dm_messages SET read_at = %s
            WHERE conversation_id = %s AND sender_id != %s AND read_at IS NULL
            RETURNING sender_id;
            """,
            (datetime.utcnow(), conversation_id, usuario_id),
        )
        updated_rows = cur.fetchall()
        conn.commit()
        if updated_rows:
            sender_id = updated_rows[0]["sender_id"]
            try:
                from backend.routes.social_ws import notify_user
                _fire_and_forget(notify_user(sender_id, "dm_read", {
                    "conversation_id": conversation_id,
                    "read_by": usuario_id,
                }))
            except Exception:
                pass
        cur.execute(
            """
            SELECT m.id, m.sender_id, m.content, m.media_url, m.reply_to_id, m.read_at, m.edited_at, m.created_at,
                   u.name AS sender_name, u.username AS sender_username,
                   rm.content AS reply_content, ru.name AS reply_sender_name
            FROM social_dm_messages m
            JOIN users u ON u.id = m.sender_id
            LEFT JOIN social_dm_messages rm ON rm.id = m.reply_to_id
            LEFT JOIN users ru ON ru.id = rm.sender_id
            WHERE m.conversation_id = %s
            ORDER BY m.created_at ASC
            LIMIT %s OFFSET %s;
            """,
            (conversation_id, limit, offset),
        )
        messages = cur.fetchall()
        if messages:
            msg_ids = [m["id"] for m in messages]
            placeholders = ",".join(["%s"] * len(msg_ids))
            cur.execute(
                f"""
                SELECT message_id, emoji, array_agg(user_id) AS user_ids
                FROM social_dm_reactions
                WHERE message_id IN ({placeholders})
                GROUP BY message_id, emoji;
                """,
                msg_ids,
            )
            reactions_map = {}
            for r in cur.fetchall():
                mid = r["message_id"]
                if mid not in reactions_map:
                    reactions_map[mid] = {}
                reactions_map[mid][r["emoji"]] = r["user_ids"]
            for m in messages:
                m["reactions"] = reactions_map.get(m["id"], {})
        return messages
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erro ao listar mensagens DM")
        raise HTTPException(status_code=500, detail="Erro ao listar mensagens.")
    finally:
        if conn:
            conn.close()


def enviar_mensagem_dm(usuario_id: int, conversation_id: int, content: str, media_url: str = None, reply_to_id: int = None):
    if (not content or not content.strip()) and not media_url:
        raise HTTPException(status_code=400, detail="Mensagem vazia.")
    if content and len(content) > 2000:
        raise HTTPException(status_code=400, detail="Mensagem excede o limite de 2000 caracteres.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT id, user1_id, user2_id FROM social_dm_conversations WHERE id = %s AND (user1_id = %s OR user2_id = %s);",
            (conversation_id, usuario_id, usuario_id),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
        other_id_check = conv["user2_id"] if conv["user1_id"] == usuario_id else conv["user1_id"]
        _check_dm_block(cur, usuario_id, other_id_check)
        safe_content = content.strip() if content else ""
        cur.execute(
            """
            INSERT INTO social_dm_messages (conversation_id, sender_id, content, media_url, reply_to_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, created_at;
            """,
            (conversation_id, usuario_id, safe_content, media_url, reply_to_id, datetime.utcnow()),
        )
        msg = cur.fetchone()
        cur.execute(
            "UPDATE social_dm_conversations SET last_message_at = %s WHERE id = %s;",
            (msg["created_at"], conversation_id),
        )
        conn.commit()

        # Determine recipient and notify via WebSocket
        other_id = conv["user2_id"] if conv["user1_id"] == usuario_id else conv["user1_id"]
        msg_data = {
            "id": msg["id"],
            "conversation_id": conversation_id,
            "sender_id": usuario_id,
            "content": safe_content,
            "media_url": media_url,
            "reply_to_id": reply_to_id,
            "read_at": None,
            "created_at": str(msg["created_at"]),
        }
        try:
            from backend.routes.social_ws import notify_user
            _fire_and_forget(notify_user(other_id, "dm_message", msg_data))
            # Also notify sender (for multi-tab sync)
            _fire_and_forget(notify_user(usuario_id, "dm_message", msg_data))
        except Exception:
            logger.debug("Falha ao notificar via WS (DM)")

        # Auto-reply if the recipient is Arquimedes (AI bot)
        try:
            conn2 = get_db_connection()
            cur2 = conn2.cursor(cursor_factory=RealDictCursor)
            try:
                cur2.execute(
                    """SELECT ai.id AS ai_id, s.name AS sender_name
                       FROM users ai, users s
                       WHERE ai.id = %s AND ai.is_ai = TRUE AND s.id = %s""",
                    (other_id, usuario_id),
                )
                row = cur2.fetchone()
            finally:
                cur2.close()
                conn2.close()
            if row:
                from backend.services.arquimedes_service import responder_dm_arquimedes
                responder_dm_arquimedes(
                    conversation_id, safe_content, row["sender_name"] or "", usuario_id
                )
        except Exception:
            logger.debug("Falha ao disparar resposta AI no DM")

        return msg_data
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao enviar mensagem DM")
        raise HTTPException(status_code=500, detail="Erro ao enviar mensagem.")
    finally:
        if conn:
            conn.close()


def excluir_mensagem_dm(usuario_id: int, message_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT m.id, m.conversation_id, c.user1_id, c.user2_id
            FROM social_dm_messages m
            JOIN social_dm_conversations c ON c.id = m.conversation_id
            WHERE m.id = %s AND m.sender_id = %s;
            """,
            (message_id, usuario_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mensagem nao encontrada.")
        cur.execute("DELETE FROM social_dm_messages WHERE id = %s;", (message_id,))
        conn.commit()
        # Notify both users
        other_id = row["user2_id"] if row["user1_id"] == usuario_id else row["user1_id"]
        try:
            from backend.routes.social_ws import notify_user
            del_data = {"message_id": message_id, "conversation_id": row["conversation_id"]}
            _fire_and_forget(notify_user(other_id, "dm_delete", del_data))
            _fire_and_forget(notify_user(usuario_id, "dm_delete", del_data))
        except Exception:
            pass
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao excluir mensagem DM")
        raise HTTPException(status_code=500, detail="Erro ao excluir mensagem.")
    finally:
        if conn:
            conn.close()


def editar_mensagem_dm(usuario_id: int, message_id: int, content: str):
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia.")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Mensagem excede o limite de 2000 caracteres.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT m.id, m.conversation_id, m.sender_id, c.user1_id, c.user2_id
            FROM social_dm_messages m
            JOIN social_dm_conversations c ON c.id = m.conversation_id
            WHERE m.id = %s AND m.sender_id = %s;
            """,
            (message_id, usuario_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mensagem nao encontrada ou sem permissao.")
        safe_content = content.strip()
        cur.execute(
            "UPDATE social_dm_messages SET content = %s, edited_at = %s WHERE id = %s;",
            (safe_content, datetime.utcnow(), message_id),
        )
        conn.commit()
        other_id = row["user2_id"] if row["user1_id"] == usuario_id else row["user1_id"]
        edit_data = {"message_id": message_id, "conversation_id": row["conversation_id"], "content": safe_content}
        try:
            from backend.routes.social_ws import notify_user
            _fire_and_forget(notify_user(other_id, "dm_edit", edit_data))
            _fire_and_forget(notify_user(usuario_id, "dm_edit", edit_data))
        except Exception:
            pass
        return {"edited": True, "content": safe_content}
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao editar mensagem DM")
        raise HTTPException(status_code=500, detail="Erro ao editar mensagem.")
    finally:
        if conn:
            conn.close()


def alternar_reacao_dm(usuario_id: int, message_id: int, emoji: str):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Verify message exists and user is part of conversation
        cur.execute(
            """
            SELECT m.id, m.conversation_id, c.user1_id, c.user2_id
            FROM social_dm_messages m
            JOIN social_dm_conversations c ON c.id = m.conversation_id
            WHERE m.id = %s AND (c.user1_id = %s OR c.user2_id = %s);
            """,
            (message_id, usuario_id, usuario_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mensagem nao encontrada.")
        # Toggle reaction
        cur.execute(
            "SELECT id FROM social_dm_reactions WHERE message_id = %s AND user_id = %s AND emoji = %s;",
            (message_id, usuario_id, emoji),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute("DELETE FROM social_dm_reactions WHERE id = %s;", (existing["id"],))
            added = False
        else:
            cur.execute(
                "INSERT INTO social_dm_reactions (message_id, user_id, emoji, created_at) VALUES (%s, %s, %s, %s);",
                (message_id, usuario_id, emoji, datetime.utcnow()),
            )
            added = True
        conn.commit()
        # Get updated reactions for this message
        cur.execute(
            """
            SELECT emoji, array_agg(user_id) AS user_ids
            FROM social_dm_reactions
            WHERE message_id = %s
            GROUP BY emoji;
            """,
            (message_id,),
        )
        reactions = {r["emoji"]: r["user_ids"] for r in cur.fetchall()}
        # Notify both users
        other_id = row["user2_id"] if row["user1_id"] == usuario_id else row["user1_id"]
        try:
            from backend.routes.social_ws import notify_user
            react_data = {
                "message_id": message_id,
                "conversation_id": row["conversation_id"],
                "reactions": reactions,
            }
            _fire_and_forget(notify_user(other_id, "dm_reaction", react_data))
            _fire_and_forget(notify_user(usuario_id, "dm_reaction", react_data))
        except Exception:
            pass
        return {"added": added, "reactions": reactions}
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar reacao DM")
        raise HTTPException(status_code=500, detail="Erro ao reagir a mensagem.")
    finally:
        if conn:
            conn.close()


def contar_dms_nao_lidas(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) FROM social_dm_messages m
            JOIN social_dm_conversations c ON c.id = m.conversation_id
            WHERE m.sender_id != %s AND m.read_at IS NULL
              AND (c.user1_id = %s OR c.user2_id = %s);
            """,
            (usuario_id, usuario_id, usuario_id),
        )
        return cur.fetchone()[0]
    except Exception:
        logger.exception("Erro ao contar DMs nao lidas")
        return 0
    finally:
        if conn:
            conn.close()


def marcar_dm_como_lida(usuario_id: int, conversation_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT id FROM social_dm_conversations WHERE id = %s AND (user1_id = %s OR user2_id = %s);",
            (conversation_id, usuario_id, usuario_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
        cur.execute(
            """
            UPDATE social_dm_messages SET read_at = %s
            WHERE conversation_id = %s AND sender_id != %s AND read_at IS NULL
            RETURNING sender_id;
            """,
            (datetime.utcnow(), conversation_id, usuario_id),
        )
        updated_rows = cur.fetchall()
        conn.commit()
        if updated_rows:
            sender_id = updated_rows[0]["sender_id"]
            try:
                from backend.routes.social_ws import notify_user
                _fire_and_forget(notify_user(sender_id, "dm_read", {
                    "conversation_id": conversation_id,
                    "read_by": usuario_id,
                }))
            except Exception:
                pass
        return {"read": True, "count": len(updated_rows)}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erro ao marcar DMs como lidas")
        return {"read": False, "count": 0}
    finally:
        if conn:
            conn.close()


def buscar_posts_por_tag(tag: str, usuario_id: int, limit: int = 20, offset: int = 0):
    if not tag or not tag.strip():
        return []
    clean_tag = tag.strip().lstrip('#').lower()
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
                p.id, p.user_id, p.content, p.title, p.is_article, p.media, p.created_at,
                COALESCE(p.view_count, 0) AS view_count,
                COALESCE(p.tags, '{}'::text[]) AS tags,
                u.name, u.username,
                COALESCE(p.like_count, 0) AS like_count,
                COALESCE(p.comment_count, 0) AS comment_count,
                COALESCE(p.repost_count, 0) AS repost_count,
                (rp.post_id IS NOT NULL) AS reposted,
                (lk.post_id IS NOT NULL) AS liked,
            FROM social_posts p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN social_reposts rp ON rp.post_id = p.id AND rp.user_id = %s
            LEFT JOIN social_post_likes lk ON lk.post_id = p.id AND lk.user_id = %s
            WHERE %s = ANY(p.tags)
            ORDER BY p.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            (usuario_id, usuario_id, usuario_id, clean_tag, limit, offset),
        )
        rows = cur.fetchall()
        for row in rows:
            if isinstance(row.get("media"), str):
                try:
                    row["media"] = json.loads(row["media"])
                except Exception:
                    row["media"] = []
        return rows
    except Exception:
        logger.exception("Erro ao buscar posts por tag")
        raise HTTPException(status_code=500, detail="Erro ao buscar posts por tag.")
    finally:
        if conn:
            conn.close()


def listar_tendencias_explore(limit: int = 20, hours: int = 72):
    """Same as listar_tendencias but with larger defaults for explore page."""
    return listar_tendencias(limit=limit, hours=hours)


def alternar_block(usuario_id: int, target_id: int):
    if usuario_id == target_id:
        raise HTTPException(status_code=400, detail="Nao pode bloquear a si mesmo.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM users WHERE id = %s;", (target_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Usuario nao encontrado.")
        cur.execute(
            "SELECT id FROM social_blocks WHERE user_id = %s AND blocked_id = %s;",
            (usuario_id, target_id),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute("DELETE FROM social_blocks WHERE id = %s;", (existing["id"],))
            blocked = False
        else:
            cur.execute(
                "INSERT INTO social_blocks (user_id, blocked_id, created_at) VALUES (%s, %s, %s);",
                (usuario_id, target_id, datetime.utcnow()),
            )
            # Also unfollow each other
            cur.execute("DELETE FROM social_follows WHERE follower_id = %s AND following_id = %s;", (usuario_id, target_id))
            cur.execute("DELETE FROM social_follows WHERE follower_id = %s AND following_id = %s;", (target_id, usuario_id))
            blocked = True
        conn.commit()
        return {"blocked": blocked}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar block")
        raise HTTPException(status_code=500, detail="Erro ao bloquear usuario.")
    finally:
        if conn:
            conn.close()


def alternar_mute(usuario_id: int, target_id: int):
    if usuario_id == target_id:
        raise HTTPException(status_code=400, detail="Nao pode silenciar a si mesmo.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM users WHERE id = %s;", (target_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Usuario nao encontrado.")
        cur.execute(
            "SELECT id FROM social_mutes WHERE user_id = %s AND muted_id = %s;",
            (usuario_id, target_id),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute("DELETE FROM social_mutes WHERE id = %s;", (existing["id"],))
            muted = False
        else:
            cur.execute(
                "INSERT INTO social_mutes (user_id, muted_id, created_at) VALUES (%s, %s, %s);",
                (usuario_id, target_id, datetime.utcnow()),
            )
            muted = True
        conn.commit()
        return {"muted": muted}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erro ao alternar mute")
        raise HTTPException(status_code=500, detail="Erro ao silenciar usuario.")
    finally:
        if conn:
            conn.close()


def verificar_block_mute(usuario_id: int, target_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM social_blocks WHERE user_id = %s AND blocked_id = %s) AS is_blocked;",
            (usuario_id, target_id),
        )
        is_blocked = cur.fetchone()["is_blocked"]
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM social_mutes WHERE user_id = %s AND muted_id = %s) AS is_muted;",
            (usuario_id, target_id),
        )
        is_muted = cur.fetchone()["is_muted"]
        return {"is_blocked": is_blocked, "is_muted": is_muted}
    except Exception:
        logger.exception("Erro ao verificar block/mute")
        return {"is_blocked": False, "is_muted": False}
    finally:
        if conn:
            conn.close()


def criar_enquete(usuario_id: int, content: str, question: str, options: list[str], expires_hours: int = None):
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Pergunta obrigatoria.")
    if not options or len(options) < 2:
        raise HTTPException(status_code=400, detail="Minimo 2 opcoes.")
    if len(options) > 6:
        raise HTTPException(status_code=400, detail="Maximo 6 opcoes.")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Create the post
        cur.execute(
            """
            INSERT INTO social_posts (user_id, content, tags, created_at)
            VALUES (%s, %s, %s, %s) RETURNING id;
            """,
            (usuario_id, content.strip() if content else question.strip(), _extract_tags(content or question), datetime.utcnow()),
        )
        post_id = cur.fetchone()["id"]

        expires_at = None
        if expires_hours and expires_hours > 0:
            from datetime import timedelta
            expires_at = datetime.utcnow() + timedelta(hours=expires_hours)

        cur.execute(
            "INSERT INTO social_polls (post_id, question, expires_at) VALUES (%s, %s, %s) RETURNING id;",
            (post_id, question.strip(), expires_at),
        )
        poll_id = cur.fetchone()["id"]

        for i, opt_text in enumerate(options):
            if opt_text.strip():
                cur.execute(
                    "INSERT INTO social_poll_options (poll_id, text, position) VALUES (%s, %s, %s);",
                    (poll_id, opt_text.strip(), i),
                )
        conn.commit()
        return buscar_post(post_id, usuario_id)
    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception:
        if conn: conn.rollback()
        logger.exception("Erro ao criar enquete")
        raise HTTPException(status_code=500, detail="Erro ao criar enquete.")
    finally:
        if conn: conn.close()


def votar_enquete(usuario_id: int, poll_id: int, option_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, expires_at FROM social_polls WHERE id = %s;", (poll_id,))
        poll = cur.fetchone()
        if not poll:
            raise HTTPException(status_code=404, detail="Enquete nao encontrada.")
        if poll["expires_at"] and poll["expires_at"] < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Enquete encerrada.")
        cur.execute(
            "SELECT id FROM social_poll_options WHERE id = %s AND poll_id = %s;",
            (option_id, poll_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Opcao nao encontrada.")
        # Check if already voted
        cur.execute(
            "SELECT id FROM social_poll_votes WHERE poll_id = %s AND user_id = %s;",
            (poll_id, usuario_id),
        )
        existing = cur.fetchone()
        if existing:
            # Change vote
            cur.execute(
                "UPDATE social_poll_votes SET option_id = %s WHERE id = %s;",
                (option_id, existing["id"]),
            )
        else:
            cur.execute(
                "INSERT INTO social_poll_votes (poll_id, option_id, user_id, created_at) VALUES (%s, %s, %s, %s);",
                (poll_id, option_id, usuario_id, datetime.utcnow()),
            )
        conn.commit()
        return obter_enquete(poll_id, usuario_id)
    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception:
        if conn: conn.rollback()
        logger.exception("Erro ao votar")
        raise HTTPException(status_code=500, detail="Erro ao votar.")
    finally:
        if conn: conn.close()


def obter_enquete(poll_id: int, usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, post_id, question, expires_at FROM social_polls WHERE id = %s;", (poll_id,))
        poll = cur.fetchone()
        if not poll:
            return None
        cur.execute(
            """
            SELECT o.id, o.text, o.position,
                   COUNT(v.id) AS vote_count
            FROM social_poll_options o
            LEFT JOIN social_poll_votes v ON v.option_id = o.id
            WHERE o.poll_id = %s
            GROUP BY o.id, o.text, o.position
            ORDER BY o.position;
            """,
            (poll_id,),
        )
        options = cur.fetchall()
        total_votes = sum(o["vote_count"] for o in options)
        cur.execute(
            "SELECT option_id FROM social_poll_votes WHERE poll_id = %s AND user_id = %s;",
            (poll_id, usuario_id),
        )
        vote_row = cur.fetchone()
        user_vote = vote_row["option_id"] if vote_row else None
        expired = bool(poll["expires_at"] and poll["expires_at"] < datetime.utcnow())
        return {
            "id": poll["id"],
            "post_id": poll["post_id"],
            "question": poll["question"],
            "expires_at": str(poll["expires_at"]) if poll["expires_at"] else None,
            "expired": expired,
            "options": [
                {
                    "id": o["id"],
                    "text": o["text"],
                    "vote_count": o["vote_count"],
                    "percentage": round(o["vote_count"] / total_votes * 100) if total_votes > 0 else 0,
                }
                for o in options
            ],
            "total_votes": total_votes,
            "user_vote": user_vote,
        }
    except Exception:
        logger.exception("Erro ao obter enquete")
        return None
    finally:
        if conn: conn.close()


def obter_enquete_por_post(post_id: int, usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM social_polls WHERE post_id = %s;", (post_id,))
        row = cur.fetchone()
        if not row:
            return None
        return obter_enquete(row["id"], usuario_id)
    except Exception:
        return None
    finally:
        if conn: conn.close()


def obter_prefs_notificacao(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM social_notification_prefs WHERE user_id = %s;", (usuario_id,))
        row = cur.fetchone()
        if not row:
            return {
                "like_enabled": True, "comment_enabled": True, "follow_enabled": True,
                "article_enabled": True, "repost_enabled": True, "quote_enabled": True,
            }
        return {
            "like_enabled": row["like_enabled"],
            "comment_enabled": row["comment_enabled"],
            "follow_enabled": row["follow_enabled"],
            "article_enabled": row["article_enabled"],
            "repost_enabled": row["repost_enabled"],
            "quote_enabled": row["quote_enabled"],
        }
    except Exception:
        logger.exception("Erro ao obter prefs notificacao")
        return {"like_enabled": True, "comment_enabled": True, "follow_enabled": True, "article_enabled": True, "repost_enabled": True, "quote_enabled": True}
    finally:
        if conn: conn.close()


def atualizar_prefs_notificacao(usuario_id: int, prefs: dict):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM social_notification_prefs WHERE user_id = %s;", (usuario_id,))
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                UPDATE social_notification_prefs SET
                    like_enabled = %s, comment_enabled = %s, follow_enabled = %s,
                    article_enabled = %s, repost_enabled = %s, quote_enabled = %s
                WHERE user_id = %s;
                """,
                (
                    prefs.get("like_enabled", True), prefs.get("comment_enabled", True),
                    prefs.get("follow_enabled", True), prefs.get("article_enabled", True),
                    prefs.get("repost_enabled", True), prefs.get("quote_enabled", True),
                    usuario_id,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO social_notification_prefs
                    (user_id, like_enabled, comment_enabled, follow_enabled, article_enabled, repost_enabled, quote_enabled)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    usuario_id,
                    prefs.get("like_enabled", True), prefs.get("comment_enabled", True),
                    prefs.get("follow_enabled", True), prefs.get("article_enabled", True),
                    prefs.get("repost_enabled", True), prefs.get("quote_enabled", True),
                ),
            )
        conn.commit()
        return obter_prefs_notificacao(usuario_id)
    except Exception:
        if conn: conn.rollback()
        logger.exception("Erro ao atualizar prefs notificacao")
        raise HTTPException(status_code=500, detail="Erro ao salvar preferencias.")
    finally:
        if conn: conn.close()


def obter_analytics_post(usuario_id: int, post_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, user_id FROM social_posts WHERE id = %s;", (post_id,))
        post = cur.fetchone()
        if not post:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")
        if post["user_id"] != usuario_id:
            raise HTTPException(status_code=403, detail="Sem permissao.")

        cur.execute("SELECT COALESCE(view_count, 0) AS views FROM social_posts WHERE id = %s;", (post_id,))
        views = cur.fetchone()["views"]

        cur.execute("SELECT COUNT(*) AS total FROM social_post_likes WHERE post_id = %s;", (post_id,))
        likes = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) AS total FROM social_post_comments WHERE post_id = %s;", (post_id,))
        comments = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) AS total FROM social_reposts WHERE post_id = %s;", (post_id,))
        reposts = cur.fetchone()["total"]

        # Engagement rate = (likes + comments + reposts) / views * 100
        total_engagement = likes + comments + reposts
        engagement_rate = round(total_engagement / views * 100, 1) if views > 0 else 0

        return {
            "post_id": post_id,
            "views": views,
            "likes": likes,
            "comments": comments,
            "reposts": reposts,
            "engagement_rate": engagement_rate,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erro ao obter analytics")
        raise HTTPException(status_code=500, detail="Erro ao obter analytics.")
    finally:
        if conn: conn.close()


def obter_analytics_usuario(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT COUNT(*) AS total FROM social_posts WHERE user_id = %s;", (usuario_id,))
        total_posts = cur.fetchone()["total"]

        cur.execute(
            "SELECT COALESCE(SUM(view_count), 0) AS total FROM social_posts WHERE user_id = %s;",
            (usuario_id,),
        )
        total_views = cur.fetchone()["total"]

        cur.execute(
            """
            SELECT COUNT(*) AS total FROM social_post_likes pl
            JOIN social_posts p ON p.id = pl.post_id
            WHERE p.user_id = %s;
            """,
            (usuario_id,),
        )
        total_likes = cur.fetchone()["total"]

        cur.execute(
            """
            SELECT COUNT(*) AS total FROM social_post_comments c
            JOIN social_posts p ON p.id = c.post_id
            WHERE p.user_id = %s AND c.user_id != %s;
            """,
            (usuario_id, usuario_id),
        )
        total_comments = cur.fetchone()["total"]

        cur.execute(
            """
            SELECT COUNT(*) AS total FROM social_reposts r
            JOIN social_posts p ON p.id = r.post_id
            WHERE p.user_id = %s AND r.user_id != %s;
            """,
            (usuario_id, usuario_id),
        )
        total_reposts = cur.fetchone()["total"]

        cur.execute(
            """
            SELECT p.id, p.content, p.title, COALESCE(p.view_count, 0) AS views,
                   COALESCE(p.like_count, 0) AS likes
            FROM social_posts p
            WHERE p.user_id = %s
            ORDER BY COALESCE(p.like_count, 0) DESC
            LIMIT 5;
            """,
            (usuario_id,),
        )
        top_posts = cur.fetchall()

        return {
            "total_posts": total_posts,
            "total_views": int(total_views),
            "total_likes": total_likes,
            "total_comments": total_comments,
            "total_reposts": total_reposts,
            "top_posts": top_posts,
        }
    except Exception:
        logger.exception("Erro ao obter analytics usuario")
        raise HTTPException(status_code=500, detail="Erro ao obter analytics.")
    finally:
        if conn: conn.close()



def buscar_usuarios(query: str, usuario_id: int, limit: int = 5):
    if not query or not query.strip():
        return []
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        term = f"%{query.strip().lower()}%"
        cur.execute(
            """
            SELECT u.id, u.name, u.username,
                   COALESCE(u.is_ai, FALSE) AS is_ai,
                   COALESCE(u.is_founder, FALSE) AS is_founder,
                   (sf.id IS NOT NULL) AS following
            FROM users u
            LEFT JOIN social_follows sf ON sf.follower_id = %s AND sf.following_id = u.id
            WHERE (LOWER(u.name) LIKE %s OR LOWER(u.username) LIKE %s)
            AND u.id != %s
            ORDER BY (sf.id IS NOT NULL) DESC, u.name
            LIMIT %s;
            """,
            (usuario_id, term, term, usuario_id, limit),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        logger.exception("Erro ao buscar usuarios")
        return []
    finally:
        if conn:
            conn.close()


def alternar_pin_post(usuario_id: int, post_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT user_id, pinned FROM social_posts WHERE id = %s;", (post_id,))
        post = cur.fetchone()
        if not post:
            raise HTTPException(status_code=404, detail="Post nao encontrado.")
        if post["user_id"] != usuario_id:
            raise HTTPException(status_code=403, detail="Apenas o autor pode fixar o post.")
        new_pinned = not post.get("pinned", False)
        # If pinning, unpin any other pinned post by this user
        if new_pinned:
            cur.execute("UPDATE social_posts SET pinned = FALSE WHERE user_id = %s AND pinned = TRUE;", (usuario_id,))
        cur.execute("UPDATE social_posts SET pinned = %s WHERE id = %s;", (new_pinned, post_id))
        conn.commit()
        return {"pinned": new_pinned}
    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception:
        if conn: conn.rollback()
        logger.exception("Erro ao fixar post")
        raise HTTPException(status_code=500, detail="Erro ao fixar post.")
    finally:
        if conn: conn.close()


# ==========================================================
# Streak de postagem
# ==========================================================
def obter_streak_usuario(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT created_at::date AS day
            FROM social_posts
            WHERE user_id = %s
            ORDER BY day DESC
            LIMIT 90;
        """, (usuario_id,))
        days = [row[0] for row in cur.fetchall()]
        if not days:
            return {"streak": 0, "max_streak": 0, "total_days": 0}
        from datetime import date, timedelta
        today = date.today()
        streak = 0
        check = today
        # Se não postou hoje, começa de ontem
        if days[0] < today:
            check = today - timedelta(days=1)
            if days[0] < check:
                return {"streak": 0, "max_streak": _max_streak(days), "total_days": len(days)}
        day_set = set(days)
        while check in day_set:
            streak += 1
            check -= timedelta(days=1)
        return {"streak": streak, "max_streak": _max_streak(days), "total_days": len(days)}
    except Exception:
        logger.exception("Erro ao obter streak")
        return {"streak": 0, "max_streak": 0, "total_days": 0}
    finally:
        if conn:
            conn.close()


def _max_streak(days):
    if not days:
        return 0
    from datetime import timedelta
    sorted_days = sorted(set(days))
    max_s = 1
    current = 1
    for i in range(1, len(sorted_days)):
        if sorted_days[i] - sorted_days[i - 1] == timedelta(days=1):
            current += 1
            max_s = max(max_s, current)
        else:
            current = 1
    return max_s


# ==========================================================
# Post da semana (mais curtido nos últimos 7 dias)
# ==========================================================
def obter_post_da_semana(viewer_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT p.id, p.content, p.title, p.is_article, p.like_count, p.comment_count,
                   p.created_at, p.user_id,
                   u.name, u.username, u.photo, u.photo_mime,
                   COALESCE(u.is_founder, FALSE) AS is_founder
            FROM social_posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.created_at >= NOW() - INTERVAL '7 days'
              AND p.like_count > 0
            ORDER BY p.like_count DESC, p.comment_count DESC
            LIMIT 1;
        """)
        post = cur.fetchone()
        if post:
            post = dict(post)
            _encode_photo(post)
        return post
    except Exception:
        logger.exception("Erro ao obter post da semana")
        return None
    finally:
        if conn:
            conn.close()


# ==========================================================
# Milestones / Conquistas
# ==========================================================
MILESTONES = [
    {"key": "first_post", "label": "Primeiro Post!", "icon": "pen", "check": "posts >= 1"},
    {"key": "10_posts", "label": "10 Posts", "icon": "fire", "check": "posts >= 10"},
    {"key": "50_posts", "label": "50 Posts", "icon": "star", "check": "posts >= 50"},
    {"key": "first_like", "label": "Primeira Curtida Recebida", "icon": "heart", "check": "likes_received >= 1"},
    {"key": "10_likes", "label": "10 Curtidas Recebidas", "icon": "heart", "check": "likes_received >= 10"},
    {"key": "50_likes", "label": "50 Curtidas Recebidas", "icon": "trophy", "check": "likes_received >= 50"},
    {"key": "first_follower", "label": "Primeiro Seguidor", "icon": "users", "check": "followers >= 1"},
    {"key": "5_followers", "label": "5 Seguidores", "icon": "users", "check": "followers >= 5"},
    {"key": "streak_3", "label": "3 Dias Consecutivos", "icon": "flame", "check": "streak >= 3"},
    {"key": "streak_7", "label": "Semana Perfeita", "icon": "flame", "check": "streak >= 7"},
]


def obter_milestones_usuario(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM social_posts WHERE user_id = %s;", (usuario_id,))
        posts = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(like_count), 0) FROM social_posts WHERE user_id = %s;", (usuario_id,))
        likes_received = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM social_follows WHERE following_id = %s;", (usuario_id,))
        followers = cur.fetchone()[0]
        streak_data = obter_streak_usuario(usuario_id)
        streak = streak_data["streak"]
        max_streak = streak_data["max_streak"]

        ctx = {"posts": posts, "likes_received": likes_received, "followers": followers,
               "streak": max(streak, max_streak)}
        result = []
        for m in MILESTONES:
            achieved = eval(m["check"], {"__builtins__": {}}, ctx)
            result.append({"key": m["key"], "label": m["label"], "icon": m["icon"], "achieved": achieved})
        return {"milestones": result, "stats": ctx}
    except Exception:
        logger.exception("Erro ao obter milestones")
        return {"milestones": [], "stats": {}}
    finally:
        if conn:
            conn.close()


# ==========================================================
# Reações expandidas em posts
# ==========================================================
VALID_REACTIONS = {"useful", "genius", "agree", "love", "fire"}


def alternar_reacao_post(usuario_id: int, post_id: int, reaction: str):
    if reaction not in VALID_REACTIONS:
        raise HTTPException(status_code=400, detail=f"Reação inválida. Válidas: {', '.join(VALID_REACTIONS)}")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM social_posts WHERE id = %s;", (post_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Post não encontrado.")
        cur.execute(
            "SELECT id FROM social_post_reactions WHERE post_id = %s AND user_id = %s AND reaction = %s;",
            (post_id, usuario_id, reaction),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute("DELETE FROM social_post_reactions WHERE id = %s;", (existing["id"],))
            conn.commit()
        else:
            cur.execute(
                "INSERT INTO social_post_reactions (post_id, user_id, reaction) VALUES (%s, %s, %s);",
                (post_id, usuario_id, reaction),
            )
            conn.commit()
        # Return current reactions for this post
        return _get_post_reactions(cur, post_id, usuario_id)
    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception:
        if conn: conn.rollback()
        logger.exception("Erro ao reagir ao post")
        raise HTTPException(status_code=500, detail="Erro ao reagir.")
    finally:
        if conn: conn.close()


def _get_post_reactions(cur, post_id, viewer_id):
    cur.execute("""
        SELECT reaction, COUNT(*) AS count,
               BOOL_OR(user_id = %s) AS user_reacted
        FROM social_post_reactions
        WHERE post_id = %s
        GROUP BY reaction;
    """, (viewer_id, post_id))
    rows = cur.fetchall()
    return {row["reaction"]: {"count": row["count"], "user_reacted": row["user_reacted"]} for row in rows}


def obter_reacoes_post(post_id: int, viewer_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        return _get_post_reactions(cur, post_id, viewer_id)
    except Exception:
        return {}
    finally:
        if conn: conn.close()
