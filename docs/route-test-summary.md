# Relatorio de Testes de Rotas

- Ambiente: `asgi_inprocess_real_handlers_minimal_payload`
- Rotas testadas: `108`
- Rotas puladas: `4`

## Rotas Puladas
- `GET /upload/admin` - dependencia externa (huggingface)
- `POST /upload/documento` - dependencia externa (huggingface)
- `POST /upload/rebuild` - dependencia externa (huggingface)
- `GET /upload/status` - dependencia externa (huggingface)

## POST /arquimedes/article => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:55.144197+00:00",
    "path": "/arquimedes/article",
    "error_code": "internal_server_error"
  }
}
```

## POST /arquimedes/cycle => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:55.144837+00:00",
    "path": "/arquimedes/cycle",
    "error_code": "internal_server_error"
  }
}
```

## POST /arquimedes/like => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:55.145431+00:00",
    "path": "/arquimedes/like",
    "error_code": "internal_server_error"
  }
}
```

## POST /arquimedes/post => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:55.146036+00:00",
    "path": "/arquimedes/post",
    "error_code": "internal_server_error"
  }
}
```

## POST /auth/change-password => 400
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Senha atual e nova senha são obrigatórias",
    "timestamp": "2026-03-10T20:05:55.146595+00:00",
    "path": "/auth/change-password"
  }
}
```

## POST /auth/login => 400
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Email e senha são obrigatórios",
    "timestamp": "2026-03-10T20:05:55.147079+00:00",
    "path": "/auth/login"
  }
}
```

## GET /auth/me => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "id": 1,
    "username": "jonathan.oliveira",
    "email": "jonathan.oliveira@higra.com.br",
    "name": "Jonathan Oliveira",
    "photo": null,
    "photo_mime": null
  }
}
```

## PUT /auth/me => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "multipart/form-data",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:55.148406+00:00",
    "path": "/auth/me",
    "error_code": "internal_server_error"
  }
}
```

## PUT /auth/me/cover => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "multipart/form-data",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:05:55.149066+00:00",
    "path": "/auth/me/cover",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "cover"
        ],
        "msg": "Field required",
        "input": null
      }
    ]
  }
}
```

## POST /auth/register => 400
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Campos obrigatórios ausentes",
    "timestamp": "2026-03-10T20:05:55.149640+00:00",
    "path": "/auth/register"
  }
}
```

## GET /historico/conversa => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar conversas: OperationalError",
    "timestamp": "2026-03-10T20:05:55.150269+00:00",
    "path": "/historico/conversa"
  }
}
```

## GET /historico/conversas => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar conversas: OperationalError",
    "timestamp": "2026-03-10T20:05:55.150779+00:00",
    "path": "/historico/conversas"
  }
}
```

## POST /historico/conversas => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao criar conversa: OperationalError",
    "timestamp": "2026-03-10T20:05:55.151277+00:00",
    "path": "/historico/conversas"
  }
}
```

## DELETE /historico/conversas/{conversa_id} => 500
Request payload:
```json
{
  "path_params": {
    "conversa_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir conversa: OperationalError",
    "timestamp": "2026-03-10T20:05:55.151799+00:00",
    "path": "/historico/conversas/1"
  }
}
```

## GET /historico/conversas/{conversa_id}/mensagens => 500
Request payload:
```json
{
  "path_params": {
    "conversa_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar mensagens: OperationalError",
    "timestamp": "2026-03-10T20:05:55.152304+00:00",
    "path": "/historico/conversas/1/mensagens"
  }
}
```

## GET /historico/fallbacks => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "_truncated": true,
    "preview": "{\"fallbacks\": [{\"pergunta\": \"Qual a história da higra?\", \"categoria\": \"historia\", \"timestamp\": \"2026-01-13T18:57:46.005123Z\"}, {\"pergunta\": \"O que é a Higra?\", \"categoria\": \"historia\", \"timestamp\": \"2026-01-13T18:57:54.949769Z\"}, {\"pergunta\": \"O que é a higra?\", \"categoria\": \"historia\", \"timestamp\": \"2026-01-13T18:59:07.269393Z\"}, {\"pergunta\": \"O que é a higra?\", \"categoria\": \"historia\", \"timestamp\": \"2026-01-13T19:14:44.871123Z\"}, {\"pergunta\": \"o que é a higra\", \"categoria\": \"historia\", \"timestamp\": \"2026-01-14T12:32:50.298557Z\"}, {\"pergunta\": \"Olá tio\", \"categoria\": null, \"timestamp\": \"2026-01-14T14:12:22.162752Z\"}, {\"pergunta\": \"@Seletor 1000 60\", \"categoria\": null, \"timestamp\": \"2026-01-20T17:50:08.213139Z\"}, {\"pergunta\": \"O que é a Higra?\", \"categoria\": \"historia\", \"timestamp\": \"2026-02-05T14:41:17.936277Z\"}, {\"pergunta\": \"Quais modelos existem?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T15:31:23.485947Z\"}, {\"pergunta\": \"quais os modelos?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T15:53:36.698866Z\"}, {\"pergunta\": \"Quais modelos existem na higra?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:10:10.109353Z\"}, {\"pergunta\": \"Quais modelos de bombas existem?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:13:23.637420Z\"}, {\"pergunta\": \"Quais modelos existem?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:25:04.881743Z\"}, {\"pergunta\": \"quais modelos de bomba existem na higra?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:32:19.097963Z\"}, {\"pergunta\": \"O que é cavitação em bombas centrífugas e por que ela ocorre?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:50:15.493516Z\"}, {\"pergunta\": \"O que é cavitação em bombas centrífugas?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:53:58.648274Z\"}, {\"pergunta\": \"O que é cavitação em bombas centrífugas?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T16:54:12.315879Z\"}, {\"pergunta\": \"que é cavitação em bombas centrífugas?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T17:06:26.788822Z\"}, {\"pergunta\": \"O que é cavitação em bombas centrifugas?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T17:15:44.214174Z\"}, {\"pergunta\": \"@NPSH O que é cavitação em bombas centrífugas?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T18:22:54.982935Z\"}, {\"pergunta\": \"@NPSH O que é cavitação em bombas centrífugas?\", \"categoria\": \"produto\", \"timestamp\": \"2026-02-05T18:29:56.336513Z\"}, {\"pergunta\": \"@NPSH O que é cavitação?\", \"categoria\": null, \"timestamp\": \"2026-02"
  }
}
```

## GET /historico/fallbacks/status => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "status": "ok",
    "stats": {
      "total": 22,
      "by_category": {
        "historia": 6,
        "desconhecida": 3,
        "produto": 13
      }
    }
  }
}
```

## GET /historico/ping => None
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": null,
  "payload": {
    "error": "timeout"
  }
}
```

## POST /historico/salvar => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {
    "fluxo": "sample"
  },
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.657330+00:00",
    "path": "/historico/salvar",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "input_data"
        ],
        "msg": "Field required",
        "input": null
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "resposta_data"
        ],
        "msg": "Field required",
        "input": null
      }
    ]
  }
}
```

## POST /invites/accept/{token} => 500
Request payload:
```json
{
  "path_params": {
    "token": "sample"
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.659180+00:00",
    "path": "/invites/accept/sample",
    "error_code": "internal_server_error"
  }
}
```

## POST /invites/admin/founder-invite => 400
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Email obrigatorio",
    "timestamp": "2026-03-10T20:05:57.660396+00:00",
    "path": "/invites/admin/founder-invite"
  }
}
```

## POST /invites/admin/grant-invites => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.661805+00:00",
    "path": "/invites/admin/grant-invites",
    "error_code": "internal_server_error"
  }
}
```

## POST /invites/admin/invite-from-waitlist => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.663212+00:00",
    "path": "/invites/admin/invite-from-waitlist",
    "error_code": "internal_server_error"
  }
}
```

## GET /invites/admin/stats => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.664507+00:00",
    "path": "/invites/admin/stats",
    "error_code": "internal_server_error"
  }
}
```

## GET /invites/admin/waitlist => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.665871+00:00",
    "path": "/invites/admin/waitlist",
    "error_code": "internal_server_error"
  }
}
```

## POST /invites/complete-profile => 400
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Body JSON invalido",
    "timestamp": "2026-03-10T20:05:57.666733+00:00",
    "path": "/invites/complete-profile"
  }
}
```

## POST /invites/generate => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.667672+00:00",
    "path": "/invites/generate",
    "error_code": "internal_server_error"
  }
}
```

## GET /invites/list => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.668438+00:00",
    "path": "/invites/list",
    "error_code": "internal_server_error"
  }
}
```

## GET /invites/me => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.669145+00:00",
    "path": "/invites/me",
    "error_code": "internal_server_error"
  }
}
```

## GET /invites/profile-status => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.669784+00:00",
    "path": "/invites/profile-status",
    "error_code": "internal_server_error"
  }
}
```

## POST /invites/revoke/{token} => 500
Request payload:
```json
{
  "path_params": {
    "token": "sample"
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.670410+00:00",
    "path": "/invites/revoke/sample",
    "error_code": "internal_server_error"
  }
}
```

## GET /invites/verify/{token} => 500
Request payload:
```json
{
  "path_params": {
    "token": "sample"
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:05:57.670986+00:00",
    "path": "/invites/verify/sample",
    "error_code": "internal_server_error"
  }
}
```

## POST /invites/waitlist => 400
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Nome e email sao obrigatorios",
    "timestamp": "2026-03-10T20:05:57.671430+00:00",
    "path": "/invites/waitlist"
  }
}
```

## GET /npsh/historico/ => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar historico de NPSH.",
    "timestamp": "2026-03-10T20:05:57.672614+00:00",
    "path": "/npsh/historico/"
  }
}
```

## POST /npsh/historico/salvar => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required | Field required | Field required | Field required | Field required | Field required | Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.674367+00:00",
    "path": "/npsh/historico/salvar",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "vazao"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "temperatura"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "patm"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "hs"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "hfs"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "npshr"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "pv"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "npsha"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "margem"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## DELETE /npsh/historico/{historico_id} => 500
Request payload:
```json
{
  "path_params": {
    "historico_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir historico de NPSH.",
    "timestamp": "2026-03-10T20:05:57.675291+00:00",
    "path": "/npsh/historico/1"
  }
}
```

## GET /perda-carga/componentes/ => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar componentes hidraulicos.",
    "timestamp": "2026-03-10T20:05:57.676131+00:00",
    "path": "/perda-carga/componentes/"
  }
}
```

## POST /perda-carga/componentes/ => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.677818+00:00",
    "path": "/perda-carga/componentes/",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "key"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "label"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "sprite"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## PUT /perda-carga/componentes/{componente_id} => 422
Request payload:
```json
{
  "path_params": {
    "componente_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.678451+00:00",
    "path": "/perda-carga/componentes/1",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "key"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "label"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "sprite"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## DELETE /perda-carga/componentes/{componente_id} => 500
Request payload:
```json
{
  "path_params": {
    "componente_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir componente hidraulico.",
    "timestamp": "2026-03-10T20:05:57.679282+00:00",
    "path": "/perda-carga/componentes/1"
  }
}
```

## GET /perda-carga/historico/ => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar historico de perda de carga.",
    "timestamp": "2026-03-10T20:05:57.680075+00:00",
    "path": "/perda-carga/historico/"
  }
}
```

## POST /perda-carga/historico/salvar => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required | Field required | Field required | Field required | Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.681607+00:00",
    "path": "/perda-carga/historico/salvar",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "vazao"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "pressao_atm"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "perda_total"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "perda_distribuida"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "perda_localizada"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "componentes"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "resumo"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## PUT /perda-carga/historico/{historico_id} => 422
Request payload:
```json
{
  "path_params": {
    "historico_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required | Field required | Field required | Field required | Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.682120+00:00",
    "path": "/perda-carga/historico/1",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "vazao"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "pressao_atm"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "perda_total"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "perda_distribuida"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "perda_localizada"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "componentes"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "resumo"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## DELETE /perda-carga/historico/{historico_id} => 500
Request payload:
```json
{
  "path_params": {
    "historico_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir historico de perda de carga.",
    "timestamp": "2026-03-10T20:05:57.682852+00:00",
    "path": "/perda-carga/historico/1"
  }
}
```

## GET /seletor/historico/ => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar histórico seletor: OperationalError",
    "timestamp": "2026-03-10T20:05:57.683531+00:00",
    "path": "/seletor/historico/"
  }
}
```

## POST /seletor/historico/consultar => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required",
    "timestamp": "2026-03-10T20:05:57.684659+00:00",
    "path": "/seletor/historico/consultar",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "vazao"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "altura"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## GET /seletor/historico/ping => None
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": false
}
```
Response payload:
```json
{
  "status_code": null,
  "payload": {
    "error": "timeout"
  }
}
```

## POST /seletor/historico/salvar => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao salvar histórico seletor: OperationalError",
    "timestamp": "2026-03-10T20:06:00.194279+00:00",
    "path": "/seletor/historico/salvar"
  }
}
```

## DELETE /seletor/historico/{historico_id} => 500
Request payload:
```json
{
  "path_params": {
    "historico_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir historico seletor: OperationalError",
    "timestamp": "2026-03-10T20:06:00.196682+00:00",
    "path": "/seletor/historico/1"
  }
}
```

## GET /social/analytics/me => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao obter analytics.",
    "timestamp": "2026-03-10T20:06:00.198689+00:00",
    "path": "/social/analytics/me"
  }
}
```

## GET /social/analytics/posts/{post_id} => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao obter analytics.",
    "timestamp": "2026-03-10T20:06:00.200023+00:00",
    "path": "/social/analytics/posts/1"
  }
}
```

## GET /social/bookmarks => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar bookmarks.",
    "timestamp": "2026-03-10T20:06:00.201101+00:00",
    "path": "/social/bookmarks"
  }
}
```

## POST /social/comments/{comment_id}/like => 500
Request payload:
```json
{
  "path_params": {
    "comment_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao curtir comentario.",
    "timestamp": "2026-03-10T20:06:00.202048+00:00",
    "path": "/social/comments/1/like"
  }
}
```

## GET /social/communities => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar comunidades.",
    "timestamp": "2026-03-10T20:06:00.202932+00:00",
    "path": "/social/communities"
  }
}
```

## POST /social/communities => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.204073+00:00",
    "path": "/social/communities",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "name"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## GET /social/communities/search => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {
    "q": "sample"
  },
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao buscar comunidades.",
    "timestamp": "2026-03-10T20:06:00.205592+00:00",
    "path": "/social/communities/search"
  }
}
```

## GET /social/communities/{community_id} => 500
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao obter comunidade.",
    "timestamp": "2026-03-10T20:06:00.206484+00:00",
    "path": "/social/communities/1"
  }
}
```

## PUT /social/communities/{community_id} => 500
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao editar comunidade.",
    "timestamp": "2026-03-10T20:06:00.208054+00:00",
    "path": "/social/communities/1"
  }
}
```

## DELETE /social/communities/{community_id} => 500
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir comunidade.",
    "timestamp": "2026-03-10T20:06:00.208889+00:00",
    "path": "/social/communities/1"
  }
}
```

## POST /social/communities/{community_id}/join => 500
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao alternar membro.",
    "timestamp": "2026-03-10T20:06:00.209809+00:00",
    "path": "/social/communities/1/join"
  }
}
```

## GET /social/communities/{community_id}/members => 500
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar membros.",
    "timestamp": "2026-03-10T20:06:00.210685+00:00",
    "path": "/social/communities/1/members"
  }
}
```

## PUT /social/communities/{community_id}/members/{target_id}/role => 422
Request payload:
```json
{
  "path_params": {
    "community_id": 1,
    "target_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.211451+00:00",
    "path": "/social/communities/1/members/1/role",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "role"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## GET /social/communities/{community_id}/posts => 500
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar posts da comunidade.",
    "timestamp": "2026-03-10T20:06:00.212354+00:00",
    "path": "/social/communities/1/posts"
  }
}
```

## POST /social/communities/{community_id}/posts => 422
Request payload:
```json
{
  "path_params": {
    "community_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.213879+00:00",
    "path": "/social/communities/1/posts",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "content"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## GET /social/dm/conversations => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar conversas.",
    "timestamp": "2026-03-10T20:06:00.214617+00:00",
    "path": "/social/dm/conversations"
  }
}
```

## GET /social/dm/conversations/{conversation_id}/messages => 500
Request payload:
```json
{
  "path_params": {
    "conversation_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar mensagens.",
    "timestamp": "2026-03-10T20:06:00.215607+00:00",
    "path": "/social/dm/conversations/1/messages"
  }
}
```

## POST /social/dm/conversations/{conversation_id}/messages => 400
Request payload:
```json
{
  "path_params": {
    "conversation_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Mensagem vazia.",
    "timestamp": "2026-03-10T20:06:00.216873+00:00",
    "path": "/social/dm/conversations/1/messages"
  }
}
```

## POST /social/dm/conversations/{other_id} => 400
Request payload:
```json
{
  "path_params": {
    "other_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Nao pode enviar DM para si mesmo.",
    "timestamp": "2026-03-10T20:06:00.217364+00:00",
    "path": "/social/dm/conversations/1"
  }
}
```

## DELETE /social/dm/messages/{message_id} => 500
Request payload:
```json
{
  "path_params": {
    "message_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir mensagem.",
    "timestamp": "2026-03-10T20:06:00.218164+00:00",
    "path": "/social/dm/messages/1"
  }
}
```

## POST /social/dm/messages/{message_id}/react => 500
Request payload:
```json
{
  "path_params": {
    "message_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro interno do servidor.",
    "timestamp": "2026-03-10T20:06:00.218713+00:00",
    "path": "/social/dm/messages/1/react",
    "error_code": "internal_server_error"
  }
}
```

## GET /social/dm/online-status => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "online": {}
  }
}
```

## GET /social/dm/unread-count => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "count": 0
  }
}
```

## GET /social/explore/tag/{tag} => 500
Request payload:
```json
{
  "path_params": {
    "tag": "sample"
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao buscar posts por tag.",
    "timestamp": "2026-03-10T20:06:00.220667+00:00",
    "path": "/social/explore/tag/sample"
  }
}
```

## GET /social/explore/tags => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar tendencias.",
    "timestamp": "2026-03-10T20:06:00.221463+00:00",
    "path": "/social/explore/tags"
  }
}
```

## GET /social/feed => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar feed social.",
    "timestamp": "2026-03-10T20:06:00.222210+00:00",
    "path": "/social/feed"
  }
}
```

## GET /social/link-preview => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {
    "url": "sample"
  },
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "title": "",
    "description": "",
    "image": ""
  }
}
```

## GET /social/notifications => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar notificacoes.",
    "timestamp": "2026-03-10T20:06:00.224730+00:00",
    "path": "/social/notifications"
  }
}
```

## GET /social/notifications/preferences => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "preferences": {
      "like_enabled": true,
      "comment_enabled": true,
      "follow_enabled": true,
      "article_enabled": true,
      "repost_enabled": true,
      "quote_enabled": true
    }
  }
}
```

## PUT /social/notifications/preferences => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao salvar preferencias.",
    "timestamp": "2026-03-10T20:06:00.227972+00:00",
    "path": "/social/notifications/preferences"
  }
}
```

## POST /social/notifications/read-all => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao marcar notificacoes como lidas.",
    "timestamp": "2026-03-10T20:06:00.228826+00:00",
    "path": "/social/notifications/read-all"
  }
}
```

## POST /social/notifications/{notification_id}/read => 500
Request payload:
```json
{
  "path_params": {
    "notification_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao marcar notificacao como lida.",
    "timestamp": "2026-03-10T20:06:00.229613+00:00",
    "path": "/social/notifications/1/read"
  }
}
```

## POST /social/polls => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required | Field required",
    "timestamp": "2026-03-10T20:06:00.230857+00:00",
    "path": "/social/polls",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "question"
        ],
        "msg": "Field required",
        "input": {}
      },
      {
        "type": "missing",
        "loc": [
          "body",
          "options"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## POST /social/polls/{poll_id}/vote => 422
Request payload:
```json
{
  "path_params": {
    "poll_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.231682+00:00",
    "path": "/social/polls/1/vote",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "option_id"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## POST /social/posts => 422
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.232146+00:00",
    "path": "/social/posts",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "content"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## GET /social/posts/{post_id} => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao buscar post.",
    "timestamp": "2026-03-10T20:06:00.232896+00:00",
    "path": "/social/posts/1"
  }
}
```

## PUT /social/posts/{post_id} => 422
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.233727+00:00",
    "path": "/social/posts/1",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "content"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## DELETE /social/posts/{post_id} => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao excluir post.",
    "timestamp": "2026-03-10T20:06:00.234476+00:00",
    "path": "/social/posts/1"
  }
}
```

## POST /social/posts/{post_id}/bookmark => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao alternar bookmark.",
    "timestamp": "2026-03-10T20:06:00.235209+00:00",
    "path": "/social/posts/1/bookmark"
  }
}
```

## GET /social/posts/{post_id}/comments => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar comentarios.",
    "timestamp": "2026-03-10T20:06:00.235949+00:00",
    "path": "/social/posts/1/comments"
  }
}
```

## POST /social/posts/{post_id}/comments => 422
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": "application/json",
  "payload": {},
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 422,
  "payload": {
    "type": "https://httpstatuses.com/422",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Field required",
    "timestamp": "2026-03-10T20:06:00.237081+00:00",
    "path": "/social/posts/1/comments",
    "error_code": "validation_error",
    "errors": [
      {
        "type": "missing",
        "loc": [
          "body",
          "content"
        ],
        "msg": "Field required",
        "input": {}
      }
    ]
  }
}
```

## POST /social/posts/{post_id}/like => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao alternar like.",
    "timestamp": "2026-03-10T20:06:00.237994+00:00",
    "path": "/social/posts/1/like"
  }
}
```

## POST /social/posts/{post_id}/pin => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao fixar post.",
    "timestamp": "2026-03-10T20:06:00.238757+00:00",
    "path": "/social/posts/1/pin"
  }
}
```

## GET /social/posts/{post_id}/poll => 200
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "poll": null
  }
}
```

## POST /social/posts/{post_id}/repost => 500
Request payload:
```json
{
  "path_params": {
    "post_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao alternar repost.",
    "timestamp": "2026-03-10T20:06:00.240049+00:00",
    "path": "/social/posts/1/repost"
  }
}
```

## GET /social/profile/stats => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao obter estatisticas do usuario.",
    "timestamp": "2026-03-10T20:06:00.240917+00:00",
    "path": "/social/profile/stats"
  }
}
```

## GET /social/search => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {
    "q": "sample"
  },
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao buscar feed social.",
    "timestamp": "2026-03-10T20:06:00.241841+00:00",
    "path": "/social/search"
  }
}
```

## GET /social/suggestions => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar sugestoes.",
    "timestamp": "2026-03-10T20:06:00.242619+00:00",
    "path": "/social/suggestions"
  }
}
```

## GET /social/trends => 500
Request payload:
```json
{
  "path_params": {},
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar tendencias.",
    "timestamp": "2026-03-10T20:06:00.243417+00:00",
    "path": "/social/trends"
  }
}
```

## GET /social/users/search => 200
Request payload:
```json
{
  "path_params": {},
  "query_params": {
    "q": "sample"
  },
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "users": []
  }
}
```

## POST /social/users/{target_id}/block => 400
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Nao pode bloquear a si mesmo.",
    "timestamp": "2026-03-10T20:06:00.244699+00:00",
    "path": "/social/users/1/block"
  }
}
```

## GET /social/users/{target_id}/block-mute => 200
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 200,
  "payload": {
    "is_blocked": false,
    "is_muted": false
  }
}
```

## POST /social/users/{target_id}/follow => 400
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Nao e possivel seguir a si mesmo.",
    "timestamp": "2026-03-10T20:06:00.245916+00:00",
    "path": "/social/users/1/follow"
  }
}
```

## GET /social/users/{target_id}/followers => 500
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar seguidores.",
    "timestamp": "2026-03-10T20:06:00.246686+00:00",
    "path": "/social/users/1/followers"
  }
}
```

## GET /social/users/{target_id}/following => 500
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar seguindo.",
    "timestamp": "2026-03-10T20:06:00.247543+00:00",
    "path": "/social/users/1/following"
  }
}
```

## GET /social/users/{target_id}/likes => 500
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar curtidas.",
    "timestamp": "2026-03-10T20:06:00.248384+00:00",
    "path": "/social/users/1/likes"
  }
}
```

## POST /social/users/{target_id}/mute => 400
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 400,
  "payload": {
    "type": "https://httpstatuses.com/400",
    "title": "Bad Request",
    "status": 400,
    "detail": "Nao pode silenciar a si mesmo.",
    "timestamp": "2026-03-10T20:06:00.248888+00:00",
    "path": "/social/users/1/mute"
  }
}
```

## GET /social/users/{target_id}/posts => 500
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao listar posts.",
    "timestamp": "2026-03-10T20:06:00.249670+00:00",
    "path": "/social/users/1/posts"
  }
}
```

## GET /social/users/{target_id}/profile => 500
Request payload:
```json
{
  "path_params": {
    "target_id": 1
  },
  "query_params": {},
  "content_type": null,
  "payload": null,
  "has_token": true
}
```
Response payload:
```json
{
  "status_code": 500,
  "payload": {
    "type": "https://httpstatuses.com/500",
    "title": "Internal Server Error",
    "status": 500,
    "detail": "Erro ao obter perfil.",
    "timestamp": "2026-03-10T20:06:00.250439+00:00",
    "path": "/social/users/1/profile"
  }
}
```
