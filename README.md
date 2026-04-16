# Higra Sigs

Aplicação em React.js (front-end) + FastAPI (backend).

## Estrutura
- backend/: Servidor API com FastAPI.
- frontend/: App React com Vite.
- assets/: Imagens compartilhadas (favicon.png, Logo-25-Anos-branco.webp, bg.jpeg).
- curvas/: PDFs para download.
- bombas_higra.parquet: Arquivo de dados.

## Instalação e Execução
Opção A — script único (recomendado):

1. Na raiz do repositório:
   - Instale as dependências do frontend: `cd frontend && npm install && cd ..`
   - Crie o venv e instale o backend: `cd backend && python -m venv venv && ./venv/Scripts/pip.exe install -r requirements.txt` (Windows) ou `./venv/bin/pip install -r requirements.txt` (Linux/Mac) e volte à raiz.
2. Ainda na raiz, rode:
   - `npm run start:all`

Esse comando inicia FastAPI (porta 8000) e Vite (porta 5173) em paralelo.

Opção B — manual:

1. Backend:
   - `cd backend`
   - `python -m venv venv`
   - Ative o venv e instale: `pip install -r requirements.txt`
   - `uvicorn main:app --reload --port 8000`

2. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`

Acesse http://localhost:5173 (Vite). O frontend chama o backend em http://localhost:8000.

## Deploy
- Backend: Render, Railway, Fly.io ou similar. Configure variável FRONTEND_URL e mantenha DATA_FILE acessível. Rode `uvicorn main:app --host 0.0.0.0 --port 8000`.
- Frontend: Vercel ou Netlify. Faça `npm run build` em `frontend` e publique o diretório `frontend/dist`. Ajuste `VITE_API_URL` para apontar para o backend público.

## Deploy AWS EC2 (automatico)
- Fluxo pronto com GitHub Actions + SSH + Nginx + systemd: [docs/aws-ec2-deploy.md](docs/aws-ec2-deploy.md)
- Script de deploy remoto: `scripts/deploy-ec2.sh`
- Workflow: `.github/workflows/deploy-ec2.yml`

Meta
- Nome do projeto: Higra Sigs
- Script de desenvolvimento unificado: `npm run start:all` (raiz)

## Build
- `npm run build:all` (na raiz) compila o frontend para `frontend/dist`.
- Pré-visualizar o build: `npm run preview:frontend`.

## Variáveis de Ambiente

Backend (`backend/.env` — copie de `backend/.env.example`):
- `DATABASE_URL`: URL do PostgreSQL (ex.: `postgresql://usuario:senha@host:5432/higra_sigs`).
- `SECRET_KEY`: chave JWT (use valor forte em produção).
- `ALGORITHM`: ex.: `HS256`.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: validade do token.
- `FRONTEND_URL`: origem do frontend para CORS (ex.: `http://localhost:5173` ou domínio de produção).
- `DATA_FILE`: caminho para o arquivo de dados (ex.: `../bombas_higra.parquet`).

Frontend (`frontend/.env` — copie de `frontend/.env.example`):
- `VITE_API_URL`: URL pública do backend (dev: `http://localhost:8000`).

## Deploy (detalhado)
- Backend (Render/Railway/Fly.io)
  - Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`.
  - Defina `SECRET_KEY`, `DATABASE_URL`, `FRONTEND_URL` e `DATA_FILE`.
  - Ajuste `FRONTEND_URL` para o domínio do frontend em produção.
- Frontend (Vercel/Netlify)
  - Build: dentro de `frontend`, `npm run build` e publique `frontend/dist`.
  - Defina `VITE_API_URL` apontando para o backend (HTTPS).

Checklist rápido
- [ ] `frontend/.env` com `VITE_API_URL` do backend público.
- [ ] `backend/.env` com `FRONTEND_URL` do domínio do frontend.
- [ ] `SECRET_KEY` forte configurado.
- [ ] Banco acessível via `DATABASE_URL`.
