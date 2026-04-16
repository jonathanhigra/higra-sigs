# Mapa de Páginas APEX → React (Portal SIGS App 108)

## Regras
- CRM (páginas 178, 213, 221, 451-490, etc.) = **EXCLUÍDO** — não existe neste projeto
- Tudo que é MODAL no APEX = Modal no React
- Tudo que é Kanban (PLUGIN_MATERIAL.KANBAN) = KanbanBoard no React
- Gráficos (NATIVE_JET_CHART) = Recharts no React
- LOVs = SELECT/dropdown com mesmos dados
- Posição dos campos/regiões = mesmo layout

## Páginas por Módulo (excluindo CRM)

### Página Inicial
| APEX | Tipo | React |
|------|------|-------|
| 11 - Página Inicial | NORMAL | /sigs (HomeDashboard) |
| 712 - Login | PUBLIC | /login |

### Indicadores / Metas (GES)
| APEX | Tipo | React |
|------|------|-------|
| 16 - Relação de Indicadores | NORMAL (IR) | /indicadores |
| 19 - Cadastro de Metas | NORMAL (Form+Chart) | /indicadores/metas/:id |
| 46 - Dashboard Indicadores | NORMAL (4 charts) | /indicadores/dashboard |
| 12 - Cadastro Registro Meta | MODAL | Modal em /indicadores/metas/:id |
| 56 - Cadastro Registro Meta | MODAL | Modal em /indicadores/metas/:id |
| 118 - Modal Indicadores | MODAL | Modal em /indicadores |
| 52 - Modal Plano Ação > Meta | MODAL | Modal vinculação |
| 57 - Relação Ações por Metas | MODAL | Modal lista |
| 21 - Ranking | NORMAL | /indicadores/ranking |

### Projetos (PRJT)
| APEX | Tipo | React |
|------|------|-------|
| 134 - Relação de Projetos | NORMAL (IR+Kanban+Dashboard) | /projetos |
| 204 - Visão Geral Projeto | NORMAL (Cards+10 Tabs+Kanban+Charts) | /projetos/:id |
| 203 - Modal Cadastro Projeto | MODAL | Modal em /projetos |
| 205 - Cadastro Anexo | MODAL | Modal em /projetos/:id |
| 325 - Visão Geral Modal | MODAL | Modal quick-view |
| 62 - Associar Tarefa | MODAL | Modal |
| 66 - Migração Tarefas | MODAL | Modal |
| 105 - Gastos Extras | MODAL | Modal |
| 436 - Editar Anotação | MODAL | Modal |
| 472 - Associar Negócio | MODAL | **EXCLUÍDO (CRM)** |
| 474 - Justificar Prazo | MODAL | Modal |
| 69 - Categorias | NORMAL | /projetos/config |
| 115 - Cadastro Categorias | NORMAL | /projetos/config |
| 409 - Etapas de Projetos | NORMAL | /projetos/config |
| 476 - Tipos de Anexo | NORMAL | /projetos/config |

### Planos de Ação (GACO)
| APEX | Tipo | React |
|------|------|-------|
| 3 - Planos de Ação | NORMAL (IR) | /planos-acao |
| 4 - Cadastro Plano Ação | NORMAL (Cards+Form+Reports) | /planos-acao/:id |
| 7 - Modal Plano de Ação | MODAL | Modal em /planos-acao |
| 5 - Cadastro Apontamento | MODAL | Modal |
| 15 - Registro Apontamento | MODAL (IG) | Modal com tabela editável |
| 45 - Detalhamento Apontamentos | MODAL (IR) | Modal |
| 67 - Associar Tarefa | MODAL | Modal |
| 117 - Plano de Emergência | MODAL | Modal |
| 13 - Relação de Siglas | NORMAL | /planos-acao/config |
| 14 - Cadastro de Siglas | NORMAL | /planos-acao/config |
| 42 - Relatório Apontamentos | NORMAL | /planos-acao/relatorio |

### Reuniões (RNOE)
| APEX | Tipo | React |
|------|------|-------|
| 20 - Relação de Agendas | NORMAL (IR) | /reunioes |
| 25 - Agenda (detalhe) | NORMAL (IG+Form+Reports+7 modais) | /reunioes/:id |
| 9 - Tipos de Reunião | NORMAL (IR) | /reunioes/config |
| 10 - Cadastro Tipo Reunião | NORMAL (Form) | /reunioes/config |
| 37 - Relação Agendas (alt) | NORMAL | /reunioes |
| 38 - Cadastro Agenda | NORMAL | Modal |
| 35 - Relação Decisões | NORMAL (IR) | /reunioes/:id tab |
| 47 - Decisões | NORMAL (Form) | inline |
| 6 - Modal Participante | MODAL | Modal |
| 8 - Anexo Reunião | MODAL | Modal |
| 30 - Anexo (alt) | MODAL | Modal |
| 36 - Log Reagendamentos | MODAL | Modal |
| 90 - Cadastro Reagendamento | MODAL | Modal |

### Documentos (DCMT)
| APEX | Tipo | React |
|------|------|-------|
| 73 - Relação Documentos | NORMAL (IR) | /documentos |
| 74 - Biblioteca | NORMAL (IR) | /documentos/biblioteca |
| 75 - Cadastro Documento | NORMAL (Form+Report) | /documentos/:id |
| 71 - Compartilhar | MODAL | Modal |
| 24 - Tipos Documento | NORMAL | /documentos/config |
| 40 - Cadastro Tipo | NORMAL (Form) | /documentos/config |

### Notas de Oportunidade / RQ49 (CMNA)
| APEX | Tipo | React |
|------|------|-------|
| 329 - Lista de NOs | NORMAL (Cards+Tabs) | /qualidade/rq49 |
| 319 - Visão Geral NO | NORMAL (Cards+Tabs+Análise) | /qualidade/rq49/:id |
| 320 - Cadastro NO | MODAL | Modal |
| 318 - Análise NO | MODAL | Modal |
| 308 - Cadastro Tipo | MODAL | Modal |
| 322 - Cadastro Origem | MODAL | Modal |
| 324 - Cadastro Classificação | MODAL | Modal |
| 328 - Adicionar Participante | MODAL | Modal |
| 330 - Adicionar Anexo | MODAL | Modal |
| 331 - Reavaliação Significância | MODAL | Modal |
| 334 - Anexo Criador | MODAL | Modal |
| 470 - Editar Anotação | MODAL | Modal |
| 321 - Origens | NORMAL | /qualidade/rq49/config |
| 323 - Configurações | NORMAL | /qualidade/rq49/config |
| 1 - Oportunidades (legado) | NORMAL | redirecionado para 329 |
| 59 - Relação NOs (legado) | NORMAL | redirecionado para 329 |

### Não Conformidades / RQ03 / RAM (RNCO)
| APEX | Tipo | React |
|------|------|-------|
| 354 - Lista de RNCs (novo) | NORMAL (Cards+Filtros) | /qualidade/rq03 |
| 359 - Visão Geral RAM | NORMAL (Cards+Tabs+Step modals) | /qualidade/rq03/:id |
| 360 - Modal Cadastro RAM | MODAL | Modal |
| 300 - Cadastro Participante | MODAL | Modal |
| 301 - Cadastro Anexo | MODAL | Modal |
| 368 - Análise Extensão | MODAL | Modal step |
| 371 - Análise Causa Raiz | MODAL | Modal step |
| 374 - Definição Causa Raiz | MODAL | Modal step |
| 377 - Análise Implementação | MODAL | Modal step |
| 378 - Análise Eficácia | MODAL | Modal step |
| 464 - Editar Anotação | MODAL | Modal |
| 501 - Dados Acidente (SST) | MODAL | Modal |
| 494 - Configurações RAM | NORMAL | /qualidade/rq03/config |
| 26 - Relação RNCs (legado) | NORMAL | redirecionado para 354 |
| 28 - Cadastro RNC (legado) | NORMAL | redirecionado para 359 |
| 22 - Modal RNC (legado) | MODAL | redirecionado |

### Fabricação / Checklists (CHKL)
| APEX | Tipo | React |
|------|------|-------|
| 278 - Lista Checklists | NORMAL (Kanban+Cards+Tabs+Charts) | /fabricacao |
| 291+ - Checklist Detail | NORMAL | /fabricacao/:id |
| Bobinagem pages | NORMAL | /fabricacao/:id/bobinagem |
| Montagem pages | NORMAL | /fabricacao/:id/montagem |
| Ensaio pages | NORMAL | /fabricacao/:id/ensaio |
| Expedição pages | NORMAL | /fabricacao/:id/expedicao |

### Motores / Engenharia (MTR)
| APEX | Tipo | React |
|------|------|-------|
| 350 - Rendimento | NORMAL | /motores |
| 355 - Configurações | NORMAL | /motores/config |
| 373 - Fichas Técnicas | MODAL | Modal |
| 369 - Folha de Dados | MODAL | Modal |
| 356 - Cadastro Bomba | MODAL | Modal |
| 362 - Cadastro Motor | MODAL | Modal |
| 370 - Cadastro Modelo | MODAL | Modal |
| 358 - Cadastro Sensor | MODAL | Modal |
| 363-367 - Cadastros auxiliares | MODAL | Modais |
| 376 - Preenchimento Ficha | MODAL | Modal |
| 386 - Confirmação Revisão | MODAL | Modal |
| 387 - Qtd Sensores | MODAL | Modal |
| 388 - Anexo Gráficos | MODAL | Modal |
| 389 - Cadastro Normas | MODAL | Modal |
| 390 - Cadastro Cargas | MODAL | Modal |
| 394 - Cadastro Carcaça | MODAL | Modal |
| 395 - Pacote Carcaça | MODAL | Modal |
| 396 - Cadastro Tensão | MODAL | Modal |

### Assistência Técnica (ASS)
| APEX | Tipo | React |
|------|------|-------|
| 375 - Lista Atendimentos | NORMAL (Kanban+Lista+Filtros) | /assistencia |
| 383 - Visão Geral Atendimento | NORMAL (Cards+Tabs) | /assistencia/:id |
| 382 - Cadastro Atendimento | MODAL | Modal |
| 392 - Registro Anexo | MODAL | Modal |
| 393 - Registro Equipamento | MODAL | Modal |
| 397 - Cadastro Laudo | MODAL | Modal |
| 445 - Associar RAM | MODAL | Modal |
| 384 - Tipos Atendimento | NORMAL | /assistencia/config |
| 385 - Cadastro Tipo | MODAL | Modal |
| 443 - Parâmetros | NORMAL | /assistencia/config |
| 444 - Config Parâmetros | MODAL | Modal |

### Chamados (CHM)
| APEX | Tipo | React |
|------|------|-------|
| (pages CHM) | NORMAL+MODAL | /chamados, /chamados/:id |
| 398 - Configurações | NORMAL | /chamados/config |
| 399 - Cadastro Tipo | MODAL | Modal |
| 326 - Anexação Documentos | MODAL | Modal |

### Laboratório (LABS)
| APEX | Tipo | React |
|------|------|-------|
| 514 - Agenda Ensaios | NORMAL | /laboratorio |
| 515 - Agendar Ensaio | MODAL | Modal |
| 516 - Tipos Agendamento | MODAL (60vw) | Modal large |
| 517 - Cadastrar Tipo | MODAL | Modal |
| 523 - Opções Agendamento | MODAL | Modal |
| 526 - Apontamento Horário | MODAL | Modal |
| 527 - Cancelar Agendamento | MODAL | Modal |
| 531 - Adiar Agendamento | MODAL | Modal |

### Configurações / Sistema
| APEX | Tipo | React |
|------|------|-------|
| 17 - Domínios | NORMAL (IR) | /config/dominios |
| 18 - Cadastro Domínios | NORMAL (Form+Report) | /config/dominios/:id |
| 43 - Configurações | NORMAL | /config |
| 107 - Usuários | NORMAL | /config/usuarios |
| 112 - Permissões | NORMAL | /config/permissoes |
| 23 - Cadastro Usuário | MODAL | Modal |
| 27 - Alterar Senha | MODAL | Modal |
| 41 - Organograma Processo | MODAL (525x1110) | Modal large |

## Gráficos (NATIVE_JET_CHART)
| Página | Tipo | Dados |
|--------|------|-------|
| 46 (Indicadores) | bar | Índice apontamentos por filial/mês |
| 46 (Indicadores) | pie | Metas atingidas total por filial |
| 46 (Indicadores) | bar | Metas atingidas mensal |
| 46 (Indicadores) | lineWithArea | Série temporal |
| 19 (Metas) | combo (line+bar+bar) | Realizado vs Planejado com semáforo |
| 134 (Projetos) | chart | Status projetos |
| 134 (Projetos) | chart | Status tarefas |
| 204 (Projeto Detail) | gauge/dial | Tarefas concluídas/total |
| 278 (Fabricação) | chart | Equipamentos por modelo |
| 278 (Fabricação) | chart | Prazo médio produção |

## Kanban (PLUGIN_MATERIAL.KANBAN)
| Página | Módulo | Drag? | Colunas |
|--------|--------|-------|---------|
| 134 | Projetos | YES | HGR_PRJ_REG_ETP_KBN |
| 204 | Tarefas no Projeto | YES | HGR_TAR_CAD_ETP_KBN |
| 278 | Fabricação | NO | HGR_FAB_CKL_CAD_ETP + estáticas |
| 375 | Assistência | YES | HGR_ASS_CFG_FNL_REG_ETP |
| 178 | CRM (EXCLUÍDO) | - | - |
| 221 | CRM Licitações (EXCLUÍDO) | - | - |
