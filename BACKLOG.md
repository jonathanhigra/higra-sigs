# HIGRA SIGS — Backlog de Melhorias

> Este arquivo é lido automaticamente pelo script de melhoria contínua
> (`scripts/melhorar_continuo.ps1` no Windows, `.sh` no Linux).
>
> O Claude pega a **primeira tarefa não marcada** (`- [ ]`), implementa,
> marca como `[x]` e faz commit. Depois pega a próxima, e assim por diante.
>
> **Prioridade:** tarefas marcadas com `[P1]` (ex.: `- [ ] [P1] 123. ...`)
> rodam em Claude **Opus** (raciocínio arquitetural / refactors grandes).
> Demais rodam em **Sonnet** (mais barato/rápido, suficiente para UI/visual).
>
> **Regras que o loop respeita** (definidas em `.claude/plans/rules.md`):
> - NÃO MEXER no CRM (`crm.*`, `routes/crm/`, `pages/crm/`)
> - NÃO ALTERAR tabelas existentes no schema `public` sem confirmar
> - SQL puro com psycopg2 (sem ORM), Pydantic, paginação obrigatória
> - `require_permission(MOD_KEY)` em endpoints protegidos
> - CSS puro (sem Tailwind)

---

## 01 — Qualidade (RQ03, RQ49, RQ80) (001-020)

- [x] 001. Adicionar filtro "Vencendo em 7 dias" na lista de RQ03
- [x] 002. Mostrar avatar circular do responsável em cada card do RQ49List
- [x] 003. Adicionar tooltip ao hover em status badge mostrando histórico de mudanças
- [x] 004. Implementar export CSV dos RQ03 filtrados (usando utils/format.js toCSV)
- [x] 005. Adicionar badge "SST" destacado em RQ03 que é acidente de trabalho
- [x] 006. [P1] 006. Refactor da página de análise de significância do RQ49 (matriz visual 5x5)
- [x] 007. Adicionar mini-gráfico de evolução do RQ03 (aberta → em análise → fechada)
- [x] 008. Mostrar quantas ações corretivas do RQ03 têm prazo vencido
- [x] 009. Implementar notificação no sidebar com contagem de RQ03 aguardando ação
- [x] 010. Adicionar filtro por origem (cliente/interna/auditoria) no RQ03List

## 02 — Fabricação / Checklists (021-040)

- [x] 021. Adicionar progress bar visual no card de cada checklist (BOB → CNJ_MOT → ENS_HID → EXP)
- [x] 022. Mostrar alerta quando etapa está parada há mais de 48h
- [x] 023. Implementar filtro por modelo de motor na FabricacaoList
- [x] 024. Adicionar indicador visual de calibração vencida nos instrumentos
- [x] 025. [P1] 025. Criar dashboard de produtividade por etapa (média de horas por etapa/motor)
- [x] 026. Exportar ficha técnica do checklist em PDF formatado
- [x] 027. Adicionar filtro "com ensaio hidroenergético realizado" na lista
- [x] 028. Mostrar preview das últimas 3 observações de cada etapa no hover

## 03 — Tarefas / Projetos / Reuniões (041-060)

- [x] 041. Adicionar view "Kanban" alternativa à lista de tarefas
- [x] 042. Implementar drag-and-drop para mudar status de tarefa
- [x] 043. Adicionar agenda visual (calendário) das reuniões do mês
- [x] 044. Mostrar quantidade de tarefas criadas a partir de cada reunião
- [x] 045. Implementar notificação 15min antes de reunião começar
- [x] 046. Adicionar filtro "somente tarefas que preciso aprovar" para gerentes
- [x] 047. Mostrar timeline de etapas no ProjetoDetail com marcos
- [x] 048. Implementar ações em lote na lista de tarefas (concluir, reatribuir)

## 04 — Assistência Técnica / Chamados (061-080)

- [x] 061. Adicionar SLA visual em cada chamado (tempo desde abertura)
- [x] 062. Implementar filtro por severidade com ícones coloridos
- [x] 063. Mostrar histórico de assistências por cliente no AssistenciaDetail
- [x] 064. [P1] 064. Integrar timeline de chamado+assistência+RQ03 na visão cliente

## 05 — Laboratório / Bancada (081-100)

- [x] 081. Adicionar gráfico de curva de performance sobreposto ao padrão do modelo
- [x] 082. Implementar comparação side-by-side de dois testes
- [x] 083. Mostrar badge "dentro do padrão" / "fora do padrão" em cada ensaio
- [x] 084. Adicionar exportação dos resultados do ensaio em Excel

## 06 — Indicadores / Metas (101-120)

- [x] 101. Adicionar semáforo (verde/amarelo/vermelho) em cada card de meta
- [x] 102. Implementar drill-down ao clicar numa meta (detalhe dos apontamentos)
- [x] 103. Mostrar ranking de top 5 performers na home
- [x] 104. [P1] 104. Dashboard comparativo meta × realizado (gráfico temporal)

## 07 — UX global / polimento (121-150)

- [x] 121. Adicionar breadcrumbs em todas as páginas de detalhe (usar components/ui/Breadcrumbs)
- [x] 122. Substituir todos os "Carregando..." por Skeleton components
- [x] 123. Adicionar empty states ilustrados em todas as listas
- [x] 124. Implementar shortcuts de navegação (G + H = home, G + T = tarefas)
- [x] 125. Mostrar RelativeTime ("há 2h") em vez de datas absolutas em históricos
- [x] 126. Adicionar CopyButton em códigos (RQ03-123, NO-456, etc.)
- [x] 127. Implementar pull-to-refresh em listas mobile
- [x] 128. Adicionar filtros salvos (salvar combinação de filtros favoritos)

## 08 — Acessibilidade (151-170)

- [x] 151. Audit WCAG AA em todas as páginas de detalhe
- [x] 152. Adicionar aria-labels em todos os botões de ícone
- [x] 153. Testar navegação 100% por teclado nas páginas críticas
- [x] 154. Adicionar modo alto contraste opcional
- [x] 155. Verificar que todos os formulários têm labels associados

## 09 — Performance (171-190)

- [x] 171. Implementar virtualização em listas com >100 itens
- [x] 172. [P1] 171. Adicionar React.memo nos componentes pesados (tabelas, cards)
- [x] 173. Debounce em todas as buscas (já temos useDebouncedValue)
- [x] 174. Lazy-load de imagens em galeria de evidências
- [x] 175. Cache com stale-while-revalidate nas requests de LOVs

## 10 — Backend (191-210)

- [x] 191. Adicionar índices sugeridos pelo pgBadger nas queries lentas
- [x] 192. [P1] 191. Implementar cursor-based pagination nos endpoints com >10k registros
- [x] 193. Adicionar cache Redis para LOVs (TTL 1h)
- [x] 194. Rate limit por usuário (não só IP) nos endpoints sensíveis
- [x] 195. Adicionar logs estruturados (JSON) para correlação de requests

---

---

# Migração APEX — páginas e endpoints faltantes (196-695)

> **Contexto:** Portal SIGS original tem 552 páginas APEX (ver `.claude/context/03-modules.md`).
> O frontend atual tem apenas 42 páginas SIGS. Há gap substancial.
>
> Referências:
> - Screenshots: `C:/Users/user/OneDrive - HIGRA INDL LTDA/Área de Trabalho/screenshots_sigs/`
>   (152 prints — CRM 110 [NÃO MEXER] + ASS 42)
> - Export APEX: `C:/Users/user/Downloads/f108_extract/f108.sql`
> - Skills: `.claude/skills/` (11 agentes especializados por domínio)
>
> **Orientação para o loop:**
> - Antes de criar página nova: `grep -r "NomeDaPagina" frontend/src/pages/` para ver se já existe
> - Antes de criar endpoint: verificar `backend/routes/<modulo>/` para evitar duplicação
> - Sempre usar padrão existente (skeleton, PlanoDetail.css, useToast, require_permission)
> - Sempre respeitar hierarquia de permissões (tipo A,D,G,F,I,R,L,P,GER_COM,ASS)
> - Sempre qualificar tabelas com schema (`public.*` ou `crm.*`)

## 11 — Assistência Técnica (196-255)

> Screenshots ASS disponíveis: P0375-P0546. Skill: `.claude/skills/07-assistencia.md`.

- [x] 196. Criar página "Visão Geral de Atendimento" (AssistenciaDetail) com tabs: Dados, Equipamentos, Anexos, Equipe, Laudos, Checklists, Negócios vinculados — ref: P0383
- [x] 197. Adicionar tab "Imagens" em AssistenciaDetail com galeria dos anexos de imagem — ref: P0427
- [x] 198. Implementar form de Cadastro de Atendimento completo com tipo, canal, responsável, empresa, unidade, equipamento — ref: P0382
- [x] 199. Criar página "Lista de Tipos de Atendimento" com CRUD — ref: P0384
- [x] 200. Criar form "Cadastro de Tipo de Atendimento" com campos: descrição, categoria, canal default, SLA — ref: P0385
- [x] 201. Adicionar modal "Registro de Anexo no Atendimento" com upload de arquivo + descrição + tipo_anexo — ref: P0392
- [x] 202. Adicionar modal "Registro de Equipamento no Atendimento" com busca/cadastro de equipamento + motivo — ref: P0393
- [x] 203. Adicionar modal "Cadastro de Laudo Técnico / Manutenção" (pg 397) integrado ao atendimento — ref: P0397
- [x] 204. Implementar "Editar Anotação de Atendimento" inline com histórico de edições — ref: P0401
- [x] 205. Adicionar ação "Criar Negócio no Atendimento" que abre modal do CRM pré-preenchido — ref: P0402
- [x] 206. Adicionar modal "Associar Negócio ao Atendimento" com busca de negócios do CRM — ref: P0403
- [x] 207. Adicionar modal "Associar Laudo ao Atendimento" com busca de laudos existentes — ref: P0404
- [x] 208. Adicionar modal "Associar Checklist ao Atendimento" com busca de checklists de fabricação — ref: P0405
- [x] 209. Adicionar modal "Associar Empresa Existente" ao atendimento (cliente) — ref: P0410
- [x] 210. Criar página "Cadastro de Participante" (técnico/equipe) com permissões — ref: P0411
- [x] 211. Criar página "Cadastro de Status de Atendimento" (CRUD) — ref: P0413
- [x] 212. Adicionar modal "Associar Unidades Existentes" ao atendimento — ref: P0414
- [x] 213. Criar página "Cadastro de Permissão de Visualização" para ASS — ref: P0416
- [x] 214. Implementar "Vincular Usuário a Permissão" com multi-select — ref: P0417
- [x] 215. [P1] 215. Adicionar seção "Equipe do Atendimento" com drag-and-drop para adicionar membros — ref: P0419
- [x] 216. Criar página "Registro de Unidades por Usuário" (distribuição) — ref: P0420
- [x] 217. Criar form "Cadastro de Usuário" específico de ASS com permissões — ref: P0422
- [x] 218. Criar form "Cadastro de Empresa" dentro do fluxo ASS — ref: P0424
- [x] 219. Criar form "Cadastro de Unidade" (filial do cliente) — ref: P0425
- [x] 220. Implementar visualizador de imagens de laudo técnico com zoom + anotação — ref: P0426
- [x] 221. Implementar visualizador de imagens do atendimento com lightbox — ref: P0427
- [x] 222. Implementar visualizador de imagens do cadastro (capa, logo) — ref: P0428
- [x] 223. Adicionar modal "Vincular Atendimento" (relacionar atendimentos entre si) — ref: P0429
- [x] 224. Criar página "Cadastro de Canal de Entrada" (telefone, email, presencial, site) — ref: P0432
- [x] 225. Adicionar modal "Vincular Usuário Existente" à equipe — ref: P0433
- [x] 226. Criar página "Cadastro de Permissão de Acesso" (granularidade adicional) — ref: P0434
- [x] 227. Criar form "Cadastro de Cliente" no fluxo ASS com validação CNPJ — ref: P0438
- [x] 228. Adicionar modal "Configuração de Parâmetros" da AT (SLAs, autoresponder, etc.) — ref: P0444
- [x] 229. Adicionar modal "Associar RAM (Relatório de Ação de Manutenção) ao Atendimento" — ref: P0445
- [x] 230. Criar página "Cadastro de Tipo de Atividade" em ASS — ref: P0447
- [x] 231. Criar page "Cadastro de Atividade" (checkpoint do atendimento) — ref: P0448
- [x] 232. Adicionar modal "Associar Atendimento ao Laudo Técnico" (inverso) — ref: P0533
- [x] 233. Criar page "Cadastro de Categoria de Tipo de Atendimento" — ref: P0543
- [x] 234. Criar page "Funis de Atendimento" (configuração de fluxos) — ref: P0544
- [x] 235. Criar form "Cadastro de Funil de Atendimento" com etapas ordenadas — ref: P0545
- [x] 236. Criar form "Cadastro de Etapa de Funil de Atendimento" com regras de transição — ref: P0546
- [x] 237. Implementar Kanban de atendimentos por etapa do funil (alternativa à lista)
- [x] 238. Adicionar timer de SLA visível no header do AssistenciaDetail (baseado no tipo+canal)
- [x] 239. Criar dashboard de AT: atendimentos por etapa, por técnico, por tipo, SLA vencidos
- [x] 240. Implementar filtro "Meus atendimentos" vs "Todos" em AssistenciaList
- [x] 241. Adicionar badge de prioridade visual (baixa/média/alta/crítica) em cada card
- [x] 242. [P1] 242. Integrar PCK_HGR_ASS: portar funções FNC_* de permissões específicas do módulo ASS
- [x] 243. Implementar notificação automática ao responsável quando atendimento muda de etapa
- [x] 244. Adicionar histórico completo de mudanças de status em AssistenciaDetail
- [x] 245. Criar endpoint `GET /api/assistencia/{id}/timeline` com todas as atividades/anotações/status
- [x] 246. Implementar export CSV da lista de atendimentos (usar toCSV de utils/format.js)
- [x] 247. Adicionar campo "Garantia" no atendimento (S/N + observação) — ver tabelas de garantia em engenharia
- [x] 248. Adicionar seção "Peças Utilizadas" no atendimento (catálogo de produtos)
- [x] 249. Criar modal "Solicitar Autorização" quando atendimento excede custo limite
- [x] 250. Implementar vinculação múltipla: atendimento ↔ chamado ↔ RQ03 (mesma origem de reclamação)
- [x] 251. Adicionar campo "Deslocamento" (km percorridos) para cálculo de custo
- [x] 252. Implementar assinatura digital de laudo no mobile (canvas + base64)
- [x] 253. Adicionar geolocalização no atendimento (lat/lng + embed do mapa)
- [x] 254. Criar filtro avançado em AssistenciaList: por cliente, canal, técnico, SLA, período
- [x] 255. Adicionar ações em lote: atribuir técnico, mudar status, exportar

## 12 — Qualidade: RQ03, RQ49, RQ80, RQ94, SST (256-310)

> Skill: `.claude/skills/04-qualidade.md`. Backend: `rq03.py` + `rq49.py` + `rq80.py` existem.

- [x] 256. Implementar sub-form SST (acidente de trabalho) em RQ03Detail quando `ind_acidente='S'`
- [x] 257. Criar tabela `public.beg_rq03_sst` (agente causador, parte do corpo, classificação CAT) se não existir
- [x] 258. Implementar "Análise de Causa Raiz" em RQ03Detail com 5 Porquês (árvore visual)
- [x] 259. Implementar "Análise de Extensão" em RQ03Detail (afeta outros produtos/processos?)
- [x] 260. Implementar "Análise de Implementação" (a ação foi implementada? evidências)
- [x] 261. Implementar "Análise de Eficácia" com período de observação configurável
- [x] 262. Adicionar modal "Ação de Contenção" (imediata, antes da corretiva) em RQ03
- [x] 263. Adicionar uploads "Evidência Anterior" e "Evidência Depois" (antes/depois) em RQ03
- [x] 264. Criar form "Cadastro de Agente Causador" (CRUD) usado em SST
- [x] 265. Criar form "Cadastro de Classificação Primária" (tipo de NC: produto, processo, sistema)
- [x] 266. Criar form "Cadastro de Classificação Secundária" (subcategoria)
- [x] 267. [P1] 267. Implementar fluxo completo RQ03: Abertura → Análise → Ação Corretiva → Verificação → Fechamento (state machine)
- [x] 268. Adicionar campo "Origem" no RQ03 (cliente / interna / auditoria / fornecedor)
- [x] 269. Implementar auto-geração de Plano de Ação (GAC) ao fechar análise de RQ03
- [x] 270. Adicionar botão "Imprimir RQ03" com layout profissional (PDF via backend)
- [x] 271. Implementar ranking de causas mais frequentes de NC (Pareto)
- [x] 272. Adicionar indicador "tempo médio de fechamento de NC" no dashboard de qualidade
- [x] 273. Criar página "Cadastro Nota de Oportunidade" (RQ49) para criação rápida
- [x] 274. Implementar "Análise de Nota de Oportunidade" em RQ49Detail (além da significância)
- [x] 275. Adicionar modal "Associar Projeto a Nota de Oportunidade" com busca
- [x] 276. Adicionar modal "Associar Tarefa a Nota de Oportunidade"
- [x] 277. Implementar "Anexo de Gráficos" em RQ49 (upload de PNG/SVG com legendas)
- [x] 278. Adicionar campos "Implementação" e "Verificação Final" no fluxo RQ49
- [x] 279. Criar página "Avaliação de Eficácia" (follow-up de RQ49 fechada)
- [x] 280. Implementar dashboard RQ49: abertas, em análise, procedentes/improcedentes, fechadas (por período)
- [x] 281. Criar página "Auditoria Interna RQ80" (lista)
- [x] 282. Criar form "Cadastro de Auditoria" com tipo (interna/externa), escopo, auditor, auditado
- [x] 283. Implementar checklist de auditoria dinâmico (questionário configurável)
- [x] 284. Adicionar "Registro de Constatações" na auditoria (vira RQ03 se for NC)
- [x] 285. Implementar "Cronograma de Auditorias" (calendário anual)
- [x] 286. Criar página "Análise de Mudança RQ94" (lista)
- [x] 287. Criar form "Cadastro de Análise de Mudança" com impacto, aprovadores, riscos
- [x] 288. Implementar workflow de aprovação de RQ94 (escalonamento)
- [x] 289. Adicionar seção "Planos de Ação Relacionados" em RQ94
- [x] 290. Criar página "Cadastros SST" (hub: agentes, partes do corpo, tipos de acidente, CIPA)
- [x] 291. Criar form "Parte do Corpo Afetada" (lesão) com imagem de referência
- [x] 292. Criar form "Tipo de Acidente" (típico, trajeto, doença ocupacional)
- [x] 293. Implementar relatório "CAT" (Comunicação de Acidente de Trabalho) exportável
- [x] 294. Adicionar campo "Dias afastamento" no RQ03 quando SST
- [x] 295. Adicionar campo "Custos relacionados" no RQ03 (R$ com tabela de componentes)
- [x] 296. Implementar "Matriz de Risco" configurável por tipo de não conformidade
- [x] 297. Criar endpoint `GET /api/qualidade/indicadores` (índice de eficácia, reincidência, tempo médio)
- [x] 298. Adicionar timeline unificada em RQ03Detail (status + análises + anotações + equipe)
- [x] 299. Implementar anotações colaborativas no RQ03 (comentários com @mention)
- [x] 300. Adicionar sub-módulo "FMEA" (Análise de Modo e Efeito de Falha) como ferramenta de qualidade
- [x] 301. Criar página "Indicadores da Qualidade" (taxa NC por mês, tempo médio fechamento)
- [x] 302. Implementar filtro "RQ03 com ação corretiva vencida" em RQ03List
- [x] 303. Adicionar exportação do RQ03 completo em PDF (layout oficial HIGRA)
- [x] 304. Implementar "Reabertura de RQ03" com justificativa obrigatória
- [x] 305. Adicionar coluna "Responsável pela ação" em RQ03List
- [x] 306. Implementar notificação por e-mail ao responsável quando RQ03 muda de etapa
- [x] 307. Adicionar campo "Produto/Lote afetado" em RQ03 com link ao módulo Motores
- [x] 308. Implementar "Rastreabilidade" do RQ03 (outros lotes/atendimentos com o mesmo defeito)
- [x] 309. Criar página de detalhe consolidado para Diretoria: RQ03+RQ49+RQ80 abertas
- [x] 310. Adicionar modal "Encerrar RQ03" com checklist (ação implementada? eficácia verificada?)

## 13 — Fabricação / Checklists (311-390)

> MAIOR módulo: 63 tabelas, 90 páginas APEX. Skill: `.claude/skills/05-fabricacao.md`.
> Sequência de etapas: BOB → CNJ_MOT → ENS_HID → PIN → QLD → MNT → EXP → EMB.

- [x] 311. [P1] 311. Arquitetura: ChecklistDetail com Stepper visual de todas as etapas (BOB → EMB) e progresso linear
- [x] 312. Criar form "Cadastro de Checklist" (novo checklist associado a ordem/motor)
- [x] 313. Implementar etapa "Bobinagem" (BOB) com campos: bitola, fabricante, resistência, impedância
- [x] 314. Criar form "Cadastro de Bobinado" (registro detalhado de cada bobina)
- [x] 315. Criar page "Cadastro de Bitola de Fio" (CRUD tabela auxiliar)
- [x] 316. Criar page "Cadastro de Fabricante de Fio" (CRUD)
- [x] 317. Implementar etapa "Conjunto Motor" (CNJ_MOT) com componentes: carcaça, rotor, estator, tampas
- [x] 318. Criar form "Cadastro de Carcaça" (tipo, material, acabamento)
- [x] 319. Implementar etapa "Ensaio Hidroenergético" (ENS_HID) com leituras de vazão/pressão/rendimento
- [x] 320. Adicionar gráfico de curva de ensaio hidroenergético (XY real vs padrão)
- [x] 321. Criar form "Cadastro de Acionamento" (tipo: direto, estrela-triângulo, soft-starter, VFD)
- [x] 322. Implementar etapa "Pintura" (PIN) com campos: cor, espessura, lote de tinta
- [x] 323. Criar page "Cadastro de Cor de Tinta" (RAL + nome comercial + fornecedor)
- [x] 324. Implementar etapa "Qualidade" (QLD) com dupla checagem e assinatura digital
- [x] 325. Implementar etapa "Manutenção" (MNT) para motores retornados
- [x] 326. Implementar etapa "Expedição" (EXP) com nota fiscal, destinatário, transportadora
- [x] 327. Implementar etapa "Embalagem" (EMB) com tipo, peso, dimensões
- [x] 328. Criar form "Cadastro de Empacotamento" (tipo: caixa, pallet, engradado)
- [x] 329. Criar page "Cadastro de Instrumento de Medição" (CRUD)
- [x] 330. Adicionar campo "Calibração" (vencimento + certificado) no instrumento
- [x] 331. Criar form "Cadastro de Certificado de Calibração" (upload PDF, laboratório, data)
- [x] 332. Implementar alerta visual em InstrumentosList quando calibração vence em <30 dias
- [x] 333. Criar page "Cadastro de Forma Construtiva" (vertical submersível, horizontal, etc.)
- [x] 334. Criar form "Cadastro de Cabo" (tipo, seção, cor, comprimento)
- [x] 335. Criar form "Cabos de Ligação" (ligação motor-painel: tamanho, protecão)
- [x] 336. Criar form "Cadastro de Cargas" (carga teste: peso, tipo, duração)
- [x] 337. Criar form "Cadastro de Chicote / Sensor" (chicote de sensores do motor)
- [x] 338. Criar form "Cadastro de Tipo de Sensor" (PT100, termistor, vibração, etc.)
- [x] 339. Criar form "Cadastro Qtd. de Sensores" (quantidade por tipo por motor)
- [x] 340. Criar form "Cadastro de Tensão" (127V, 220V, 380V, 440V, 760V)
- [x] 341. Criar page "Registro de Tensões" (tensões aplicadas em cada ensaio)
- [x] 342. Criar form "Cadastro de Fornecedor" (no contexto fabricação — de componentes)
- [x] 343. Criar page "Lista de Fornecedores" específica de fabricação
- [x] 344. Implementar "Alterações Feitas no Equipamento" (log de modificações no motor durante fabricação)
- [x] 345. Adicionar campo "Pressão de teste" no ensaio hidroenergético
- [x] 346. Adicionar campo "Rendimento" no ensaio (calculado ou manual)
- [x] 347. Implementar página "Dashboard de Fabricação" (motores em cada etapa, SLA por etapa)
- [x] 348. Adicionar timer por etapa (tempo gasto na etapa atual)
- [x] 349. Implementar "Kanban Fabricação" (cards de motores movendo entre etapas BOB → EMB)
- [x] 350. Adicionar botão "Passar Etapa" com validação dos campos obrigatórios da etapa
- [x] 351. Implementar "Retornar Etapa" com justificativa (retrabalho)
- [x] 352. Adicionar seção "Observações" por etapa em ChecklistDetail
- [x] 353. Implementar upload de fotos por etapa (evidência visual do avanço)
- [x] 354. Adicionar checklist de QLD pré-etapa de expedição (campos obrigatórios)
- [x] 355. Criar página "Histórico de Manutenções" por motor (consulta cruzada)
- [x] 356. Implementar "Certificado do Produto" (PDF com dados de todas as etapas)
- [x] 357. Adicionar assinatura do bobinador, montador, qualidade (nome + timestamp)
- [x] 358. Criar endpoint `POST /api/fabricacao/{id}/transicionar` para mudar etapa
- [x] 359. Criar endpoint `GET /api/fabricacao/stats` para dashboard
- [x] 360. Implementar filtro "motores com ensaio fora do padrão" em FabricacaoList
- [x] 361. Adicionar campo "Lote de produção" no checklist (rastreabilidade)
- [x] 362. Criar form "Cadastro Etapa de Tarefas" (genérico, reutilizável)
- [x] 363. Adicionar modal "Cadastrar Tarefa Fixa" para etapas com tarefas recorrentes
- [x] 364. Implementar "Cadastro de Modelo de Etapas" (template de etapas por tipo de motor)
- [x] 365. Adicionar "Timer de Bancada" para registrar apontamento de horário em teste
- [x] 366. Implementar validação cruzada: motor com RQ03 aberto não pode ir para EXP
- [x] 367. Adicionar badge visual em ChecklistDetail se o motor está atrasado (vs cronograma)
- [x] 368. Criar página "Relatório de Produtividade por Operador" (quantas etapas concluiu)
- [x] 369. Implementar exportação em Excel da lista de fabricação (toCSV com formatting)
- [x] 370. Adicionar filtro por tipo de motor em FabricacaoList
- [x] 371. Adicionar filtro por cliente final em FabricacaoList
- [x] 372. Implementar impressão da OP (Ordem de Produção) em layout A4
- [x] 373. Adicionar campo "Prioridade" no checklist (urgente, alta, normal) visível no Kanban
- [x] 374. Implementar travamento de etapa (quando em andamento, só o responsável edita)
- [x] 375. Adicionar "Observações gerais" no topo do checklist (visível em todas as etapas)
- [x] 376. Implementar busca global em FabricacaoList (nr_serie, PV, cliente, modelo)
- [x] 377. Adicionar coluna "Etapa atual" em FabricacaoList com badge colorido
- [x] 378. Adicionar coluna "Dias na etapa atual" (vermelho se >SLA)
- [x] 379. Criar page "Histórico de Pintura" (quantas vezes repintou, motivo)
- [x] 380. Implementar sub-checklist de "Componentes recebidos" (conferência inicial)
- [x] 381. Adicionar campo "Data prevista de entrega" no topo do checklist
- [x] 382. Implementar cálculo automático de % completude do checklist
- [x] 383. Adicionar vinculação checklist ↔ atendimento (para motores de manutenção)
- [x] 384. Adicionar vinculação checklist ↔ negócio do CRM (rastreabilidade venda → produção)
- [x] 385. Implementar "Liberação Técnica" (aprovação explícita antes da expedição)
- [x] 386. Criar "Ficha de Inspeção Final" (formulário QLD com todos os parâmetros)
- [x] 387. Adicionar campo "Nr. Nota Fiscal" na etapa EXP
- [x] 388. Adicionar campo "Data embarque" na etapa EXP
- [x] 389. Implementar "Etiqueta de Identificação" (QR code com dados do motor)
- [x] 390. [P1] 390. Integrar com sistema Focco (ERP) para puxar dados de PV automaticamente (read-only)

## 14 — Motores / Engenharia (391-425)

> Skill: `.claude/skills/06-motores.md`. 21 tabelas. MotoresList já existe.

- [x] 391. Criar página "Ficha Técnica de Motor" (detalhe com todas as especificações)
- [x] 392. Adicionar tab "Modelos compatíveis" (bombas que usam o motor)
- [x] 393. Criar form "Cadastro de Modelo" (modelo comercial HIGRA)
- [x] 394. Criar form "Cadastro de Bomba" (hidráulica + motor + acessórios)
- [x] 395. [P1] 395. Implementar geração de Folha de Dados em PDF (layout corporativo HIGRA)
- [x] 396. Adicionar tab "Normas Aplicáveis" em cada motor/bomba
- [x] 397. Criar form "Cadastro de Norma" (ABNT, ISO, IEC, API)
- [x] 398. Criar form "Cadastro de Fornecedor de Componentes" (separado de fabricação)
- [x] 399. Adicionar busca avançada em MotoresList (potência, rotação, voltagem, aplicação)
- [x] 400. Criar página "Sensores Disponíveis" com compatibilidade por motor
- [x] 401. Implementar upload de arquivo CAD (DWG/STEP) no cadastro de motor
- [x] 402. Adicionar preview de desenho técnico (PDF) no detalhe do motor
- [x] 403. Criar form "Cadastro de Carga" (típica para o motor: hidráulica, industrial, submersível)
- [x] 404. Implementar "Cálculo de Potência" (ferramenta: informa vazão+altura, sugere motor)
- [x] 405. Adicionar campo "Curva característica" (upload ou desenhar inline)
- [x] 406. Criar página "Configurador de Motor" (wizard: cliente escolhe requisitos → sistema sugere)
- [x] 407. Implementar comparação lado-a-lado de 2-3 motores
- [x] 408. Adicionar campo "Eficiência energética" (IE1/IE2/IE3/IE4) com badge
- [x] 409. Criar form "Cadastro de Acionamento" (típicos por motor)
- [x] 410. Adicionar campo "Classe de isolação" (A, B, F, H)
- [x] 411. Adicionar campo "Fator de serviço" (1.0, 1.15, etc.)
- [x] 412. Criar página "Histórico de Revisões" do cadastro de motor (versionamento)
- [x] 413. Implementar "Catálogo Público" (view pública sem login para mostrar linha de produtos)
- [x] 414. Adicionar campo "Status de comercialização" (ativo, descontinuado, projeto)
- [x] 415. Criar form "Cadastro de Classe de Proteção" (IP54, IP55, IP68)
- [x] 416. Adicionar opção "Baixar todos os docs" (ZIP) no detalhe do motor
- [x] 417. Implementar "Referência Cruzada" (equivalente de motor de outro fabricante)
- [x] 418. Adicionar campo "Peso" (kg) e "Dimensões" (mm) no cadastro
- [x] 419. Criar form "Cadastro de Vedação" (tipo de vedação mecânica usada)
- [x] 420. Adicionar campo "Tipo de rolamento" (esferas, rolos, self-aligning)
- [x] 421. Criar página "Lista de Bombas por Vazão" (busca por range de vazão)
- [x] 422. Criar página "Lista de Bombas por Altura Manométrica"
- [x] 423. Implementar "Ponto de Operação" (calculadora: dado sistema, encontra ponto ótimo)
- [x] 424. Adicionar campo "Fluido típico" (água limpa, esgoto, lodo, abrasivos) no cadastro
- [x] 425. Implementar tags/etiquetas em motores para busca (submersível, trifásico, 60Hz)

## 15 — Service / Laudos / Chamados (426-455)

- [x] 426. Criar página "Cadastro de Laudo Técnico" (form completo com equipamento, diagnóstico, recomendações)
- [x] 427. Criar página "Visão Geral do Laudo" com imagens, equipe, peças, custo, prazo
- [x] 428. Criar page "Cadastro de Autorizada Service" (oficinas autorizadas HIGRA)
- [x] 429. Adicionar campo "Técnicos da autorizada" com validade de certificação
- [x] 430. Criar form "Cadastro de Tipo de Garantia" (tempo, condições, coberturas)
- [x] 431. Implementar cálculo automático de garantia do produto (data expedição + tipo)
- [x] 432. Adicionar badge "Em garantia" / "Garantia vencida" no laudo
- [x] 433. Criar página "Lista de Laudos" com filtros (técnico, cliente, tipo serviço, período)
- [x] 434. Criar form "Cadastro de Tipo de Serviço" (CRUD)
- [x] 435. Implementar visualização de imagens anexadas ao laudo (galeria com zoom)
- [x] 436. Adicionar exportação do laudo em PDF (template oficial)
- [x] 437. Implementar assinatura do cliente no laudo (canvas)
- [x] 438. Criar relacionamento laudo ↔ produto vendido (buscar histórico de service do produto)
- [x] 439. Criar página "Cadastro de Chamado" (form de abertura manual) — ChamadoList+Form
- [x] 440. Criar form "Cadastro de Categoria de Chamado" (tipo + subcategoria)
- [x] 441. Criar form "Associar Categoria(s) ao Tipo de Chamado" (N:N)
- [x] 442. Implementar modal "Adicionar Observação ao Chamado" (não é comentário público)
- [x] 443. Implementar modal "Atribuir Responsável para o Chamado" (com notificação)
- [x] 444. Adicionar campo "Prioridade" no chamado com cores (crítico=vermelho, ...)
- [x] 445. Implementar SLA visual por categoria de chamado
- [x] 446. Adicionar histórico de status do chamado (timeline)
- [x] 447. Criar form "Adicionar E-mail ao Tipo de Tarefa" (notificações por tipo) — ref: P0442
- [x] 448. Implementar "Templates de resposta" no chamado (respostas prontas)
- [x] 449. Adicionar filtro "não atribuídos" em ChamadosList
- [x] 450. Implementar encerramento de chamado com pesquisa de satisfação
- [x] 451. Criar dashboard de Service: laudos emitidos, tempo médio, taxa de retorno
- [x] 452. Adicionar vinculação laudo ↔ RQ03 (quando laudo identifica NC de produção)
- [x] 453. Implementar relatório mensal de service (consolidado por autorizada)
- [x] 454. Adicionar campo "Custo estimado" vs "Custo real" no laudo
- [x] 455. Implementar aprovação de orçamento pelo cliente antes do service (status PENDENTE_APROV)

## 16 — Projetos / Tarefas / Reuniões / Documentos (456-505)

> Skill: `.claude/skills/08-projetos-tarefas.md`.

- [x] 456. Criar form "Cadastro de Projeto" completo (replicar APEX)
- [x] 457. Implementar tab "Etapas" com drag-and-drop para reordenar
- [x] 458. Implementar tab "Participantes" com papéis (responsável, colaborador, aprovador)
- [x] 459. Implementar tab "Gastos Extras" (categoria, valor, NF, justificativa)
- [x] 460. Adicionar Gantt chart visual das etapas do projeto
- [x] 461. Implementar "Alterar Prazos de Projeto" com propagação automática para tarefas
- [x] 462. Criar form "Cadastro de Categoria de Projeto" (CRUD)
- [x] 463. Adicionar vínculo Projeto ↔ Negócio CRM (read-only do lado SIGS)
- [x] 464. Adicionar vínculo Projeto ↔ RQ49 (oportunidade virou projeto)
- [x] 465. Implementar dashboard do projeto (% completude, orçamento consumido, prazo)
- [x] 466. [P1] 466. Implementar Kanban de tarefas dentro do projeto (view alternativa à lista)
- [x] 467. Adicionar "Tarefas Fixas" do projeto (recorrentes: reunião semanal, report mensal)
- [x] 468. Criar form "Adicionar Usuários na Equipe Padrão" (para reaproveitar equipes)
- [x] 469. Implementar "Cópia de Projeto" (duplicar estrutura sem dados operacionais)
- [x] 470. Adicionar "Marcos" (milestones) destacados na timeline
- [x] 471. Criar página "Cadastro de Tarefa Fixa" com recorrência (diária/semanal/mensal)
- [x] 472. Implementar "Ver tarefas da equipe" (visão gerencial)
- [x] 473. Adicionar subtarefas em TarefaForm (hierarquia pai-filho)
- [x] 474. Implementar dependências entre tarefas (predecessora → sucessora)
- [x] 475. Adicionar coluna "Tempo estimado vs gasto" em TarefasList
- [x] 476. Criar form "Cadastro de Apontamento" standalone (tempo sem tarefa)
- [x] 477. Adicionar categorização de apontamento (atividade, projeto, cliente)
- [x] 478. Implementar relatório de apontamentos por período (hora/usuário/projeto)
- [x] 479. Criar página "Reuniões" com calendário mensal
- [x] 480. Implementar "Cadastro de Tipo de Reunião" (RACO, MDR, etc.)
- [x] 481. Adicionar "Enviar Convite" (gera .ics e envia por e-mail)
- [x] 482. Implementar "Marcar Presença" na reunião (dia)
- [x] 483. Adicionar "Ações da Reunião" que viram tarefas automaticamente
- [x] 484. Implementar "Seguir Pauta" (marcador do item em discussão)
- [x] 485. Adicionar "Anexar Documento" na reunião
- [x] 486. Criar form "Registro de Apontamento de Reunião" (duração real vs planejado)
- [x] 487. Implementar "Cadastro de Revisão" de documento (versionamento com changelog)
- [x] 488. Adicionar distribuição automática ao aprovar nova revisão
- [x] 489. Implementar "Comparar Revisões" (diff visual entre versões)
- [x] 490. Adicionar campo "Próxima revisão prevista" (data) no documento
- [x] 491. Implementar notificação quando documento se aproxima da data de revisão
- [x] 492. Criar form "Cadastro de Categoria de Documento" (instrução, procedimento, formulário, registro)
- [x] 493. Adicionar controle de acesso por documento (público, interno, confidencial)
- [x] 494. Implementar watermark dinâmico no PDF com nome/data do visualizador
- [x] 495. Adicionar log de downloads do documento (auditoria)
- [x] 496. Criar página "Biblioteca" (view curada de documentos públicos)
- [x] 497. Implementar busca full-text dentro dos PDFs (indexar no backend)
- [x] 498. Criar form "Cadastro de Plano de Ação" (GAC) com origem (RQ03/RQ49/RQ80/meta)
- [x] 499. Implementar "Participantes" do plano com papéis
- [x] 500. Adicionar "Anexos" no plano de ação (evidências de execução)
- [x] 501. Implementar "Alterar Prazos de Plano" com justificativa
- [x] 502. Criar form "Cadastro de Apontamento de Plano" (progresso real)
- [x] 503. Adicionar "Status visual" no PlanosList por tipo de origem
- [x] 504. Implementar "Encerrar Plano com Eficácia" (avaliação final)
- [x] 505. Adicionar relatório "Planos vencidos" com escalonamento

## 17 — Indicadores / Metas (506-535)

> APEX key: `GES`. Skill: `.claude/skills/04-qualidade.md` (cobre indicadores).

- [x] 506. Criar página "Dashboard de Indicadores" principal com semáforos por meta
- [x] 507. Criar form "Cadastro de Indicador" (nome, unidade, fonte, frequência)
- [x] 508. Criar page "Unidades de Medida" (CRUD)
- [x] 509. Criar form "Cadastro de Unidade de Medida" (símbolo, descrição)
- [x] 510. Criar page "Tendências" (histórico consolidado)
- [x] 511. Criar form "Cadastro de Tendência" (linha por período)
- [x] 512. Implementar "Configurar Range de Indicador na Meta" (faixas verde/amarelo/vermelho)
- [x] 513. Criar form "Cadastro de Meta" (anual, por vertical, por usuário)
- [x] 514. Adicionar "Distribuição de Metas entre Usuários" com validação soma=100%
- [x] 515. Implementar "Alterar Distribuição de Trimestre" (redistribuir cotas)
- [x] 516. Implementar "Alterar Distribuição por Usuário"
- [x] 517. Implementar "Alterar Distribuição por Vertical"
- [x] 518. Adicionar form "Alterar Meta de Trimestre"
- [x] 519. Adicionar form "Alterar Meta de Vertical"
- [x] 520. Criar page "Ano Fiscal" (configurar início/fim, períodos)
- [x] 521. Implementar "Cadastro de Registro de Meta" (apontamento manual por período)
- [x] 522. Adicionar gráfico "Acumulado vs Meta" (linha) no dashboard
- [x] 523. Adicionar gráfico "Meta por trimestre" (barras)
- [x] 524. Implementar "Ranking de Usuários" com pontuação (XP)
- [x] 525. Adicionar badge de conquistas (gamificação)
- [x] 526. Criar endpoint `GET /api/indicadores/dashboard` consolidado
- [x] 527. Implementar "Custo Homem-Hora" (cálculo de custo por atividade)
- [x] 528. Criar relatório "Metas em risco" (projeção linear vs alvo)
- [x] 529. Implementar filtro por área/vertical no dashboard
- [x] 530. Adicionar drill-down ao clicar numa meta (detalhes por mês)
- [x] 531. Implementar "Exportar Indicadores" em Excel (estrutura pronta para BI)
- [x] 532. Adicionar visão comparativa: ano atual vs anterior
- [x] 533. Implementar notificação quando meta fica vermelha
- [x] 534. Criar page "Histórico de Metas" (anos anteriores)
- [x] 535. Adicionar "Meta Pessoal" (cada usuário define uma meta própria)

## 18 — Laboratório / Bancada (536-560)

> APEX key: `LABS`. Skill: `.claude/skills/10-laboratorio.md`.

- [x] 536. Criar form "Agendamento de Teste de Bancada" (form completo)
- [x] 537. Implementar "Apontamento de Horário do Teste" (início, pausa, fim)
- [x] 538. Criar form "Cadastrar Tipo de Teste de Bancada" (CRUD)
- [x] 539. Adicionar "Anexo de Gráficos" ao teste (upload PNG/CSV)
- [x] 540. Implementar curva de performance sobreposta ao padrão do modelo
- [x] 541. Adicionar comparação de 2 testes lado-a-lado
- [x] 542. Criar dashboard LABS: testes por tipo, aprovados vs reprovados, tempo médio
- [x] 543. Implementar "Equipe do Teste" (operador, supervisor, observador)
- [x] 544. Adicionar fluxo "Simulação de Rebaixamento" (bomba submersível com nível decrescente)
- [x] 545. Criar page "Histórico de Testes por Modelo" (benchmarking)
- [x] 546. Implementar leitura automática via sensores (integração futura — placeholder)
- [x] 547. Adicionar campo "Observações" por ponto de medição
- [x] 548. Implementar "Relatório de Teste" exportável em PDF com gráficos
- [x] 549. Adicionar vinculação Teste ↔ Ordem de Produção (BOB etapa)
- [x] 550. Criar form "Cadastro de Labs" (laboratórios/bancadas disponíveis)
- [x] 551. Implementar "Calendário de Bancada" (disponibilidade por dia/bancada)
- [x] 552. Adicionar status visual (agendado, em execução, finalizado, reprovado)
- [x] 553. Implementar "Repetir Teste" (clona agendamento mantendo parâmetros)
- [x] 554. Adicionar campo "Condições ambientais" (temperatura, pressão, umidade)
- [x] 555. Implementar importação de dados de teste em CSV (bulk)
- [x] 556. Adicionar validação de faixa (alerta se ponto fora do range aceitável)
- [x] 557. Implementar "Certificado de Teste" assinado (PDF com hash)
- [x] 558. Adicionar filtro "testes reprovados do mês" no LaboratorioList
- [x] 559. Implementar integração LABS ↔ Fabricação (teste só marca etapa ENS_HID como ok)
- [x] 560. Criar endpoint `GET /api/laboratorio/stats` para dashboard

## 19 — Comunicação / Eventos (561-575)

- [x] 561. Criar form "Cadastro de Evento" completo (tipo, data, local, responsável)
- [x] 562. Implementar tipos: INFORME (comunicado) e EVENTO (com data/local)
- [x] 563. Adicionar "Participantes" do evento
- [x] 564. Adicionar "Anexos" (imagens, PDFs) no evento
- [x] 565. Implementar publicação programada (futura)
- [x] 566. Adicionar "Confirmação de presença" (RSVP)
- [x] 567. Implementar categorias de comunicado (segurança, RH, novos produtos, etc.)
- [x] 568. Adicionar destaque (pin) para comunicados importantes na home
- [x] 569. Implementar busca full-text na lista de comunicados
- [x] 570. Adicionar "Ver quem já leu" (controle de leitura)
- [x] 571. Implementar notificação no sidebar quando novo comunicado é publicado
- [x] 572. Criar page "Meus Eventos" (só os que o usuário tem presença marcada)
- [x] 573. Implementar export do calendário mensal em ICS
- [x] 574. Adicionar campo "Link externo" (teams, zoom) no evento
- [x] 575. Implementar sistema de tags em comunicados

## 20 — Cadastros / Admin / Permissões (576-615)

- [x] 576. Criar página "Cadastro de Empresa" (CRUD completo com CNPJ, endereço, logo)
- [x] 577. Criar página "Cadastro de Filial" (CRUD com vínculo a empresa, cor, sigla)
- [x] 578. Criar página "Cadastro de Processo/Setor" (CRUD)
- [x] 579. Criar página "Cadastro de Domínio" (LOV — 265 domínios no APEX)
- [x] 580. Criar página "Cadastro de Valor de Domínio" (itens do LOV)
- [x] 581. [P1] 581. Migrar 265 LOVs do APEX para `public.beg_dominio` + `public.beg_valor_dominio`
- [x] 582. Criar página "Cadastro de Usuário SIGS" (CRUD com vínculos empresa/filial/processo/tipo)
- [x] 583. Adicionar "Alterar Senha" próprio (tela pro usuário)
- [x] 584. Adicionar "Resetar Senha" (admin) com envio de e-mail
- [x] 585. Implementar "Alterar Página Inicial" (home_page_id por usuário)
- [x] 586. Criar página "Cadastro de Tipo de Usuário" (CRUD dos A,D,G,F,I,R,L,P,...)
- [x] 587. Criar página "Matriz de Permissões" (edit visual: linhas=tipos, colunas=módulos)
- [x] 588. Implementar "Permissões por rota" (granular além do módulo)
- [x] 589. Adicionar "Log de alterações de permissões" (auditoria)
- [x] 590. Criar página "Histórico de Login" (quem logou quando, IP)
- [x] 591. Implementar "Bloqueio de usuário" (temporário ou permanente)
- [x] 592. Adicionar "Impersonate" para admin (entrar como outro usuário para debug)
- [x] 593. Criar página "Configurações do Sistema" (chaves: SMTP, storage, integrações)
- [x] 594. Implementar edição de configurações via UI (não mais .env para alguns)
- [x] 595. Criar form "Cadastro de Etiqueta" (tags globais reutilizáveis)
- [x] 596. Implementar "Exportação de Contatos e Organizações" (extração LGPD)
- [x] 597. Adicionar "Alterar Especificador do Negócio" — placeholder do CRM, não implementar (CRM intocável)
- [x] 598. Criar form "Cadastro de Tipo de Anexo" (global ou por módulo)
- [x] 599. Criar form "Cadastro de Tipo de Acesso" (níveis: consulta, manutenção, restrito)
- [x] 600. Implementar "Distribuição de Usuários por Filial" (relatório)
- [x] 601. Adicionar "Convite de usuário por e-mail" (self-signup controlado)
- [x] 602. Criar página "2FA Setup" (TOTP para usuários sensíveis)
- [x] 603. Implementar "Force change password" no primeiro login
- [x] 604. Adicionar "Expiração de senha" configurável (dias)
- [x] 605. Implementar "Política de senha" configurável (min length, requires digits, etc.)
- [x] 606. Criar form "Cadastro de Grupo" (agrupamento de usuários para permissões)
- [x] 607. Implementar "Scheduled reports" (envio automático de relatórios por e-mail)
- [x] 608. Criar página "Health Check" (status banco, queue, storage)
- [x] 609. Implementar "Backup configuration" (agendamento de backups lógicos)
- [x] 610. Adicionar "Audit log viewer" (UI para ver hgr_audit_log)
- [x] 611. Criar endpoint `POST /api/admin/seed-permissions` (UI do seed de permissões)
- [x] 612. Implementar "Gestão de Chaves API" (geração de tokens para integrações externas)
- [x] 613. Adicionar "Settings do usuário" (preferências: tema, idioma, notificações)
- [x] 614. Implementar "Customização de layout" (esconder menus por usuário)
- [x] 615. Criar página "Sobre" (versão do sistema, changelog, contatos)

## 21 — Backend: endpoints faltando ou incompletos (616-645)

- [x] 616. Criar routes `backend/routes/qualidade/rq94.py` (Análise de Mudança)
- [x] 617. Criar routes `backend/routes/qualidade/sst.py` (Segurança do Trabalho)
- [x] 618. Criar routes `backend/routes/admin/audit.py` (logs de auditoria)
- [x] 619. Criar routes `backend/routes/pedidos/focco.py` (read-only do ERP Focco)
- [x] 620. Criar endpoint `GET /api/home/widgets` (configurável por usuário)
- [x] 621. Adicionar paginação cursor-based em `/api/tarefas` (>10k registros)
- [x] 622. Adicionar paginação cursor-based em `/api/qualidade/rq03`
- [x] 623. Implementar `GET /api/busca-global` (full-text em múltiplas tabelas)
- [x] 624. Criar endpoint `POST /api/upload/evidencia` (upload genérico com categoria)
- [x] 625. Implementar rate limit por usuário no `/api/busca-global` (10/min)
- [x] 626. Adicionar endpoint `GET /api/stats/dashboard` consolidado (home)
- [x] 627. Criar endpoint `GET /api/notificacoes/unread-count` para sidebar badge
- [x] 628. Implementar WebSocket `/ws/notifications` para push em tempo real
- [x] 629. Adicionar endpoint `POST /api/exportar/<modulo>` (background job para grandes exports)
- [x] 630. Implementar `GET /api/saude` (health check detalhado)
- [x] 631. Criar endpoint `GET /api/config/:module` para configurações por módulo
- [x] 632. Adicionar `POST /api/auth/logout` que invalida token (blacklist)
- [x] 633. Implementar `GET /api/auth/sessions` (listar sessões ativas do usuário)
- [x] 634. Adicionar endpoint `DELETE /api/auth/sessions/:id` para revogar sessão
- [x] 635. Criar endpoint `GET /api/metrics` (Prometheus-compatible se aplicável)
- [x] 636. Implementar `POST /api/integracoes/email/test` (testar config SMTP)
- [x] 637. Adicionar endpoint `GET /api/schema/info` (metadados: módulos, permissões, versão)
- [x] 638. Implementar `POST /api/batch/<modulo>` para operações em lote
- [x] 639. Criar endpoint `GET /api/mobile/tarefas/sync` otimizado para mobile offline
- [x] 640. Adicionar endpoint `GET /api/relatorios/<nome>` para relatórios nomeados
- [x] 641. Implementar endpoint `GET /api/busca/:modulo/:campo/:valor` (busca parametrizada)
- [x] 642. Criar endpoint `POST /api/anexos/:id/download` com auditoria (log de download)
- [x] 643. Adicionar `GET /api/usuarios/buscar` (autocomplete de usuários por nome)
- [x] 644. Implementar `POST /api/configuracao/testar-conexao` (banco, SMTP, storage)
- [x] 645. Criar endpoint `GET /api/auditorias/timeline/:tabela/:id` (histórico de mudanças)

## 22 — Migração de dados Oracle → PostgreSQL (646-670)

> Skill: `.claude/skills/11-migracao-dados.md`. Schema Oracle: HGRHML.

- [x] 646. [P1] 646. Criar script `backend/scripts/migrate_from_oracle.py` orquestrador
- [x] 647. Implementar extração de `STH_CAD_EMPRESA` (Oracle → CSV → PostgreSQL)
- [x] 648. Implementar extração de `STH_CAD_FILIAL` com FK para empresa
- [x] 649. Implementar extração de `BEG_PROCESSO` (processos/setores)
- [x] 650. Implementar extração de `BEG_DOMINIO` + `BEG_VALOR_DOMINIO` (265 LOVs)
- [x] 651. Implementar extração de `BEG_USUARIOS` com merge em public.users existente
- [x] 652. Implementar extração de `HGR_STM_CAD_TIPO_USU` e população inicial
- [x] 653. Implementar extração de `HGR_STM_USU_REG_TP` (vínculo N:M)
- [x] 654. Implementar extração de `HGR_TAR_CAD_TAREFA` (26k registros — já importado, validar)
- [x] 655. Implementar extração de `HGR_GES_CAD_META` + apontamentos
- [x] 656. Implementar extração de `HGR_PRJ_CAD_PROJETO` + etapas + participantes
- [x] 657. Implementar extração de `HGR_REU_CAD_AGENDA` + pautas + ações
- [x] 658. Implementar extração de `HGR_DCT_CAD_DOCUMENTO` + revisões (BLOBs)
- [x] 659. Implementar extração de `BEG_RQ03` + análises + evidências
- [x] 660. Implementar extração de `BEG_RQ49` + análises + avaliações
- [x] 661. Implementar extração de `BEG_RQ80` (auditorias)
- [x] 662. Implementar extração de `HGR_CHK_*` (fabricação — 63 tabelas!)
- [x] 663. Implementar extração de `HGR_MOT_*` + `HGR_BMB_*` (motores/bombas)
- [x] 664. Implementar extração de `HGR_ASS_*` (assistência — 27 tabelas)
- [x] 665. Implementar extração de `HGR_LAB_*` (laboratório — 15 tabelas)
- [x] 666. Implementar extração de BLOBs (fotos, assinaturas, anexos) em filesystem + metadata
- [x] 667. Implementar validação pós-carga (count Oracle vs PostgreSQL, 0 diff)
- [x] 668. Implementar ajuste de sequências BIGSERIAL (MAX(id)+1)
- [x] 669. Criar relatório de migração (HTML com tabela de counts, erros, duração)
- [x] 670. Adicionar modo `--incremental` para re-import (só rows novos/atualizados)

## 23 — Integrações cross-module e fluxos (671-695)

- [x] 671. Fluxo: ação do plano de ação vira tarefa automaticamente (com link)
- [x] 672. Fluxo: ação de reunião vira tarefa (se responsável definido)
- [x] 673. Fluxo: RQ03 fechado com "requer ação corretiva" gera plano de ação
- [x] 674. Fluxo: RQ49 aprovado gera projeto de implementação
- [x] 675. Fluxo: atendimento com diagnóstico "produto com defeito" gera RQ03
- [x] 676. Fluxo: laudo técnico "aprovado" fecha atendimento
- [x] 677. Fluxo: expedição do motor atualiza atendimento se for manutenção
- [x] 678. Fluxo: ensaio hidroenergético reprovado gera RQ03 interna
- [x] 679. Fluxo: negócio CRM ganho gera projeto (via webhook/event)
- [x] 680. Fluxo: checklist concluído notifica cliente final
- [x] 681. Notificação: tarefa atrasada → e-mail + in-app
- [x] 682. Notificação: reunião em 15min → push + in-app
- [x] 683. Notificação: RQ03 atribuído → e-mail ao responsável
- [x] 684. Notificação: aprovação pendente → notificação ao aprovador
- [x] 685. Notificação: meta vermelha no fim do trimestre → alerta à diretoria
- [x] 686. Widget home: "próximas reuniões" (7 dias)
- [x] 687. Widget home: "tarefas do dia" (vencem hoje ou atrasadas)
- [x] 688. Widget home: "RQ03 sob minha responsabilidade"
- [x] 689. Widget home: "metas atingidas (trimestre)"
- [x] 690. Widget home: "últimos comunicados"
- [x] 691. Dashboard executivo (só A/D): KPIs consolidados de todos os módulos
- [x] 692. Implementar "Centro de Notificações" (lista + filtros + marcar como lido)
- [x] 693. [P1] 693. Event bus interno (pub/sub) para desacoplar integrações cross-module
- [x] 694. Implementar "Quick add" no canto do app (criar tarefa/RQ03/anotação de qualquer tela)
- [x] 695. Criar "Relatórios Favoritos" por usuário (links salvos para relatórios frequentes)

<!-- Exemplos de tarefas concluídas — apenas para o script detectar o formato correto -->

- [x] 000. Setup inicial do loop de melhoria contínua
