# -*- coding: utf-8 -*-
"""
Utilidades de autenticação JWT para REST e WebSocket.
Inclui geração de tokens, verificação de senha, dependências FastAPI e autenticação WS.
"""

import re
import jwt
import bcrypt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status, WebSocket, WebSocketException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.core.config import logger, JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRES_MINUTES

# Esquema Bearer para rotas REST
bearer_scheme = HTTPBearer()

# ============================================================
#  JWT - Geração de Token
# ============================================================
def criar_token(usuario_id: int) -> str:
    try:
        exp = datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MINUTES)
        payload = {"sub": str(usuario_id), "exp": exp}
        token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

        logger.info(f"Token JWT criado | expiração: {exp.isoformat()}")
        return token
    except Exception as e:
        logger.error(f"Erro ao criar token JWT: {e}")
        raise


# ============================================================
#  JWT - Decodificação
# ============================================================
def decodificar_token(token: str):
    try:
        dados = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        usuario_id = dados.get("sub")
        if usuario_id is None:
            return None
        return int(usuario_id)
    except jwt.ExpiredSignatureError:
        logger.warning("Token expirado")
        return None
    except jwt.InvalidTokenError:
        logger.warning("Token inválido")
        return None
    except Exception as e:
        logger.error(f"Erro inesperado ao decodificar token: {e}")
        return None


# ============================================================
#  Verificação de senha (bcrypt)
# ============================================================
def verificar_senha(password: str, password_hash: bytes) -> bool:
    try:
        if isinstance(password_hash, str):
            password_hash = password_hash.encode("utf-8")
        return bcrypt.checkpw(password.encode("utf-8"), password_hash)
    except Exception as e:
        logger.error(f"Erro ao verificar senha: {e}")
        return False


# ============================================================
#  Dependência FastAPI para rotas REST (JWT no header Authorization)
# ============================================================
async def require_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    token = credentials.credentials
    usuario_id = decodificar_token(token)
    if not usuario_id:
        logger.warning("Acesso negado: token inválido ou expirado")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return usuario_id


# ============================================================
#  WebSocket - Autenticação via query param ?token=
# ============================================================
async def authenticate_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        logger.warning("WebSocket rejeitado: token não fornecido")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    usuario_id = decodificar_token(token)
    if not usuario_id:
        logger.warning("WebSocket rejeitado: token inválido")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    logger.info(f"WebSocket autenticado | usuario_id={usuario_id}")
    return usuario_id


# ============================================================
#  Verificação de admin/fundador
# ============================================================
def verificar_admin(user_id: int) -> bool:
    from backend.database import get_db_connection
    from psycopg2.extras import RealDictCursor
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT is_admin FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        return bool(user and user["is_admin"])
    finally:
        cur.close()
        conn.close()


def verificar_fundador(user_id: int) -> bool:
    from backend.database import get_db_connection
    from psycopg2.extras import RealDictCursor
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT is_founder FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        return bool(user and user["is_founder"])
    finally:
        cur.close()
        conn.close()


# ============================================================
#  Validação de senha
# ============================================================
def validate_password(password: str) -> None:
    """Valida força da senha. Levanta ValueError se inválida."""
    errors = []
    if len(password) < 8:
        errors.append("mínimo 8 caracteres")
    if not re.search(r"[A-Z]", password):
        errors.append("pelo menos 1 letra maiúscula")
    if not re.search(r"[a-z]", password):
        errors.append("pelo menos 1 letra minúscula")
    if not re.search(r"\d", password):
        errors.append("pelo menos 1 dígito")
    if errors:
        raise ValueError(f"Senha fraca: {', '.join(errors)}")


# ============================================================
#  Token refresh — decodifica tokens expirados (grace period)
# ============================================================
REFRESH_GRACE_DAYS = 7

def decodificar_token_allow_expired(token: str):
    """Decodifica token mesmo expirado, desde que dentro do grace period."""
    try:
        dados = jwt.decode(
            token, JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        usuario_id = dados.get("sub")
        if usuario_id is None:
            return None
        exp = dados.get("exp")
        if exp:
            expired_at = datetime.utcfromtimestamp(exp)
            if datetime.utcnow() - expired_at > timedelta(days=REFRESH_GRACE_DAYS):
                logger.warning("Token expirado além do grace period de %d dias", REFRESH_GRACE_DAYS)
                return None
        return int(usuario_id)
    except jwt.InvalidTokenError:
        logger.warning("Token inválido no refresh")
        return None
    except Exception as e:
        logger.error("Erro ao decodificar token para refresh: %s", e)
        return None


async def require_user_for_refresh(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    """Dependency para /auth/refresh — aceita tokens expirados dentro do grace period."""
    token = credentials.credentials
    usuario_id = decodificar_token_allow_expired(token)
    if not usuario_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado além do período de renovação",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return usuario_id