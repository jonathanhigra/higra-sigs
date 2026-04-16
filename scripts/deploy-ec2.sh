#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/higra-sigs}"
DOMAIN="${DOMAIN:-nexus.higra.com.br}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-$USER}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
ENABLE_CERTBOT="${ENABLE_CERTBOT:-true}"
ENABLE_SWAP="${ENABLE_SWAP:-false}"
INSTALL_PACKAGES="${INSTALL_PACKAGES:-true}"
PYTHON_INSTALL_NO_CACHE="${PYTHON_INSTALL_NO_CACHE:-true}"
USE_TORCH_CPU_WHEEL="${USE_TORCH_CPU_WHEEL:-true}"
CHAT_PROVIDER="${CHAT_PROVIDER:-}"
INSTALL_LOCAL_AI_STACK="${INSTALL_LOCAL_AI_STACK:-auto}"
ALLOW_DEGRADED_LOCAL_AI_DEPLOY="${ALLOW_DEGRADED_LOCAL_AI_DEPLOY:-true}"
MIN_FREE_GB="${MIN_FREE_GB:-}"
MIN_FREE_GB_LOCAL_AI="${MIN_FREE_GB_LOCAL_AI:-6}"
MIN_FREE_GB_N8N="${MIN_FREE_GB_N8N:-1.3}"
MIN_FREE_GB_SOFT_MARGIN="${MIN_FREE_GB_SOFT_MARGIN:-0.15}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-false}"
FRONTEND_DIST_ARCHIVE="${FRONTEND_DIST_ARCHIVE:-}"
DEPLOY_ARTIFACTS_TO_KEEP="${DEPLOY_ARTIFACTS_TO_KEEP:-3}"
ALLOW_VENV_PURGE_ON_LOW_DISK="${ALLOW_VENV_PURGE_ON_LOW_DISK:-false}"
VENV_FINGERPRINT_FILE="${VENV_FINGERPRINT_FILE:-backend/.venv-fingerprint}"
PKG_MANAGER=""

log() {
  printf '[deploy-ec2] %s\n' "$1"
}

trap 'log "Erro na linha ${LINENO}: ${BASH_COMMAND}"' ERR

free_space_gb() {
  local path="${1:-.}"
  local free_kb
  free_kb="$(df -Pk "$path" | awk 'NR==2{print $4}')"
  awk "BEGIN {printf \"%.2f\", $free_kb/1048576}"
}

normalize_deploy_inputs() {
  case "$DEPLOY_ARTIFACTS_TO_KEEP" in
    ''|*[!0-9]*)
      DEPLOY_ARTIFACTS_TO_KEEP="3"
      ;;
  esac
  if [ "$DEPLOY_ARTIFACTS_TO_KEEP" -lt 1 ]; then
    DEPLOY_ARTIFACTS_TO_KEEP="1"
  fi

  case "$SKIP_FRONTEND_BUILD" in
    true|false) ;;
    *)
      SKIP_FRONTEND_BUILD="false"
      ;;
  esac

  case "$ALLOW_VENV_PURGE_ON_LOW_DISK" in
    true|false) ;;
    *)
      ALLOW_VENV_PURGE_ON_LOW_DISK="false"
      ;;
  esac
}

prune_deploy_artifacts() {
  local artifacts_dir="$APP_DIR/.deploy-artifacts"
  local keep="$DEPLOY_ARTIFACTS_TO_KEEP"
  local stale_count=0
  local stale_path=""

  [ -d "$artifacts_dir" ] || return 0

  while IFS= read -r stale_path; do
    [ -n "$stale_path" ] || continue
    rm -f "$stale_path" || true
    stale_count=$((stale_count + 1))
  done < <(
    find "$artifacts_dir" -maxdepth 1 -type f -name 'frontend-dist-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null \
      | sort -nr \
      | awk -v keep="$keep" 'NR > keep {print $2}'
  )

  if [ "$stale_count" -gt 0 ]; then
    log "Removendo ${stale_count} artefatos antigos (retencao: ${keep})."
  fi
  return 0
}

backend_install_profile() {
  if [ "$CHAT_PROVIDER" = "n8n" ] || [ "$INSTALL_LOCAL_AI_STACK" = "false" ]; then
    echo "no-local-ai"
  elif [ "$USE_TORCH_CPU_WHEEL" = "true" ]; then
    echo "torch-cpu"
  else
    echo "full"
  fi
}

backend_fingerprint() {
  local profile requirements_hash
  profile="$(backend_install_profile)"
  requirements_hash="$(sha256sum backend/requirements.txt | awk '{print $1}')"
  printf '%s|%s\n' "$requirements_hash" "$profile" | sha256sum | awk '{print $1}'
}

install_backend_dependencies() {
  local profile target_fingerprint current_fingerprint
  local -a PIP_ARGS=()

  profile="$(backend_install_profile)"
  target_fingerprint="$(backend_fingerprint)"
  current_fingerprint=""
  if [ -f "$VENV_FINGERPRINT_FILE" ]; then
    current_fingerprint="$(cat "$VENV_FINGERPRINT_FILE" 2>/dev/null || true)"
  fi

  if [ -x backend/venv/bin/python ] && [ -x backend/venv/bin/pip ] && [ "$current_fingerprint" = "$target_fingerprint" ]; then
    log "Dependencias do backend inalteradas (perfil: ${profile}). Reutilizando backend/venv."
    return
  fi

  log "Atualizando dependencias do backend (perfil: ${profile})..."
  if [ ! -x backend/venv/bin/python ]; then
    python3 -m venv backend/venv
  fi

  if [ "$PYTHON_INSTALL_NO_CACHE" = "true" ]; then
    PIP_ARGS+=(--no-cache-dir)
    rm -rf "$HOME/.cache/pip" || true
  fi

  backend/venv/bin/pip install "${PIP_ARGS[@]}" --upgrade pip

  if [ "$profile" = "no-local-ai" ]; then
    if [ "$CHAT_PROVIDER" = "n8n" ]; then
      log "CHAT_PROVIDER=n8n | instalando backend sem stack de IA local..."
    else
      log "Deploy degradado | instalando backend sem stack de IA local para caber no disco."
      log "A API principal sobe normalmente; recursos de IA local ficam indisponiveis ate ampliar disco."
    fi
    REQUIREMENTS_NO_LOCAL_AI="$(mktemp)"
    grep -Ev '^[[:space:]]*(torch|transformers|faiss-cpu|sentence-transformers)([<>=!~].*)?$' backend/requirements.txt > "$REQUIREMENTS_NO_LOCAL_AI"
    backend/venv/bin/pip install "${PIP_ARGS[@]}" -r "$REQUIREMENTS_NO_LOCAL_AI"
    rm -f "$REQUIREMENTS_NO_LOCAL_AI"
  elif [ "$profile" = "torch-cpu" ]; then
    log "Instalando torch CPU-only para reduzir consumo de disco no deploy..."
    backend/venv/bin/pip install "${PIP_ARGS[@]}" --index-url https://download.pytorch.org/whl/cpu "torch==2.4.1+cpu"
    REQUIREMENTS_NO_TORCH="$(mktemp)"
    grep -Ev '^[[:space:]]*torch([<>=!~].*)?$' backend/requirements.txt > "$REQUIREMENTS_NO_TORCH"
    backend/venv/bin/pip install "${PIP_ARGS[@]}" -r "$REQUIREMENTS_NO_TORCH"
    rm -f "$REQUIREMENTS_NO_TORCH"
  else
    backend/venv/bin/pip install "${PIP_ARGS[@]}" -r backend/requirements.txt
  fi

  echo "$target_fingerprint" > "$VENV_FINGERPRINT_FILE"
}

build_or_extract_frontend() {
  if [ "$SKIP_FRONTEND_BUILD" = "true" ] && [ -n "$FRONTEND_DIST_ARCHIVE" ] && [ -f "$FRONTEND_DIST_ARCHIVE" ]; then
    log "Publicando frontend a partir do artefato gerado no CI."
    rm -rf frontend/dist
    mkdir -p frontend
    tar -xzf "$FRONTEND_DIST_ARCHIVE" -C frontend
    rm -f "$FRONTEND_DIST_ARCHIVE" || true
    prune_deploy_artifacts || true
    return
  fi

  if [ "$SKIP_FRONTEND_BUILD" = "true" ]; then
    log "Artefato frontend nao encontrado em ${FRONTEND_DIST_ARCHIVE:-<vazio>}. Executando build local."
  fi

  if ! command -v node >/dev/null 2>&1; then
    install_nodejs_22
  fi

  log "Build do frontend na EC2..."
  npm --prefix frontend ci
  npm --prefix frontend run build
  rm -rf frontend/node_modules || true
}

assert_min_disk_space() {
  local free_gb
  free_gb="$(free_space_gb "$APP_DIR")"
  log "Espaco livre em disco: ${free_gb} GB"

  if awk "BEGIN {exit !($free_gb < $MIN_FREE_GB)}"; then
    cleanup_before_install
    free_gb="$(free_space_gb "$APP_DIR")"
    log "Espaco livre apos limpeza de cache: ${free_gb} GB"
  fi

  if awk "BEGIN {exit !($free_gb < $MIN_FREE_GB)}"; then
    cleanup_heavy_artifacts
    free_gb="$(free_space_gb "$APP_DIR")"
    log "Espaco livre apos limpeza pesada: ${free_gb} GB"
  fi

  if awk "BEGIN {exit !($free_gb < $MIN_FREE_GB)}"; then
    # Modo degradado (sem stack IA local): permite pequena margem para nao falhar por poucos MB.
    if [ "$INSTALL_LOCAL_AI_STACK" = "false" ] && awk "BEGIN {exit !($free_gb >= ($MIN_FREE_GB - $MIN_FREE_GB_SOFT_MARGIN))}"; then
      log "Espaco levemente abaixo do minimo (${free_gb} GB < ${MIN_FREE_GB} GB), dentro da margem de seguranca (${MIN_FREE_GB_SOFT_MARGIN} GB)."
      log "Prosseguindo em modo degradado sem stack de IA local."
    else
      log "Espaco insuficiente para instalar dependencias (minimo recomendado: ${MIN_FREE_GB} GB)."
      log "Aumente o volume EBS da instancia ou limpe arquivos antigos em /opt/higra-sigs."
      exit 1
    fi
  fi
}

cleanup_before_install() {
  log "Limpando caches para economizar disco..."
  rm -rf "$HOME/.cache/pip" "$HOME/.cache/huggingface" "$HOME/.npm/_cacache" "$HOME/.cache/node-gyp" || true
  find "$APP_DIR" -maxdepth 1 -type d -name '.tmp-deploy-*' -exec rm -rf {} + 2>/dev/null || true
  prune_deploy_artifacts || true
  case "$PKG_MANAGER" in
    dnf) sudo dnf clean all || true ;;
    yum) sudo yum clean all || true ;;
    apt) sudo apt-get clean || true ;;
  esac
}

cleanup_heavy_artifacts() {
  log "Limpando artefatos pesados por falta de espaco..."
  rm -rf frontend/node_modules || true
  prune_deploy_artifacts || true
  if [ "$ALLOW_VENV_PURGE_ON_LOW_DISK" = "true" ]; then
    log "ALLOW_VENV_PURGE_ON_LOW_DISK=true | removendo backend/venv."
    rm -rf backend/venv || true
  else
    log "Preservando backend/venv para evitar reinstalacao completa com pouco disco."
  fi
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
  else
    log "Nenhum gerenciador de pacotes suportado foi encontrado (apt/dnf/yum)."
    exit 1
  fi
}

install_system_packages() {
  case "$PKG_MANAGER" in
    apt)
      sudo apt-get update -y
      sudo apt-get install -y \
        git \
        curl \
        nginx \
        certbot \
        python3-certbot-nginx \
        python3-venv \
        python3-pip \
        build-essential
      ;;
    dnf)
      sudo dnf makecache -y
      sudo dnf install -y \
        git \
        nginx \
        certbot \
        python3-certbot-nginx \
        python3 \
        python3-pip \
        gcc \
        gcc-c++ \
        make
      ;;
    yum)
      sudo yum makecache -y
      sudo yum install -y \
        git \
        nginx \
        certbot \
        python3-certbot-nginx \
        python3 \
        python3-pip \
        gcc \
        gcc-c++ \
        make
      ;;
  esac
}

ensure_curl() {
  if command -v curl >/dev/null 2>&1; then
    return
  fi

  log "curl nao encontrado. Instalando..."
  case "$PKG_MANAGER" in
    apt)
      sudo apt-get update -y
      sudo apt-get install -y curl
      ;;
    dnf)
      sudo dnf install -y curl-minimal
      ;;
    yum)
      sudo yum install -y curl-minimal
      ;;
  esac
}

install_nodejs_22() {
  log "Node.js nao encontrado. Instalando Node.js 22..."
  case "$PKG_MANAGER" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
      sudo dnf install -y nodejs
      ;;
    yum)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
      sudo yum install -y nodejs
      ;;
  esac
}

if [ ! -d "$APP_DIR/.git" ]; then
  log "Repositorio nao encontrado em $APP_DIR/.git."
  log "Faça clone do repositorio antes de executar este script."
  exit 1
fi

detect_package_manager
log "Gerenciador de pacotes detectado: $PKG_MANAGER"

cd "$APP_DIR"
log "Deploy iniciado em $APP_DIR (branch: $BRANCH)"
normalize_deploy_inputs
prune_deploy_artifacts || true
log "Preparacao inicial concluida."

if [ -z "${CHAT_PROVIDER:-}" ] && [ -f backend/.env ]; then
  CHAT_PROVIDER="$(sed -n 's/^CHAT_PROVIDER=//p' backend/.env | tail -n 1 | tr -d '"' | tr -d "'")"
fi

if [ -z "${CHAT_PROVIDER:-}" ] && [ -f backend/.env ]; then
  n8n_webhook="$(sed -n 's/^N8N_CHAT_WEBHOOK_URL=//p' backend/.env | tail -n 1 | tr -d '"' | tr -d "'")"
  if [ -n "${n8n_webhook:-}" ]; then
    CHAT_PROVIDER="n8n"
  fi
fi

[ -n "${CHAT_PROVIDER:-}" ] || CHAT_PROVIDER="local"
CHAT_PROVIDER="$(echo "$CHAT_PROVIDER" | tr '[:upper:]' '[:lower:]')"

case "$INSTALL_LOCAL_AI_STACK" in
  auto|true|false) ;;
  *)
    log "INSTALL_LOCAL_AI_STACK invalido (${INSTALL_LOCAL_AI_STACK}). Usando 'auto'."
    INSTALL_LOCAL_AI_STACK="auto"
    ;;
esac

if [ "$CHAT_PROVIDER" = "n8n" ]; then
  INSTALL_LOCAL_AI_STACK="false"
elif [ "$INSTALL_LOCAL_AI_STACK" = "auto" ]; then
  free_before_plan="$(free_space_gb "$APP_DIR")"
  if awk "BEGIN {exit !($free_before_plan < $MIN_FREE_GB_LOCAL_AI)}"; then
    if [ "$ALLOW_DEGRADED_LOCAL_AI_DEPLOY" = "true" ]; then
      INSTALL_LOCAL_AI_STACK="false"
      log "Espaco abaixo de ${MIN_FREE_GB_LOCAL_AI} GB para IA local (${free_before_plan} GB)."
      log "Deploy degradado ativado: restante da aplicacao sera publicado sem stack de IA local."
    else
      INSTALL_LOCAL_AI_STACK="true"
    fi
  else
    INSTALL_LOCAL_AI_STACK="true"
  fi
fi

if [ -z "${MIN_FREE_GB:-}" ]; then
  if [ "$CHAT_PROVIDER" = "n8n" ] || [ "$INSTALL_LOCAL_AI_STACK" = "false" ]; then
    MIN_FREE_GB="$MIN_FREE_GB_N8N"
  else
    MIN_FREE_GB="$MIN_FREE_GB_LOCAL_AI"
  fi
fi
log "Chat provider ativo: ${CHAT_PROVIDER} | minimo de disco: ${MIN_FREE_GB} GB"
log "Instalacao da stack IA local: ${INSTALL_LOCAL_AI_STACK}"
log "Retencao de artefatos de deploy: ${DEPLOY_ARTIFACTS_TO_KEEP}"
if [ "$SKIP_FRONTEND_BUILD" = "true" ]; then
  log "Frontend: usando artefato de CI (${FRONTEND_DIST_ARCHIVE:-<nao informado>})."
else
  log "Frontend: build local na EC2."
fi

if [ "$INSTALL_PACKAGES" = "true" ]; then
  log "Instalando dependencias de sistema..."
  install_system_packages
fi

ensure_curl
assert_min_disk_space

if [ "$ENABLE_SWAP" = "true" ] && ! sudo swapon --show | grep -q '/swapfile'; then
  log "Criando swapfile (4GB) para ajudar em instancias pequenas..."
  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f backend/.env ]; then
  log "backend/.env nao encontrado. Criando template..."
  cp backend/.env.example backend/.env
  log "Preencha backend/.env e execute o deploy novamente."
  exit 1
fi

if [ ! -f frontend/.env.production ]; then
  log "frontend/.env.production nao encontrado. Criando com dominio padrao..."
  cat > frontend/.env.production <<EOF
VITE_API_URL=https://${DOMAIN}
EOF
fi

install_backend_dependencies

log "Espaco livre ao final da instalacao: $(free_space_gb "$APP_DIR") GB"

log "Validando import do backend..."
if backend/venv/bin/python -c "import backend.main" >/tmp/higra_backend_import.log 2>&1; then
  log "Import do backend OK."
else
  log "Falha ao importar backend.main. Saida:"
  cat /tmp/higra_backend_import.log || true
  exit 1
fi

build_or_extract_frontend

if ! command -v node >/dev/null 2>&1; then
  install_nodejs_22
fi

log "Configurando service do backend no systemd..."
sudo tee /etc/systemd/system/higra-backend.service >/dev/null <<EOF
[Unit]
Description=Higra Sigs Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=BACKEND_RELOAD=false
Environment=SKIP_PY39_COMPAT_CHECK=true
ExecStart=/usr/bin/env node ${APP_DIR}/scripts/start-backend.js
Restart=always
RestartSec=5
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable higra-backend.service
sudo systemctl restart higra-backend.service

if ! sudo systemctl is-active --quiet higra-backend.service; then
  log "Service higra-backend nao ficou ativo apos restart."
  log "Status do service:"
  sudo systemctl status higra-backend.service --no-pager || true
  log "Ultimos logs do backend:"
  sudo journalctl -u higra-backend -n 200 --no-pager || true
  exit 1
fi

log "Configurando Nginx..."
NGINX_CONFIG_PATH="/etc/nginx/conf.d/higra-sigs.conf"
if [ -d /etc/nginx/sites-available ] || [ -d /etc/nginx/sites-enabled ]; then
  sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  NGINX_CONFIG_PATH="/etc/nginx/sites-available/higra-sigs.conf"
fi

sudo tee "$NGINX_CONFIG_PATH" >/dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 100M;
    root ${APP_DIR}/frontend/dist;
    index index.html;

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600;
    }

    location ~ ^/(auth|historico|social|upload|arquimedes)(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
        proxy_send_timeout 300;
        proxy_connect_timeout 60;
    }

    # Rotas abaixo compartilham prefixo com páginas do SPA.
    # Fazemos proxy apenas para os subcaminhos reais da API para
    # preservar reload/acesso direto em /seletor, /perda-carga, /npsh e /invites.
    location ~ ^/seletor/historico(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~ ^/perda-carga/(historico|componentes)(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~ ^/npsh/historico(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~ ^/invites/(me|list|generate|verify|accept|profile-status|complete-profile|waitlist|revoke|admin)(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~ ^/(docs|redoc|openapi.json)$ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

if [ "$NGINX_CONFIG_PATH" = "/etc/nginx/sites-available/higra-sigs.conf" ]; then
  sudo ln -sfn /etc/nginx/sites-available/higra-sigs.conf /etc/nginx/sites-enabled/higra-sigs.conf
  sudo rm -f /etc/nginx/sites-enabled/default
else
  sudo rm -f /etc/nginx/conf.d/default.conf
fi

sudo systemctl enable --now nginx
sudo nginx -t
sudo systemctl restart nginx

if [ "$ENABLE_CERTBOT" = "true" ]; then
  if [ -z "$LETSENCRYPT_EMAIL" ]; then
    log "LETSENCRYPT_EMAIL vazio; pulando Certbot."
  else
    log "Configurando HTTPS com Certbot..."
    sudo certbot --nginx \
      -d "$DOMAIN" \
      --non-interactive \
      --agree-tos \
      -m "$LETSENCRYPT_EMAIL" \
      --redirect || log "Certbot falhou. Confira DNS/porta 80 e execute novamente."
  fi
fi

log "Validando backend..."
backend_ok="false"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/docs >/dev/null; then
    backend_ok="true"
    break
  fi
  sleep 2
done

if [ "$backend_ok" = "true" ]; then
  log "Backend OK."
else
  log "Backend nao respondeu em /docs apos tentativas de inicializacao."
  log "Status do service:"
  sudo systemctl status higra-backend.service --no-pager || true
  log "Ultimos logs do backend:"
  sudo journalctl -u higra-backend -n 200 --no-pager || true
  exit 1
fi

log "Deploy finalizado com sucesso."
