# HIGRA SIGS — Entry point (Claude Code)

Conversão do Portal SIGS (Oracle APEX 24.1, app 108, 552 páginas) para FastAPI + React.

## Leia antes de codar

1. **`plans/rules.md`** — regras absolutas (CRM intocável, schema qualificado, etc.)
2. **`context/01-stack.md`** — stack, estrutura de pastas, infra já existente
3. **Skill do domínio** — `.claude/skills/` (ver `skills/README.md`)

## Mapa rápido

| Preciso de…                                 | Abra                               |
|---------------------------------------------|------------------------------------|
| Stack, convenções, estrutura de pastas      | `context/01-stack.md`              |
| Hierarquia de usuários, permissões          | `context/02-auth.md`               |
| Lista de módulos, tabelas, chaves APEX      | `context/03-modules.md`            |
| Glossário (RQ03, BOB, CNJ_MOT…)             | `context/04-glossary.md`           |
| Usar o export APEX (`f108.sql`)             | `context/05-apex-source.md`        |
| Plano por fase (0 → 6)                      | `plans/migration-phases.md`        |
| Regras absolutas                            | `plans/rules.md`                   |
| Como escolher skill                         | `skills/README.md`                 |
| Backlog de melhorias (loop automatizado)    | `../BACKLOG.md` (raiz do repo)     |

## Loop de melhoria contínua

Tarefas ficam em `BACKLOG.md` na raiz do repo (não em `.claude/` — arquivos ali são protegidos pelo Claude Code).
Formato: `- [ ] descrição` / `- [x] concluída`.
Para rodar o loop que pega tarefas automaticamente:

```
Windows:  scripts\melhorar_continuo.bat          (ou .bat 20 5 — max 20 sessões, pausa 5s)
Linux:    ./scripts/melhorar_continuo.sh
```

Tarefas marcadas `[P1]` rodam em Opus; resto em Sonnet. Log em `scripts/log_melhoria.txt`.

## Regras top-3 (resumo)

- **FASE 0 PRIMEIRO** — auth e permissões (hierarquia idêntica ao Oracle).
- **NÃO MEXER NO CRM** (`crm.*`, `routes/crm/`, `pages/crm/`).
- **NÃO ALTERAR** tabelas existentes no schema `public` sem confirmar.

## Fonte canônica do legado

Export APEX: `C:\Users\user\Downloads\f108_extract\f108.sql` (867K linhas).
Como consultar: ver `context/05-apex-source.md`.

## Fluxo recomendado

1. Leia `plans/rules.md` — regras que não negociam.
2. Leia `context/01-stack.md` — o que já existe no repo.
3. Abra a skill do domínio em que vai trabalhar (`.claude/skills/`).
4. Verifique o código existente **antes** de criar arquivos novos.
5. Edições cirúrgicas. Valide na menor superfície possível.
