# -*- coding: utf-8 -*-
"""Rate limiter global (slowapi) com suporte a limite por usuário (task 194).

O projeto usa PyJWT (pacote `jwt`), NÃO python-jose.
"""

import os
import jwt  # PyJWT
from slowapi import Limiter
from slowapi.util import get_remote_address

# Usa o mesmo segredo/algoritmo do resto do backend (backend.auth.utils)
_SECRET = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or ""
_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")


def _get_user_or_ip(request) -> str:
    """Chave de rate limit: user_id do JWT ou IP fallback.
    Limita por usuário autenticado — evita contornar com múltiplos IPs.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and _SECRET:
        try:
            payload = jwt.decode(auth[7:], _SECRET, algorithms=[_ALGORITHM])
            uid = payload.get("sub") or payload.get("user_id")
            if uid:
                return f"user:{uid}"
        except Exception:
            pass
    return get_remote_address(request)


# Limiter padrão por IP (endpoints públicos)
limiter = Limiter(key_func=get_remote_address)

# Limiter por usuário autenticado (endpoints sensíveis)
user_limiter = Limiter(key_func=_get_user_or_ip)
