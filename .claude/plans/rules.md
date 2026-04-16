# Regras absolutas — HIGRA SIGS

As regras abaixo **têm precedência sobre qualquer outra instrução** neste repositório. Se houver conflito com um pedido, **pergunte antes** de executar.

## Intocáveis

1. **NUNCA** altere, renomeie ou delete arquivos/tabelas do módulo **CRM**
   (`crm.*`, `backend/routes/crm/`, `frontend/src/pages/crm/`, `frontend/src/services/crm/`).
2. **NUNCA** altere tabelas do schema `public` que **já existem** sem confirmar.
3. **NUNCA** suba commits com:
   - Credenciais (tokens JWT, senhas, chaves de API).
   - Arquivos `.env` com segredos.
   - Dumps de banco com dados de produção.

## Preservar (não simplificar)

4. **Hierarquia de tipos de usuário idêntica ao Oracle** — manter os códigos (`A`, `D`, `G`, `F`, `I`, `R`, `L`, `P`, `GER_COM`, `ASS`) e a lógica de `PCK_STH_STM`.
5. **FASE 0 vem antes de módulos novos** — auth, sessão e permissões são fundação.
6. **Regras de negócio do Oracle** são a fonte da verdade. Em dúvida, consulte `f108.sql` antes de inventar comportamento.
7. **Funcionalidades fora do SIGS clássico** (chat, social, RAG local, Arquimedes) já existem — preservar integrações antes de refatorar.

## Convenções obrigatórias

### Backend
8. **Sempre** qualifique tabelas com schema nas queries: `public.beg_usuarios`, `crm.hgr_crm_cad_neg`.
9. **Sempre** crie **Pydantic models** para request e response.
10. **Sempre** implemente **paginação** em endpoints de listagem.
11. **Sempre** use `require_permission(MOD_KEY)` nos endpoints protegidos.
12. **SQL puro com psycopg2** — não introduzir ORM.
13. **Alembic migrations separadas por módulo**.

### Frontend
14. **CSS puro** com variáveis de tema — sem Tailwind, sem styled-components.
15. **Toasts** via `useToast()` do ToastContext — NÃO usar react-toastify.
16. **Estado global** com Zustand (`useAuthStore`) — NÃO usar Redux.
17. **Axios** via `lib/api.js` (já tem interceptor JWT).
18. **Lazy load** de páginas no `App.jsx`.

## Workflow

19. **Edições cirúrgicas** — não substitua arquivos inteiros sem necessidade.
20. **Verifique o código existente** antes de criar arquivos novos.
21. **Pergunte antes** de alterações estruturais grandes (mudança de schema, refactor multi-módulo, renomear rota pública).
22. **Valide localmente** na menor superfície possível antes de entregar.
23. **Respeite o fluxo** Backend (router + model + service) → Migration → Frontend (page + service).

## Checklist rápido antes de commit
- [ ] Schema qualificado em todas as queries?
- [ ] `require_permission` nos endpoints protegidos?
- [ ] Paginação nos endpoints de lista?
- [ ] Nenhum segredo commitado?
- [ ] CRM intocado?
- [ ] Tabelas `public.*` pré-existentes intocadas?
