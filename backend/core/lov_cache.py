# -*- coding: utf-8 -*-
"""Cache in-memory para LOVs com TTL (task 193).

Simula Redis stale-while-revalidate sem dependência externa.
TTL padrão: 1 hora. Threads-safe via threading.Lock.

Uso em endpoints:
    from backend.core.lov_cache import lov_cache

    @router.get("/config/tipos-teste")
    async def listar_tipos_teste(usuario_id: int = Depends(require_user)):
        cached = lov_cache.get("tipos_teste")
        if cached is not None:
            return cached
        # ... fetch from DB ...
        result = {"items": rows}
        lov_cache.set("tipos_teste", result)
        return result
"""

import threading
import time
from typing import Any, Optional

_DEFAULT_TTL = 3600  # 1 hora


class _LovCache:
    def __init__(self, ttl: int = _DEFAULT_TTL):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self._ttl = ttl

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, ts = entry
            if time.time() - ts > self._ttl:
                # Stale — remove e força recarregamento
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = (value, time.time())

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def invalidate_all(self) -> None:
        with self._lock:
            self._store.clear()


# Instância global — importar em qualquer módulo
lov_cache = _LovCache()
