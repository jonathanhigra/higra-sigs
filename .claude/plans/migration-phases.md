# Plano de Migração — Fases 0 → 6

> Execute as fases **em ordem**. Cada fase depende da anterior.

## FASE 0 — Fundação (FAZER PRIMEIRO)
**Objetivo:** infraestrutura de auth e permissões **idêntica ao Oracle**.

```
0.1  Tabelas de segurança
     → Criar: hgr_stm_cad_tipo_usu, hgr_stm_usu_reg_tp, hgr_stm_perm_menu
     → Popular tipos (A, D, G, F, I, R, L, P, GER_COM, ASS)
     → Garantir que beg_usuarios tenha: senha_hash, home_page_id, ativo

0.2  Auth Backend
     → POST /api/auth/login (email + senha → JWT com tipo_usuario, empresa_id, filial_id)
     → POST /api/auth/refresh
     → GET  /api/auth/me (dados do usuário + permissões)
     → Dependency: require_permission(mod_key, acesso='C'|'M')

0.3  Auth Frontend
     → Tela de login (replicar visual do APEX pg 712)
     → Context de auth (token, user, permissões)
     → Menu lateral condicional por permissão (replicar FNC_PERM_MENU)
     → Route guards por módulo

0.4  Admin: Gestão de Permissões
     → CRUD tipos de usuário
     → CRUD permissões por tipo (módulo + rota + acesso C/M/R)
     → CRUD usuários (vincular a empresa, filial, processo, tipo)
     → Tela de Preferências (somente tipo 'A')
```

**Skill:** `.claude/skills/00-seguranca.md`.

## FASE 1 — Base (P0)
**Objetivo:** cadastros fundamentais usados por todos os módulos.

```
1.1  Cadastros Base
     → Empresas (sth_cad_empresa)
     → Filiais (sth_cad_filial)
     → Processos (beg_processo)
     → Domínios/LOVs (beg_dominio, beg_valor_dominio) — 265 LOVs no APEX
     → Usuários (beg_usuarios + vínculos)

1.2  Tarefas (módulo central — 6 tabelas)
     → CRUD + Kanban + Apontamento de horas
     → É dependência de: CRM, Projetos, Reuniões, Chamados, Assistência, GAC, Comunicação

1.3  Página Inicial
     → Widgets: tarefas pendentes, acesso rápido aos módulos, ranking
     → Respeitar home_page_id personalizada por usuário
```

**Skills:** `02-backend-core.md`, `03-frontend.md`, `08-projetos-tarefas.md`.

## FASE 2 — Gestão (P1)
**Objetivo:** módulos usados pela diretoria e gerência.

```
2.1  Indicadores / Metas (9 tabelas, APEX key: GES)
     → Dashboard com semáforos (verde/amarelo/vermelho)
     → Apontamentos por período
     → Ranking/gamificação (XP)
     → Custo homem-hora

2.2  Projetos (16 tabelas, APEX key: PRJT)
     → CRUD + etapas Kanban + participantes + gastos extras
     → Integração com Tarefas e CRM (negócios vinculados)

2.3  Reuniões / Comunicação (16 tabelas, APEX keys: RNOE, EVT)
     → Agendas + pautas + participantes + decisões + ações
     → Ações de reunião geram tarefas automaticamente

2.4  Documentos (5 tabelas, APEX key: DCMT)
     → CRUD + revisões com versionamento + compartilhamento por usuário

2.5  Planos de Ação / GAC (3 tabelas, APEX key: GACO)
     → Vinculado a RQ03, RQ49, RQ80 e metas
```

**Skill principal:** `.claude/skills/08-projetos-tarefas.md` (+ `04-qualidade.md` para 2.1).

## FASE 3 — Qualidade (P1-P2)
**Objetivo:** sistema de gestão da qualidade (SGQ).

```
3.1  Não Conformidades RQ03 (7 tabelas, APEX key: RNCO)
     → Fluxo: Abertura → Análise → Ação Corretiva → Verificação → Fechamento
     → Sub-formulário SST quando é acidente de trabalho
     → Gera Plano de Ação (GAC)

3.2  Notas de Oportunidade RQ49 (7 tabelas, APEX key: CMNA)
     → Fluxo: Abertura → Análise → Avaliação → Implementação → Verificação

3.3  Auditorias RQ80 (3 tabelas)
3.4  Análise de Mudança RQ94 (1 tabela)
3.5  Cadastros SST (4 tabelas)
```

**Skill:** `.claude/skills/04-qualidade.md`.

## FASE 4 — Industrial (P2)
**Objetivo:** produção, engenharia e pós-venda.

```
4.1  Fabricação / Checklists (63 tabelas, APEX key: CHKL)
     → O MAIOR módulo — tabelas com 60 a 165 colunas
     → Step-by-step: BOB → CNJ_MOT → ENS_HID → PIN → QLD → MNT → EXP → EMB
     → Instrumentos de medição com calibração

4.2  Motores / Engenharia (21 tabelas)
     → Fichas técnicas, modelos, bombas, folha de dados (PDF)

4.3  Assistência Técnica (27 tabelas)
     → Atendimentos com funil de etapas
     → Permissões especiais (tipo ASS, PCK_HGR_ASS)
     → Integra com CRM, Fabricação, Qualidade, Service

4.4  Service / Laudos (9 tabelas)
     → Laudos técnicos, autorizadas, técnicos, garantias

4.5  Chamados (11 tabelas)
     → CRUD + comentários + histórico de status + categorias por tipo
```

**Skills:** `05-fabricacao.md`, `06-motores.md`, `07-assistencia.md`.

## FASE 5 — Complementos (P3)
```
5.1  Laboratório / Bancada (15 tabelas, APEX key: LABS)
     → Testes com equipes, bancada com curvas de performance
     → Tipo de usuário 'L' e sub-tipos (operador, supervisor)

5.2  Pedidos / ERP Focco (read-only)
5.3  Biblioteca (APEX key: BIBL)
```

**Skill:** `.claude/skills/10-laboratorio.md`.

## FASE 6 — Migração de Dados (Oracle → PostgreSQL)
```
6.1  Extração Oracle (schema HGRHML)
     → Scripts Python com cx_Oracle/oracledb para extrair CSVs
     → BLOBs exportados como arquivos separados
     → Encoding: WE8MSWIN1252 → UTF-8

6.2  Transformação
     → Mapeamento de tipos (NUMBER→INT/BIGINT, VARCHAR2→VARCHAR, DATE→TIMESTAMPTZ)
     → Tratamento de NULLs, datas, números com vírgula BR
     → Preservação de IDs originais

6.3  Carga no PostgreSQL
     → Ordem de carga respeitando FKs (~200 tabelas em sequência)
     → ON CONFLICT DO NOTHING (idempotente, re-executável)
     → Ajuste de sequências BIGSERIAL após carga

6.4  Validação
     → Comparação de contagens Oracle vs PostgreSQL
     → Verificação de integridade referencial
     → Teste de sequências (MAX(id) < next_val)
```

**Skill:** `.claude/skills/11-migracao-dados.md`.

---

## Etapa 1 — Reconhecimento (antes de qualquer implementação)

```bash
# 1. Estrutura do projeto
find . -type f \( -name "*.py" -o -name "*.jsx" -o -name "*.js" \) \
  | grep -v node_modules | grep -v venv | head -100

# 2. Backend atual
cat backend/main.py
ls backend/routes/
ls backend/auth/

# 3. Frontend atual
cat frontend/src/App.jsx
ls frontend/src/pages/

# 4. Verificar tabelas de segurança
# psql higra_sigs -c "\dt public.hgr_stm_*"
# psql higra_sigs -c "\dt public.beg_*"

# 5. Confirmar que CRM existe (NÃO MEXER)
ls backend/routes/crm/ 2>/dev/null
ls frontend/src/pages/crm/ 2>/dev/null
```

**Relate o que encontrou antes de prosseguir com a implementação.**
