# Stack, estrutura e convenções — HIGRA SIGS

## O que é
Sistema de gestão integrada da **HIGRA Industrial Ltda** (fabricante de bombas e motores submersíveis).
Migração do Portal SIGS (Oracle APEX 24.1, app 108, 552 páginas, owner `HGRHML`) para stack moderna.

## Stack
```
Backend:   Python 3.9+ / FastAPI / Uvicorn / SQL puro (psycopg2) / Alembic / JWT+BCrypt
Frontend:  React 18 (Vite) / JavaScript JSX / React Router DOM / Axios / Zustand / CSS puro
Banco:     PostgreSQL (higra_sigs)
IA:        Anthropic Claude API / PyTorch / Sentence-Transformers / FAISS
Real-time: WebSocket (FastAPI nativo)
```

## Banco de Dados
```
Schema "public":  tabelas base + todos os módulos SIGS (~265 tabelas)
Schema "crm":     módulo CRM (92 tabelas) — JÁ IMPLEMENTADO, NÃO MEXER
```

## Estrutura do Backend
```
backend/
  main.py              → FastAPI app (routers: auth, chat, social, historico, arquimedes, SIGS)
  database.py          → Conexão psycopg2
  auth/                → JWT + BCrypt + require_permission
  core/                → Config, OpenAPI
  routes/{modulo}/     → Routers por módulo
  services/{modulo}/   → Lógica de negócio
  alembic/             → Migrations (separadas por módulo)
```

## Estrutura do Frontend
```
frontend/src/
  pages/{modulo}/       → Páginas por módulo
  components/{modulo}/  → Componentes por módulo
  components/ui/        → Componentes base (EmptyState, StatusBadge, Tooltip, etc.)
  services/{modulo}/    → Axios services (usar lib/api.js)
  contexts/             → React contexts (ToastContext, etc.)
  hooks/                → Hooks customizados (useDocumentTitle, useKeyboardShortcut, ...)
  stores/               → Zustand stores (authStore, lovStore, ...)
  utils/                → Utilitários (format.js)
  styles/               → CSS global + temas
  App.jsx               → Router principal (lazy loading por rota)
```

## Infraestrutura frontend já existente (NÃO recriar, USAR)
```
lib/api.js               → Axios com interceptor JWT (auto-attach, 401→login)
stores/authStore.js      → Zustand (token, user, plan, hasModule(), logout())
contexts/ToastContext.jsx → toast.success/error/info/warning (NÃO usar react-toastify)
hooks/useTheme.js        → Dark/light mode via data-theme
components/Icon.jsx      → Wrapper SVG para ícones inline
components/Sidebar.jsx   → Menu lateral condicional (hasModule)
components/Modal.jsx     → Modal com focus trap + ESC + autofocus
components/ConfirmModal.jsx → Confirmação destrutiva (autofocus no Cancelar)
components/CommandPalette.jsx → Ctrl+K global
components/ErrorBoundary.jsx  → global + compact mode
styles/global.css        → Temas com CSS variables
```

## Convenções de código

### Backend (Python)
- Routers por módulo: `backend/routes/{modulo}/`
- Models Pydantic para request/response
- **SQL puro com psycopg2** (sem ORM)
- Auth JWT (PyJWT) + BCrypt
- Queries sempre com schema qualificado: `public.tabela` ou `crm.tabela`
- **Paginação obrigatória** em endpoints de listagem
- `require_permission(MOD_KEY)` nos endpoints protegidos

### Frontend (React)
- Pages: `frontend/src/pages/{modulo}/`
- Services: `frontend/src/services/{modulo}/` (usam `lib/api.js`)
- **CSS puro** com variáveis de tema (sem Tailwind, sem styled-components)
- Roteamento: React Router DOM com lazy load no `App.jsx`
- Notificações: `useToast()` (NÃO usar React Toastify)
- Estado global: Zustand `useAuthStore` (NÃO usar Redux)
- Formatação: usar `utils/format.js` (formatDate, relativeDate, etc.)

### Banco de Dados
- Nomes em lowercase: `hgr_crm_cad_neg`
- Prefixos: `HGR_` (HIGRA), `BEG_` (base), `STH_` (legado), `CFG_` (config)
- Padrões: `_CAD_` = cadastro, `_REG_` = registro/relação, `_VW_` = view
- ID sempre `BIGSERIAL PRIMARY KEY`
- Audit: `created_at`, `updated_at`, `created_by`, `updated_by`
- Flag ativo: `VARCHAR(1) DEFAULT 'S'`

## Fonte de verdade do legado
- Export APEX: `C:\Users\user\Downloads\f108_extract\f108.sql` (867K linhas)
- Detalhes de como consultar: ver `context/05-apex-source.md`
