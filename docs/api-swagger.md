# Documentacao Swagger da API

Este projeto expõe documentacao interativa das rotas via OpenAPI/Swagger.

## Endpoints de documentacao

- Swagger UI principal: `/docs`
- Alias Swagger UI: `/swagger`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

Exemplos locais:

- http://localhost:8000/docs
- http://localhost:8000/swagger
- http://localhost:8000/openapi.json

## Autenticacao nas rotas protegidas

1. Faça login em `POST /auth/login`.
2. Copie o `token` retornado.
3. No Swagger, clique em `Authorize` e informe: `Bearer <token>`.

As rotas que exigem JWT aparecem com `BearerAuth` automaticamente na documentacao.

## Padrao de erro HTTP

A API retorna erros em formato padronizado com os campos:

- `type`
- `title`
- `status`
- `detail`
- `timestamp`
- `path`
- `error_code` (quando aplicavel)

## Exportar schema OpenAPI

```bash
curl -s http://localhost:8000/openapi.json -o openapi.json
```
