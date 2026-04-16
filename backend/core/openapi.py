# -*- coding: utf-8 -*-
"""
Customizacoes do OpenAPI/Swagger da API.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

from backend.auth.utils import require_user


OPENAPI_TAGS = [
    {"name": "Autenticação e Usuários", "description": "Cadastro, login e perfil de usuarios."},
    {"name": "Autenticação", "description": "Rotas de autenticacao JWT."},
    {"name": "Historico", "description": "Historico de conversas, mensagens e fallbacks."},
    {"name": "Seletor Histórico", "description": "Consulta/salvamento de historico do seletor de bombas."},
    {"name": "Historico Perda de Carga", "description": "Historico de calculos de perda de carga."},
    {"name": "Historico NPSH", "description": "Historico de calculos NPSH."},
    {"name": "Catalogo Componentes", "description": "CRUD do catalogo de componentes hidraulicos."},
    {"name": "Social", "description": "Feed, posts, comentarios, comunidades e mensagens."},
    {"name": "Convites", "description": "Fluxo de convites e aceitacao de convite."},
    {"name": "Arquimedes IA", "description": "Automacoes e operacoes da conta Arquimedes."},
    {"name": "Documentos", "description": "Upload e indexacao de documentos para RAG."},
]


API_DESCRIPTION = """
API oficial do HIGRA Sigs.

## Autenticacao
- As rotas protegidas exigem header `Authorization: Bearer <token>`.
- Gere o token em `/auth/login`.

## Erros HTTP
- As respostas de erro seguem padrao unico com campos:
  - `type`, `title`, `status`, `detail`, `timestamp`, `path`
"""


def _route_requires_bearer(route: APIRoute) -> bool:
    for dep in route.dependant.dependencies:
        if dep.call is require_user:
            return True
    return False


def _ensure_problem_schema(openapi_schema: dict[str, Any]) -> None:
    components = openapi_schema.setdefault("components", {})
    schemas = components.setdefault("schemas", {})
    schemas.setdefault(
        "HttpProblem",
        {
            "title": "HttpProblem",
            "type": "object",
            "properties": {
                "type": {"type": "string", "example": "https://httpstatuses.com/400"},
                "title": {"type": "string", "example": "Bad Request"},
                "status": {"type": "integer", "example": 400},
                "detail": {"type": "string", "example": "Descricao clara do erro."},
                "timestamp": {"type": "string", "format": "date-time"},
                "path": {"type": "string", "example": "/auth/login"},
                "error_code": {"type": "string", "example": "validation_error"},
            },
            "required": ["type", "title", "status", "detail", "timestamp"],
        },
    )


def _ensure_bearer_security(openapi_schema: dict[str, Any]) -> None:
    components = openapi_schema.setdefault("components", {})
    security_schemes = components.setdefault("securitySchemes", {})
    security_schemes["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Informe apenas o token JWT no botao Authorize.",
    }


def _patch_operation_responses(operation: dict[str, Any], requires_auth: bool) -> None:
    responses = operation.setdefault("responses", {})

    responses.setdefault(
        "500",
        {
            "description": "Erro interno do servidor.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HttpProblem"}}},
        },
    )

    if "422" in responses:
        responses["422"] = {
            "description": "Erro de validacao da requisicao.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HttpProblem"}}},
        }

    if requires_auth:
        operation["security"] = [{"BearerAuth": []}]
        responses.setdefault(
            "401",
            {
                "description": "Nao autenticado (token invalido, ausente ou expirado).",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HttpProblem"}}},
            },
        )


def _apply_route_patches(app: FastAPI, openapi_schema: dict[str, Any]) -> None:
    paths = openapi_schema.get("paths", {})
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.include_in_schema:
            continue

        path_item = paths.get(route.path_format)
        if not path_item:
            continue

        requires_auth = _route_requires_bearer(route)
        for method in route.methods or set():
            operation = path_item.get(method.lower())
            if not operation:
                continue
            _patch_operation_responses(operation, requires_auth)


def _cleanup_unused_security_schemes(openapi_schema: dict[str, Any]) -> None:
    paths = openapi_schema.get("paths", {})
    used: set[str] = set()

    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            for sec in operation.get("security", []):
                if isinstance(sec, dict):
                    used.update(sec.keys())

    components = openapi_schema.setdefault("components", {})
    security_schemes = components.setdefault("securitySchemes", {})
    for scheme_name in list(security_schemes.keys()):
        if scheme_name not in used:
            security_schemes.pop(scheme_name, None)


def build_openapi_schema(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        summary="Documentacao Swagger da API Higra Sigs",
        description=app.description,
        routes=app.routes,
        tags=OPENAPI_TAGS,
    )

    openapi_schema["servers"] = [
        {"url": "/", "description": "Servidor atual"},
        {"url": "http://localhost:8000", "description": "Ambiente local"},
    ]

    _ensure_bearer_security(openapi_schema)
    _ensure_problem_schema(openapi_schema)
    _apply_route_patches(app, openapi_schema)
    _cleanup_unused_security_schemes(openapi_schema)

    app.openapi_schema = openapi_schema
    return app.openapi_schema
