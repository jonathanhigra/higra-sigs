# `.claude/` — guia de navegação

Esta pasta contém todo o contexto que os agentes (Claude Code, Codex) usam para trabalhar no repositório.

## Estrutura

```
.claude/
├── CLAUDE.md              # 🏠 Entry point do Claude Code (comece por aqui)
├── AGENTS.md              # 🏠 Entry point do Codex / outros agentes
├── README.md              # 🗺️ Este arquivo
│
├── context/               # 📚 Contexto técnico fatiado por tema
│   ├── 01-stack.md        # Stack, estrutura, convenções
│   ├── 02-auth.md         # Hierarquia de usuários, PCK_STH_STM
│   ├── 03-modules.md      # Lista de módulos, tabelas, chaves APEX
│   ├── 04-glossary.md     # Glossário HIGRA (RQ03, BOB, CNJ_MOT...)
│   └── 05-apex-source.md  # Como usar o f108.sql
│
├── plans/                 # 📋 Planos e regras
│   ├── migration-phases.md  # Fases 0 → 6
│   └── rules.md             # Regras absolutas (CRM, schemas...)
│
├── skills/                # 🛠️ Agentes especializados por domínio
│   ├── README.md          # Índice + como escolher skill
│   ├── 00-seguranca.md
│   ├── 01-dba.md
│   ├── …
│   └── 11-migracao-dados.md
│
├── settings.json          # ⚙️ Permissões de ferramentas (Bash, etc.)
└── settings.local.json    # ⚙️ Overrides locais (não commitar segredos)
```

Obs.: `BACKLOG.md` fica na **raiz do repo** (não em `.claude/`), porque o Claude Code
considera arquivos sob `.claude/` como sensíveis e bloqueia edits — o que atrapalharia
o loop de melhoria contínua que precisa marcar tarefas como `[x]`.

## Loop de melhoria contínua

`BACKLOG.md` (na raiz do repo) é consumido por `scripts/melhorar_continuo.{ps1,bat,sh}`.
O script pega a primeira linha `- [ ]`, invoca o Claude Code para implementar, marca `[x]`, commita e repete.

- Tarefas com `[P1]` rodam em **Opus** (refactor arquitetural)
- Demais rodam em **Sonnet** (UI/visual/bug fix)
- Log em `scripts/log_melhoria.txt`

Ver detalhes no cabeçalho dos próprios scripts.

## Princípio: uma verdade por tópico

- **Stack / convenções** → só em `context/01-stack.md`.
- **Hierarquia de usuários** → só em `context/02-auth.md`.
- **Plano de fases** → só em `plans/migration-phases.md`.
- **Regras absolutas** → só em `plans/rules.md`.

Se você precisa atualizar algo, **atualize no único lugar**. Não duplique.

## Por onde começar

1. Você é um **novo agente** entrando no repositório?
   → `CLAUDE.md` (Claude Code) ou `AGENTS.md` (Codex).
2. Vai implementar algo?
   → Leia `plans/rules.md` e a **skill** do domínio.
3. Em dúvida sobre regra de negócio?
   → `context/05-apex-source.md` ensina como consultar o `f108.sql`.

## Histórico

Reestruturado em 2026-04-15 a partir de:
- `CONTEXT.md` (196 linhas) → fatiado em `context/01-05`.
- `CLAUDE_SIGS_INSTRUCTIONS.md` (316 linhas) → dividido em `plans/migration-phases.md` + `plans/rules.md`.

Os arquivos antigos foram removidos após migração integral do conteúdo.
