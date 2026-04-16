# Skills — agentes especializados por domínio

Cada arquivo aqui é um guia detalhado que um agente deve consultar antes de trabalhar no domínio correspondente. **Use como referência, não como prompt inicial.** Para começar, leia `.claude/CLAUDE.md`.

## Índice

| Arquivo                     | Escopo                                                          | Quando usar                                                      |
|-----------------------------|-----------------------------------------------------------------|------------------------------------------------------------------|
| `00-seguranca.md`           | Auth, JWT, permissões, `PCK_STH_STM`, `require_permission`      | Login, sessão, route guards, CRUD de tipos de usuário            |
| `01-dba.md`                 | Schema, tabelas, índices, migrations Alembic, performance       | Criar/alterar tabelas, migrations, otimização de queries         |
| `02-backend-core.md`        | FastAPI, routers, Pydantic, services, queries psycopg2          | Endpoints de módulos, lógica de negócio backend                  |
| `03-frontend.md`            | React, rotas, páginas, services, design system, CSS             | Páginas novas, componentes, consumo de API                       |
| `04-qualidade.md`           | RQ03, RQ49, RQ80, RQ94, SST, GAC, Indicadores/Metas             | Módulo SGQ completo, auditorias, não conformidades               |
| `05-fabricacao.md`          | Checklists (BOB, CNJ_MOT, ENS_HID, PIN, QLD, MNT, EXP, EMB)     | Módulo de produção, instrumentos, calibração                     |
| `06-motores.md`             | Fichas técnicas, modelos, bombas, folhas de dados               | Motores, engenharia, especificações                              |
| `07-assistencia.md`         | Assistência Técnica, Service/Laudos, Chamados                   | Pós-venda, atendimentos, PCK_HGR_ASS                             |
| `08-projetos-tarefas.md`    | Projetos, Tarefas, Reuniões, Documentos, Planos de Ação         | Módulos transversais (usados por todos os outros)                |
| `09-testes.md`              | Testes automatizados, validação de endpoints, QA                | Cobertura de testes, regression, integração                      |
| `10-laboratorio.md`         | Bancada, performance, ensaios, simulação                        | Módulo LABS, testes de bombas                                    |
| `11-migracao-dados.md`      | Oracle HGRHML → PostgreSQL higra_sigs                           | Extração/transformação/carga, FKs, encoding                      |

## Como escolher a skill certa

1. **Identifique o escopo**: é auth? é um módulo específico? é frontend/backend genérico?
2. **Veja a tabela de módulos** em `context/03-modules.md` — cada módulo aponta para sua skill.
3. **Abra a skill correspondente** antes de implementar — ela contém convenções e armadilhas específicas.
4. Se o trabalho envolve **vários módulos**, abra as skills relevantes (ex.: RQ03 + Assistência → `04-qualidade.md` + `07-assistencia.md`).

## Regras comuns entre skills

Todas as skills assumem as regras de `.claude/plans/rules.md`. Não precisam ser repetidas dentro de cada skill.
