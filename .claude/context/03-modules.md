# Módulos do SIGS — mapa, tabelas e chaves APEX

## Números do Portal SIGS (export APEX real)

| Métrica                | Valor |
|------------------------|-------|
| Páginas APEX           | 552   |
| Items de formulário    | 7.979 |
| Validações             | 451   |
| Processos PL/SQL       | 1.889 |
| Regiões                | 2.386 |
| Botões                 | 1.937 |
| Dynamic Actions        | 1.607 |
| LOVs                   | 265   |
| Plug-ins               | 36    |
| Page Groups            | 18    |
| Navigation Lists       | 18    |

## Lista de módulos

| Módulo                         | Tabelas          | Chave APEX    | Status               | Skill                          |
|--------------------------------|------------------|---------------|----------------------|--------------------------------|
| CRM / Comercial                | 92 (schema `crm`) | `CRM`         | Já implementado      | — (não mexer)                  |
| Cadastros Base                 | 32                | —             | A criar              | —                              |
| Tarefas                        | 6                 | —             | A criar              | `08-projetos-tarefas.md`       |
| Indicadores / Metas            | 9                 | `GES`         | A criar              | `04-qualidade.md`              |
| Reuniões / Comunicação         | 16                | `RNOE` / `EVT` | A criar              | `08-projetos-tarefas.md`       |
| Não Conformidades (RQ03)       | 7                 | `RNCO` / `QLDD` | A criar              | `04-qualidade.md`              |
| Notas de Oportunidade (RQ49)   | 7                 | `CMNA`        | A criar              | `04-qualidade.md`              |
| Auditorias (RQ80)              | 3                 | —             | A criar              | `04-qualidade.md`              |
| Análise de Mudança (RQ94)      | 1                 | —             | A criar              | `04-qualidade.md`              |
| Projetos                       | 16                | `PRJT`        | A criar              | `08-projetos-tarefas.md`       |
| Planos de Ação (GAC)           | 3                 | `GACO`        | A criar              | `08-projetos-tarefas.md`       |
| Documentos                     | 5                 | `DCMT`        | A criar              | `08-projetos-tarefas.md`       |
| Fabricação / Checklists        | 63                | `CHKL`        | A criar              | `05-fabricacao.md`             |
| Motores / Engenharia           | 21                | —             | A criar              | `06-motores.md`                |
| Assistência Técnica            | 27                | —             | A criar              | `07-assistencia.md`            |
| Service / Laudos               | 9                 | —             | A criar              | `07-assistencia.md`            |
| Chamados                       | 11                | —             | A criar              | `07-assistencia.md`            |
| Laboratório / Bancada          | 15                | `LABS`        | A criar              | `10-laboratorio.md`            |

## Integrações entre módulos

```
Tarefas           ──► Projetos, Planos de Ação, Reuniões, CRM,
                      Chamados, Assistência, Comunicação

Projetos          ──► CRM (negócios), Oportunidades

Não Conformidades ──► Assistência (RQ03), Planos de Ação (GAC)

Fabricação        ──► Motores (dados técnicos), Assistência (checklists)

Assistência       ──► CRM (negócios), Fabricação, Service (laudos),
                      Qualidade (RQ03)
```

## Onde ir a partir daqui
- Detalhes de um módulo específico: abra o skill correspondente em `.claude/skills/`.
- Plano de execução por fase: `.claude/plans/migration-phases.md`.
- Regras absolutas (CRM, schemas, etc.): `.claude/plans/rules.md`.
