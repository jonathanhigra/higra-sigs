# -*- coding: utf-8 -*-
"""
Módulo de conexão com o banco de dados PostgreSQL.
Usa connection pool para reutilizar conexões (evita overhead de TCP handshake).
"""

import psycopg2
from contextlib import contextmanager
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
import os
import threading
from urllib.parse import parse_qsl, urlparse
from backend.core.config import logger


# ==========================================================
# Função auxiliar de sanitização
# ==========================================================
def sanitize_utf8(value):
    if value is None:
        return None
    try:
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="ignore")
        return str(value).encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return str(value)


# ==========================================================
# Connection Pool (ThreadedConnectionPool do psycopg2)
# ==========================================================
_pool = None
_pool_lock = threading.Lock()
_LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _safe_int(value, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default


def _is_local_db_host(host) -> bool:
    return str(host or "").strip().lower() in _LOCAL_DB_HOSTS


def _normalize_sslmode(value):
    text = str(value or "").strip()
    if not text:
        return None

    normalized = text.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return "require"
    if normalized in {"0", "false", "no", "off"}:
        return "disable"
    return text


def _resolve_sslmode(connection_host, env=None):
    env = env or os.environ

    explicit_sslmode = _normalize_sslmode(env.get("DB_SSLMODE"))
    if explicit_sslmode:
        return explicit_sslmode

    explicit_db_ssl = _normalize_sslmode(env.get("DB_SSL"))
    if explicit_db_ssl:
        return explicit_db_ssl

    remote_tunnel_host = str(env.get("DB_TUNNEL_REMOTE_HOST") or env.get("RDS_HOST") or "").strip().lower()
    if _is_local_db_host(connection_host) and remote_tunnel_host and not _is_local_db_host(remote_tunnel_host):
        return "require"

    return "disable" if _is_local_db_host(connection_host) else "require"


def build_db_connection_params(env=None):
    env = env or os.environ
    database_url = str(env.get("DATABASE_URL") or "").strip()
    connect_timeout = _safe_int(env.get("DB_CONNECT_TIMEOUT", "5"), 5)

    if database_url:
        parsed = urlparse(database_url)
        query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
        db_params = {
            "dsn": database_url,
            "connect_timeout": connect_timeout,
        }
        if "sslmode" not in query_params:
            db_params["sslmode"] = _resolve_sslmode(parsed.hostname or "", env)
        return db_params

    db_params = {
        "host": sanitize_utf8(env.get("DB_HOST", "localhost")),
        "port": sanitize_utf8(env.get("DB_PORT", "5432")),
        "user": sanitize_utf8(env.get("DB_USER", "postgres")),
        "password": sanitize_utf8(env.get("DB_PASSWORD", "higra123")),
        "dbname": sanitize_utf8(env.get("DB_NAME", "higra_sigs")),
    }
    db_params["client_encoding"] = "UTF8"
    db_params["connect_timeout"] = connect_timeout
    db_params["sslmode"] = _resolve_sslmode(db_params["host"], env)
    return db_params


def _get_db_params():
    return build_db_connection_params()


def get_table_columns(conn, table_name: str, schema: str = "public") -> set[str]:
    """Retorna o conjunto de colunas existentes para a tabela informada."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            """,
            (schema, table_name),
        )
        return {row[0] for row in cur.fetchall()}


def ensure_table_columns(conn, table_name: str, columns: list[tuple[str, str]], schema: str = "public") -> set[str]:
    """Adiciona apenas colunas ausentes, evitando DDL desnecessário em runtime/startup."""
    existing = get_table_columns(conn, table_name, schema=schema)
    if not existing:
        return existing

    qualified_table = f"{schema}.{table_name}" if schema else table_name
    with conn.cursor() as cur:
        for column_name, ddl in columns:
            if column_name in existing:
                continue
            cur.execute(f"ALTER TABLE {qualified_table} ADD COLUMN IF NOT EXISTS {ddl};")
            existing.add(column_name)
    return existing


def _get_pool():
    global _pool
    if _pool and not _pool.closed:
        return _pool
    with _pool_lock:
        if _pool and not _pool.closed:
            return _pool
        db_params = _get_db_params()
        min_conn = int(os.getenv("DB_POOL_MIN", "2"))
        max_conn = int(os.getenv("DB_POOL_MAX", "10"))
        _pool = ThreadedConnectionPool(min_conn, max_conn, **db_params)
        logger.info(f"Connection pool criado (min={min_conn}, max={max_conn})")
        return _pool


class _PooledConnection:
    """Wrapper que devolve a conexão ao pool quando close() é chamado."""

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool
        self._returned = False

    def close(self):
        if not self._returned:
            self._returned = True
            try:
                self._pool.putconn(self._conn)
            except Exception:
                pass

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# ==========================================================
# Função principal de conexão (interface compatível)
# ==========================================================
def get_db_connection():
    """
    Retorna uma conexão do pool. Chamar conn.close() devolve ao pool.
    Compatível com todo o código existente que usa get_db_connection().
    """
    try:
        pool = _get_pool()
        conn = pool.getconn()
        return _PooledConnection(conn, pool)
    except Exception:
        # Fallback: conexão direta se o pool falhar
        logger.warning("Pool indisponível, criando conexão direta")
        db_params = _get_db_params()
        return psycopg2.connect(**db_params)


def connect_db_direct():
    """Retorna uma conexão direta, sem usar o pool."""
    db_params = _get_db_params()
    return psycopg2.connect(**db_params)


@contextmanager
def db_cursor():
    """Context manager que fornece (conn, cur) com auto-commit/rollback/close.

    Uso:
        with db_cursor() as (conn, cur):
            cur.execute("SELECT ...")
            rows = cur.fetchall()
        # commit automático; rollback em caso de exceção
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        yield conn, cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ==========================================================
# Função auxiliar para testes de conexão
# ==========================================================
def test_connection():
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT NOW() AS servidor_hora;")
            result = cur.fetchone()
            logger.info(f"Conexão ao banco bem-sucedida. Hora do servidor: {result['servidor_hora']}")
    except Exception as e:
        logger.error(f"Falha ao testar conexão: {e}")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    test_connection()
