# Deploy Automatico na AWS EC2 (nexus.higra.com.br)

Este projeto foi preparado para deploy automatico com GitHub Actions em uma instancia EC2.

## 1) Pre-requisitos

- Instancia EC2 Linux acessivel por SSH.
- Dominio `nexus.higra.com.br` apontando para o IP publico da instancia.
- Security Group com portas abertas:
  - `22` (SSH) para seu IP.
  - `80` (HTTP) para `0.0.0.0/0`.
  - `443` (HTTPS) para `0.0.0.0/0`.

## 2) Arquivos de automacao adicionados

- Workflow: `.github/workflows/deploy-ec2.yml`
- Script remoto: `scripts/deploy-ec2.sh`
- Template backend env: `backend/.env.example`
- Template frontend prod env: `frontend/.env.production.example`

## 3) Configurar Secrets/Variables no GitHub

No repositório, abra `Settings > Secrets and variables > Actions`.
Pode usar `Secrets` ou `Variables` para campos nao sensiveis. A chave privada deve ficar em `Secrets`.

- `EC2_HOST`: `98.92.163.64`
- `EC2_USER`: ex.: `ubuntu`
- `EC2_SSH_KEY` (Secret obrigatorio): chave privada PEM (conteudo completo)
- `EC2_APP_DIR`: `/opt/higra-sigs`
- `EC2_DOMAIN`: `nexus.higra.com.br`
- `DEPLOY_BRANCH`: `main`
- `DEPLOY_REPO_URL`: URL git do repo (HTTPS ou SSH)
- `DEPLOY_GITHUB_TOKEN` (Secret opcional, recomendado em repo privado): token com `Contents: Read`
- `CHAT_PROVIDER` (Variable opcional): `n8n` para deploy sem stack de IA local
- `INSTALL_LOCAL_AI_STACK` (Variable opcional): `auto` (padrao), `true` ou `false`
- `LETSENCRYPT_EMAIL`: seu e-mail para SSL
- `EC2_SERVICE_USER`: ex.: `ubuntu`
- `ENABLE_CERTBOT`: `true`
- `ENABLE_SWAP`: `true` (recomendado em instancia pequena)

Notas:
- Se o repo for privado, configure `DEPLOY_GITHUB_TOKEN` (Secret) e mantenha `DEPLOY_REPO_URL` sem token.
- Alternativa: em HTTPS, `DEPLOY_REPO_URL` pode usar token embutido.
- Em SSH, garanta deploy key configurada no GitHub e no servidor.
- Se aparecer `Error: missing server host`, configure `EC2_HOST` em `Secrets` ou `Variables`.
- Se aparecer `sudo: apt-get: command not found` (Amazon Linux), use a versao atual do script `scripts/deploy-ec2.sh` que detecta `dnf/yum`.
- Se aparecer conflito `curl-minimal` vs `curl` no `dnf`, use a versao atual do script que instala `curl-minimal` apenas quando necessario.
- Se aparecer `No space left on device` no `pip install`, use a versao atual do script (instala `torch` CPU-only sem cache). Se persistir, aumente o volume EBS da instancia.
- Trocar apenas o tipo da instancia (ex.: `t3.micro` -> `t3.medium`) nao aumenta disco. Para esse projeto, use volume EBS com folga (recomendado 20 GB ou mais).
- Se aparecer `could not lock config file .git/config: No space left on device`, a raiz ficou sem espaco; limpe `backend/venv`/caches e aumente o EBS.
- Se `CHAT_PROVIDER=n8n`, o deploy instala backend sem `torch/transformers/faiss/sentence-transformers` para reduzir uso de disco.
- Em disco baixo, com `INSTALL_LOCAL_AI_STACK=auto` (padrao), o deploy entra em modo degradado e publica o restante da aplicacao sem a stack de IA local.
- Para forcar deploy sem IA local mesmo com `CHAT_PROVIDER=local`, use `INSTALL_LOCAL_AI_STACK=false`.

## 4) Primeira execucao no servidor

Conecte via SSH e execute uma vez:

```bash
sudo mkdir -p /opt/higra-sigs
sudo chown -R $USER:$USER /opt/higra-sigs
```

Depois rode o workflow manualmente em `Actions > Deploy EC2 (nexus.higra.com.br) > Run workflow`.

## 5) Configurar variaveis de ambiente no servidor

No primeiro deploy, se `backend/.env` nao existir, o script cria template e para.

Conecte via SSH:

```bash
cd /opt/higra-sigs
cp backend/.env.example backend/.env
nano backend/.env
```

Preencha pelo menos:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET_KEY`
- `CHAT_PROVIDER=n8n` (quando usar fluxo externo no n8n)
- `N8N_CHAT_WEBHOOK_URL` e, se necessário, `N8N_CHAT_BEARER_TOKEN`
- `DATA_FILE=backend/bombas_higra.parquet`

Auth/Seeds (opcional, recomendado):
- `AUTH_SEED_MOCK_USERS=true`: cria usuarios seed se nao existirem no banco principal.
- `AUTH_SEED_PASSWORD`: senha padrao dos usuarios seed (trocar apos primeiro acesso).
- `MOCK_AUTH_EMAIL`, `MOCK_AUTH_USERNAME`, `MOCK_AUTH_NAME`: usuario seed principal.
- `MOCK_AUTH_DEMO_EMAIL`, `MOCK_AUTH_DEMO_USERNAME`, `MOCK_AUTH_DEMO_NAME`: usuario seed demo.
- `AUTH_ALLOW_MOCK_FALLBACK=false`: com banco principal configurado, mantenha `false` para evitar login mock sem persistencia.

Em seguida dispare o workflow novamente.

## 6) Como funciona o deploy

A cada push em `main`:

1. GitHub Actions conecta no EC2 por SSH.
2. Faz `git fetch/reset` no diretório da aplicacao.
3. Roda `scripts/deploy-ec2.sh`:
   - instala dependencias de sistema (se necessario),
   - cria/atualiza venv e instala backend,
   - faz build do frontend,
   - atualiza `systemd` do backend (`higra-backend.service`),
   - atualiza Nginx (frontend + proxy para API),
   - configura HTTPS com Certbot.

## 7) Comandos uteis de operacao

```bash
sudo systemctl status higra-backend --no-pager
sudo journalctl -u higra-backend -n 200 --no-pager
sudo nginx -t
sudo systemctl reload nginx
```

## 8) Observacao importante sobre tamanho da instancia

Sua instancia no print esta como `t3.micro` (1 GB RAM). O backend usa `torch` + embeddings e pode ficar instavel por memoria.

Recomendacao:
- minimo `t3.small` (ideal `t3.medium` ou maior), ou
- manter `ENABLE_SWAP=true` para reduzir risco de OOM.
