# -*- coding: utf-8 -*-
"""
Helpers para respostas de erro explicitas e padronizadas via HTTP.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timezone
from http import HTTPStatus
from socket import gaierror
from typing import Any

from fastapi import HTTPException

try:
    import psycopg2
except Exception:  # pragma: no cover - dependencia opcional em alguns ambientes
    psycopg2 = None

try:
    import httpx
except Exception:  # pragma: no cover - dependencia opcional em alguns ambientes
    httpx = None

_DB_UNAVAILABLE_EXCEPTIONS = (
    (psycopg2.OperationalError, psycopg2.InterfaceError)
    if psycopg2 is not None
    else ()
)
_DB_ERROR_EXCEPTIONS = (psycopg2.DatabaseError,) if psycopg2 is not None else ()
_HTTP_TIMEOUT_EXCEPTIONS = (httpx.TimeoutException,) if httpx is not None else ()
_HTTP_STATUS_EXCEPTION = httpx.HTTPStatusError if httpx is not None else None


def _extract_detail_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail.strip()

    if isinstance(detail, dict):
        for key in ("detail", "message", "error", "title"):
            value = detail.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    if isinstance(detail, list):
        items: list[str] = []
        for item in detail:
            if isinstance(item, str) and item.strip():
                items.append(item.strip())
                continue
            if isinstance(item, dict):
                loc = item.get("loc")
                loc_txt = ".".join(str(part) for part in loc) if isinstance(loc, list) else ""
                msg = item.get("msg") or item.get("message") or str(item)
                msg_txt = str(msg).strip()
                if msg_txt:
                    items.append(f"{loc_txt}: {msg_txt}" if loc_txt else msg_txt)
                continue
            text = str(item).strip()
            if text:
                items.append(text)
        return " | ".join(items)

    if detail is None:
        return ""

    return str(detail).strip()


def _to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (datetime, date, time)):
        return value.isoformat()

    if isinstance(value, dict):
        return {str(k): _to_jsonable(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_to_jsonable(v) for v in value]

    return str(value)


def extract_error_message(exc: Any) -> str:
    if isinstance(exc, HTTPException):
        detail_text = _extract_detail_message(exc.detail)
        return detail_text or "HTTPException sem detalhe textual."

    if isinstance(exc, Exception):
        text = str(exc).strip()
        return text or exc.__class__.__name__

    text = str(exc).strip()
    return text or "Erro desconhecido."


def build_error_detail(context: str, exc: Any) -> str:
    return f"{context}: {extract_error_message(exc)}"


def _resolve_http_title(status_code: int, provided_title: str | None) -> str:
    if isinstance(provided_title, str) and provided_title.strip():
        return provided_title.strip()
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "HTTP Error"


def build_http_problem(
    status_code: int,
    *,
    detail: Any = None,
    title: str | None = None,
    path: str | None = None,
    error_code: str | None = None,
    extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Gera payload no padrao HTTP Problem Details (RFC 7807-like).
    Mantem `detail` textual para compatibilidade com clientes atuais.
    """
    detail_safe = _to_jsonable(detail)
    detail_text = _extract_detail_message(detail_safe) or "Erro inesperado."

    payload: dict[str, Any] = {
        "type": f"https://httpstatuses.com/{status_code}",
        "title": _resolve_http_title(status_code, title),
        "status": status_code,
        "detail": detail_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if path:
        payload["path"] = path

    if error_code:
        payload["error_code"] = error_code

    if isinstance(detail_safe, list):
        payload["errors"] = detail_safe
    elif isinstance(detail_safe, dict):
        # Preserva dados estruturados complementares sem sobrescrever campos canonicos.
        for key, value in detail_safe.items():
            if key not in payload:
                payload[key] = value

    if extras:
        extras_safe = _to_jsonable(extras)
        for key, value in extras_safe.items():
            if key not in payload:
                payload[key] = value

    return payload


def classify_runtime_exception(exc: Exception) -> tuple[int, str, str, dict[str, Any]]:
    """
    Classifica excecoes para respostas HTTP Problem mais explicitas.

    Retorno:
    - status_code
    - error_code
    - detail (mensagem para cliente)
    - extras (campos complementares)
    """
    error_type = exc.__class__.__name__
    message = extract_error_message(exc)

    if _DB_UNAVAILABLE_EXCEPTIONS and isinstance(exc, _DB_UNAVAILABLE_EXCEPTIONS):
        return (
            503,
            "database_unavailable",
            "Banco de dados indisponivel ou conexao falhou.",
            {"exception_type": error_type, "exception_message": message},
        )

    if _DB_ERROR_EXCEPTIONS and isinstance(exc, _DB_ERROR_EXCEPTIONS):
        return (
            500,
            "database_error",
            "Erro interno ao processar operacao no banco de dados.",
            {"exception_type": error_type, "exception_message": message},
        )

    if _HTTP_TIMEOUT_EXCEPTIONS and isinstance(exc, _HTTP_TIMEOUT_EXCEPTIONS):
        return (
            504,
            "upstream_timeout",
            "Tempo limite excedido ao consultar servico externo.",
            {"exception_type": error_type, "exception_message": message},
        )

    if _HTTP_STATUS_EXCEPTION is not None and isinstance(exc, _HTTP_STATUS_EXCEPTION):
        upstream_status = getattr(getattr(exc, "response", None), "status_code", None)
        detail = "Servico externo retornou erro HTTP."
        if upstream_status:
            detail = f"Servico externo retornou erro HTTP {upstream_status}."
        extras: dict[str, Any] = {"exception_type": error_type, "exception_message": message}
        if upstream_status is not None:
            extras["upstream_status"] = upstream_status
        return (502, "upstream_http_error", detail, extras)

    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return (
            504,
            "timeout",
            "Tempo limite excedido durante o processamento da requisicao.",
            {"exception_type": error_type, "exception_message": message},
        )

    if isinstance(exc, gaierror):
        return (
            502,
            "dns_resolution_error",
            "Falha de resolucao DNS ao acessar servico externo.",
            {"exception_type": error_type, "exception_message": message},
        )

    return (
        500,
        "internal_server_error",
        f"Erro interno do servidor ({error_type}).",
        {"exception_type": error_type, "exception_message": message},
    )
