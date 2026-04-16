import os
import json
import datetime
from dotenv import load_dotenv
import logging

# -------------------------------------------------------------
# 🔧 Carregar .env
# -------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BASE_DIR, ".env")

if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)

# -------------------------------------------------------------
# 📝 Logger global — JSON estruturado (task 195)
# -------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    """Formata logs como JSON para correlação de requests e análise."""
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        # Campos extras passados com extra={...}
        for key in ("request_id", "user_id", "path", "method", "status"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        return json.dumps(payload, ensure_ascii=False)

logger = logging.getLogger("higra")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler()
    # JSON em produção; texto legível em dev
    if os.getenv("LOG_FORMAT", "json") == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s"
        ))
    logger.addHandler(handler)

# -------------------------------------------------------------
# 🔌 Banco de Dados
# -------------------------------------------------------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "higra123")
DB_NAME = os.getenv("DB_NAME", "higra_sigs")

DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

def get_db_config():
    """Compatibilidade com backend legado."""
    return {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "dbname": DB_NAME
    }

# -------------------------------------------------------------
# 🔐 JWT – CONFIGURAÇÕES NOVAS PARA AUTENTICAÇÃO
# -------------------------------------------------------------
JWT_SECRET_KEY   = os.getenv("JWT_SECRET_KEY", "supersecretkey123")
JWT_ALGORITHM    = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "1440"))  # 24h padrão

# -------------------------------------------------------------
# 🤖 Configurações de IA
# -------------------------------------------------------------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

logger.info(f"IA via Claude API ({CLAUDE_MODEL})")

# -------------------------------------------------------------
# 🔍 RAG (mantido)
# -------------------------------------------------------------
RAG_EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
RAG_COLLECTION_NAME = os.getenv("RAG_COLLECTION_NAME", "higra_docs")
RAG_DATA_PATH = os.getenv("RAG_DATA_PATH", os.path.join(BASE_DIR, "rag_data"))

# -------------------------------------------------------------
# 🛠️ Debug IA
# -------------------------------------------------------------
DEBUG_IA = os.getenv("DEBUG_IA", "false").lower() == "true"

logger.info("Configuração carregada com sucesso.")

# -------------------------------------------------------------
# CORS
# -------------------------------------------------------------
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8000").split(",")
    if o.strip()
]

# -------------------------------------------------------------
# Validação de configuração
# -------------------------------------------------------------
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()

_DEFAULT_SECRETS = {
    "JWT_SECRET_KEY": ("supersecretkey123", JWT_SECRET_KEY),
    "DB_PASSWORD": ("higra123", DB_PASSWORD),
}

def validate_production_config():
    for name, (default_val, current_val) in _DEFAULT_SECRETS.items():
        if current_val == default_val:
            if ENVIRONMENT == "production":
                raise RuntimeError(
                    f"ERRO FATAL: {name} está usando valor default em PRODUCTION. "
                    f"Defina {name} via variável de ambiente."
                )
            else:
                logger.warning(
                    "SEGURANCA: %s está usando valor default. "
                    "Defina via variável de ambiente antes de ir para produção.",
                    name,
                )

validate_production_config()
