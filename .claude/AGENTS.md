# HIGRA SIGS — Entry point (Codex / outros agentes)

Guia curto para trabalhar neste repositório.

## Fonte canônica de contexto

- **Mapa da pasta:** `.claude/README.md`
- **Regras absolutas:** `.claude/plans/rules.md`
- **Stack, estrutura, convenções:** `.claude/context/01-stack.md`
- **Hierarquia de usuários:** `.claude/context/02-auth.md`
- **Lista de módulos:** `.claude/context/03-modules.md`
- **Glossário HIGRA:** `.claude/context/04-glossary.md`
- **Fonte APEX (`f108.sql`):** `.claude/context/05-apex-source.md`
- **Plano de fases:** `.claude/plans/migration-phases.md`
- **Skills por domínio:** `.claude/skills/` (índice em `skills/README.md`)

## Resumo do projeto

- Migração do Portal SIGS (Oracle APEX 24.1, app 108) para FastAPI + React.
- Backend: FastAPI, `psycopg2`, Alembic, JWT + BCrypt.
- Frontend: React 18 com Vite, React Router, Axios, Zustand e CSS puro.
- Banco alvo: PostgreSQL `higra_sigs`.
- Fonte de verdade do legado: `C:\Users\user\Downloads\f108_extract\f108.sql`.

## Regras críticas (resumo)

Detalhes em `plans/rules.md`:

- **FASE 0 vem antes de módulos novos** — auth, sessão e permissões.
- **NÃO MEXER** no CRM (`crm.*`, `routes/crm/`, `pages/crm/`).
- **NÃO ALTERAR** tabelas existentes do schema `public` sem confirmar.
- Sempre qualifique tabelas com schema (`public.*`, `crm.*`).
- Backend usa SQL puro com `psycopg2`; não introduzir ORM.
- `require_permission(MOD_KEY)` em endpoints protegidos.
- Faça edições cirúrgicas.

## Estrutura real

- Backend modular em `backend/routes/`: `cadastros`, `tarefas`, `projetos`, `qualidade`, `fabricacao`, `assistencia`, `laboratorio`, `motores`, `documentos`, `indicadores`, `reunioes`, `chamados`, `home`.
- Frontend modular em `frontend/src/pages/` e `frontend/src/services/`.
- Funcionalidades fora do SIGS clássico (chat, social, RAG local, Arquimedes) já existem — preservar antes de refatorar.

## Bases já existentes no frontend

- API HTTP central: `frontend/src/lib/api.js`
- Auth global: `frontend/src/stores/authStore.js`
- Toasts: `frontend/src/contexts/ToastContext.jsx`
- Tema: `frontend/src/hooks/useTheme.js`
- Navegação/layout: `Sidebar`, `BottomNav`, `SigsHeader`, `PageLayout`
- Confirmação/modal: `ConfirmModal`, `Modal` (com focus trap)
- Global: `CommandPalette` (Ctrl+K), `KeyboardShortcutsHelp` (?), `OfflineBanner`

## Escolha da skill

Ver `skills/README.md` para a tabela completa. Resumo:

| Trabalho                                              | Skill                          |
|-------------------------------------------------------|--------------------------------|
| Auth, login, sessão, permissões                       | `00-seguranca.md`              |
| Schema, migrations, SQL, performance                  | `01-dba.md`                    |
| Backend genérico (FastAPI, routers, services)         | `02-backend-core.md`           |
| Frontend genérico (React, páginas, estilo)            | `03-frontend.md`               |
| RQ03, RQ49, RQ80, GAC, Indicadores                    | `04-qualidade.md`              |
| Fabricação / Checklists (BOB, CNJ_MOT, ENS_HID...)    | `05-fabricacao.md`             |
| Motores e engenharia                                  | `06-motores.md`                |
| Assistência, laudos, chamados                         | `07-assistencia.md`            |
| Projetos, tarefas, reuniões, documentos, planos       | `08-projetos-tarefas.md`       |
| Testes e validação                                    | `09-testes.md`                 |
| Laboratório / bancada                                 | `10-laboratorio.md`            |
| Migração Oracle → PostgreSQL                          | `11-migracao-dados.md`         |

## Fluxo recomendado

1. Ler `.claude/CLAUDE.md` (ou este arquivo) + `plans/rules.md`.
2. Abrir a skill do domínio.
3. Verificar a implementação real existente antes de criar arquivos novos.
4. Se a regra vier do Oracle, consultar `f108.sql` (ver `context/05-apex-source.md`).
5. Validar backend/frontend localmente na menor superfície possível.
