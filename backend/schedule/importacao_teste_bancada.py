from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from psycopg2.extras import Json
from backend.database import connect_db_direct


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENV_PATH = PROJECT_ROOT / "backend" / ".env"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(BACKEND_ENV_PATH, override=False)

logger = logging.getLogger("higra.schedule.importacao_teste_bancada")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.propagate = False


DEFAULT_REQUEST_TIMEOUT_MS = 30000
DEFAULT_FETCH_MAX_ATTEMPTS = 3
DEFAULT_FETCH_RETRY_BASE_DELAY_MS = 1000
DEFAULT_PROGRESS_LOG_EVERY = 100
MAX_ERROR_LOGS_PER_MESSAGE = 3
MAX_PG_INTEGER = 2147483647


def parse_env_int(value: str | None, default: int, *, minimum: int | None = None) -> int:
    try:
        parsed = int(str(value).strip()) if value is not None and str(value).strip() else default
    except (TypeError, ValueError):
        return default
    if minimum is not None and parsed < minimum:
        return default
    return parsed


def format_duration_ms(duration_ms: float) -> str:
    total_seconds = max(0, round(duration_ms / 1000))
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}m{seconds:02d}s"


def get_runtime_config() -> dict[str, Any]:
    source_url = os.getenv("SOURCE_URL")

    request_timeout_ms = parse_env_int(
        os.getenv("REQUEST_TIMEOUT_MS"),
        DEFAULT_REQUEST_TIMEOUT_MS,
        minimum=1,
    )
    fetch_max_attempts = parse_env_int(
        os.getenv("FETCH_MAX_ATTEMPTS"),
        DEFAULT_FETCH_MAX_ATTEMPTS,
        minimum=1,
    )
    fetch_retry_base_delay_ms = parse_env_int(
        os.getenv("FETCH_RETRY_BASE_DELAY_MS"),
        DEFAULT_FETCH_RETRY_BASE_DELAY_MS,
        minimum=0,
    )
    progress_log_every = parse_env_int(
        os.getenv("PROGRESS_LOG_EVERY"),
        DEFAULT_PROGRESS_LOG_EVERY,
        minimum=0,
    )

    if not source_url:
        raise RuntimeError("Variável de ambiente SOURCE_URL não informada.")

    return {
        "source_url": source_url,
        "request_timeout_ms": request_timeout_ms,
        "fetch_max_attempts": fetch_max_attempts,
        "fetch_retry_base_delay_ms": fetch_retry_base_delay_ms,
        "progress_log_every": progress_log_every,
    }


def stable_json_dumps(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )


def build_payload_hash(payload: Any) -> str:
    return hashlib.sha256(stable_json_dumps(payload).encode("utf-8")).hexdigest()


def parse_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value == value and value not in (float("inf"), float("-inf")) else None

    if isinstance(value, str):
        normalized = value.replace(",", ".").strip()
        if not normalized:
            return None
        try:
            parsed = float(normalized)
        except ValueError:
            return None
        if parsed != parsed or parsed in (float("inf"), float("-inf")):
            return None
        return parsed

    return None


def parse_integer(value: Any) -> int | None:
    number = parse_number(value)
    return None if number is None else int(number)


def build_synthetic_equipment_id(item: Any) -> int | None:
    if not isinstance(item, dict):
        return None

    fingerprint = "|".join(
        value
        for value in [
            parse_string(item.get("numero_serie")),
            parse_string(item.get("numero_motor")),
            parse_string(item.get("modelo_bomba")),
            parse_string(item.get("cliente")),
            parse_string(item.get("pedido")),
        ]
        if value
    )

    if not fingerprint:
        return None

    hash_hex = hashlib.sha1(fingerprint.encode("utf-8")).hexdigest()[:8]
    parsed = int(hash_hex, 16)
    synthetic_id = (parsed % MAX_PG_INTEGER) + 1
    return -synthetic_id if synthetic_id > 0 else None


def parse_equipment_id(value: Any, item: Any) -> int | None:
    text = parse_string(value)
    if not text:
        return build_synthetic_equipment_id(item)

    normalized = text.lower()
    if normalized in {"na", "n/a"}:
        return build_synthetic_equipment_id(item)

    parsed = parse_integer(text)
    if parsed is None or parsed <= 0:
        return build_synthetic_equipment_id(item)

    return parsed


def _normalize_datetime(date: datetime) -> datetime:
    if date.tzinfo is None:
        return date
    return date.astimezone(timezone.utc)


def parse_timestamp(value: Any) -> datetime | None:
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        return _normalize_datetime(value)

    text = str(value).strip()
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        return _normalize_datetime(parsed)
    except ValueError:
        pass

    patterns = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
    ]
    for pattern in patterns:
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue

    return None


def parse_timestamp_ms(value: Any) -> int | None:
    parsed = parse_timestamp(value)
    if parsed is None:
        return None
    return int(parsed.timestamp() * 1000)


def wait_ms(value: int) -> None:
    time.sleep(max(0, value) / 1000)


def get_fetch_error_code(error: Exception) -> str | None:
    if isinstance(error, httpx.ConnectTimeout):
        return "CONNECT_TIMEOUT"
    if isinstance(error, httpx.ReadTimeout):
        return "READ_TIMEOUT"
    if isinstance(error, httpx.WriteTimeout):
        return "WRITE_TIMEOUT"
    if isinstance(error, httpx.PoolTimeout):
        return "POOL_TIMEOUT"
    if isinstance(error, httpx.ConnectError):
        return "CONNECT_ERROR"
    if isinstance(error, httpx.ReadError):
        return "READ_ERROR"
    if isinstance(error, httpx.RemoteProtocolError):
        return "REMOTE_PROTOCOL_ERROR"
    if isinstance(error, httpx.NetworkError):
        return "NETWORK_ERROR"
    return None


def is_retriable_fetch_error(error: Exception) -> bool:
    return isinstance(
        error,
        (
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.RemoteProtocolError,
        ),
    )


def map_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "e3timestamp": parse_timestamp(item.get("e3timestamp")),
        "cliente": parse_string(item.get("cliente")),
        "pedido": parse_string(item.get("pedido")),
        "modelo_bomba": parse_string(item.get("modelo_bomba")),
        "vazao": parse_number(item.get("vazao")),
        "pressao": parse_number(item.get("pressao")),
        "potencia": parse_number(item.get("potencia")),
        "tensao": parse_number(item.get("tensao")),
        "rendimento": parse_number(item.get("rendimento")),
        "cosseno_fi": parse_number(item.get("cosseno_fi")),
        "corrente": parse_number(item.get("corrente")),
        "frequencia": parse_number(item.get("frequencia")),
        "rotacao": parse_number(item.get("rotacao")),
        "diametro_rotor": parse_string(item.get("diametro_rotor")),
        "numero_serie": parse_string(item.get("numero_serie")),
        "numero_motor": parse_string(item.get("numero_motor")),
        "material_rotor": parse_string(item.get("material_rotor")),
        "material_difusor": parse_string(item.get("material_difusor")),
        "medidor_vazao": parse_string(item.get("medidor_vazao")),
        "medidor_pressao": parse_string(item.get("medidor_pressao")),
        "medidor_eletrico": parse_string(item.get("medidor_eletrico")),
        "referencia": parse_string(item.get("referencia")),
        "fator_servico": parse_string(item.get("fator_servico")),
        "versao_teste": parse_string(item.get("versao_teste")),
        "observacao": parse_string(item.get("observacao")),
        "sensor_temperatura": parse_string(item.get("sensor_temperatura")),
        "sensor_vibracao": parse_string(item.get("sensor_vibracao")),
        "sensor_nivel": parse_string(item.get("sensor_nivel")),
        "id_equipamento": parse_equipment_id(item.get("id_equipamento"), item),
        "norma": parse_string(item.get("norma")),
        "pressao_succao": parse_number(item.get("pressao_succao")),
        "pressao_descarga": parse_number(item.get("pressao_descarga")),
        "corretor": parse_number(item.get("corretor")),
        "pressao_total": parse_number(item.get("pressao_total")),
        "vazao_m3h": parse_number(item.get("vazao_m3h")),
        "vazao_lps": parse_number(item.get("vazao_lps")),
        "corrente_fase_r": parse_number(item.get("corrente_fase_r")),
        "corrente_fase_s": parse_number(item.get("corrente_fase_s")),
        "corrente_fase_t": parse_number(item.get("corrente_fase_t")),
        "corrente_media": parse_number(item.get("corrente_media")),
        "tensao_fase_rs": parse_number(item.get("tensao_fase_rs")),
        "tensao_fase_st": parse_number(item.get("tensao_fase_st")),
        "tensao_fase_tr": parse_number(item.get("tensao_fase_tr")),
        "tensao_media": parse_number(item.get("tensao_media")),
        "cosseno_fi_2": parse_number(item.get("cosseno_fi_2")),
        "potencia_kw": parse_number(item.get("potencia_kw")),
        "potencia_cv": parse_number(item.get("potencia_cv")),
        "rendimento_motor": parse_number(item.get("rendimento_motor")),
        "rendimento_hidroenergetico": parse_number(item.get("rendimento_hidroenergetico")),
        "rendimento_bomba": parse_number(item.get("rendimento_bomba")),
        "potencia_mecanica": parse_number(item.get("potencia_mecanica")),
        "temperatura_fase_r": parse_number(item.get("temperatura_fase_r")),
        "temperatura_fase_s": parse_number(item.get("temperatura_fase_s")),
        "temperatura_fase_t": parse_number(item.get("temperatura_fase_t")),
        "temperatura_axial": parse_number(item.get("temperatura_axial")),
        "temperatura_radial": parse_number(item.get("temperatura_radial")),
        "vibracao_axial": parse_number(item.get("vibracao_axial")),
        "vibracao_radial": parse_number(item.get("vibracao_radial")),
        "vibracao_terceiro_eixo": parse_number(item.get("vibracao_terceiro_eixo")),
        "nivel_1": parse_string(item.get("nivel_1")),
        "nivel_2": parse_string(item.get("nivel_2")),
        "rotacao_medida": parse_number(item.get("rotacao_medida")),
        "potencia_ativa_r": parse_number(item.get("potencia_ativa_r")),
        "potencia_ativa_s": parse_number(item.get("potencia_ativa_s")),
        "potencia_ativa_t": parse_number(item.get("potencia_ativa_t")),
        "potencia_ativa_media": parse_number(item.get("potencia_ativa_media")),
        "potencia_reativa_r": parse_number(item.get("potencia_reativa_r")),
        "potencia_reativa_s": parse_number(item.get("potencia_reativa_s")),
        "potencia_reativa_t": parse_number(item.get("potencia_reativa_t")),
        "potencia_reativa_media": parse_number(item.get("potencia_reativa_media")),
        "potencia_aparente_r": parse_number(item.get("potencia_aparente_r")),
        "potencia_aparente_s": parse_number(item.get("potencia_aparente_s")),
        "potencia_aparente_t": parse_number(item.get("potencia_aparente_t")),
        "potencia_aparente_media": parse_number(item.get("potencia_aparente_media")),
        "fator_potencia_r": parse_number(item.get("fator_potencia_r")),
        "fator_potencia_s": parse_number(item.get("fator_potencia_s")),
        "fator_potencia_t": parse_number(item.get("fator_potencia_t")),
        "fator_potencia_media": parse_number(item.get("fator_potencia_media")),
        "aprovacao": parse_string(item.get("aprovacao")),
        "tipo_rotor": parse_string(item.get("tipo_rotor")),
        "qtd_estagios": parse_integer(item.get("qtd_estagios")),
        "diametro_interno_rotor": parse_number(item.get("diametro_interno_rotor")),
        "tipo_equipamento": parse_string(item.get("tipo_equipamento")),
        "unidade_negocio": parse_string(item.get("unidade_negocio")),
        "corrente_calculada": parse_number(item.get("corrente_calculada")),
        "aprov_calc": parse_string(item.get("aprov_calc")),
    }


def fetch_json(url: str, runtime_config: dict[str, Any]) -> Any:
    last_error: Exception | None = None
    timeout = httpx.Timeout(runtime_config["request_timeout_ms"] / 1000)

    for attempt in range(1, runtime_config["fetch_max_attempts"] + 1):
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                response = client.get(url, headers={"Accept": "application/json"})
                if response.status_code >= 400:
                    raise RuntimeError(f"Falha ao consumir URL. HTTP {response.status_code}")
                return response.json()
        except Exception as error:
            last_error = error
            can_retry = (
                attempt < runtime_config["fetch_max_attempts"]
                and is_retriable_fetch_error(error)
            )

            if can_retry:
                backoff_ms = runtime_config["fetch_retry_base_delay_ms"] * (2 ** (attempt - 1))
                reason_code = get_fetch_error_code(error) or error.__class__.__name__
                logger.warning(
                    "[importacao] Falha de rede ao consumir URL (tentativa %s/%s, motivo=%s). "
                    "Nova tentativa em %sms.",
                    attempt,
                    runtime_config["fetch_max_attempts"],
                    reason_code,
                    backoff_ms,
                )
                wait_ms(backoff_ms)
                continue
            break

    assert last_error is not None
    reason_code = get_fetch_error_code(last_error) or "n/a"
    base_message = str(last_error)
    connectivity_hint = (
        "Não foi possível abrir conexão TCP/TLS com o host remoto dentro do prazo. "
        "Verifique saída de internet do ambiente, rotas, regras de firewall e "
        "disponibilidade do endpoint."
        if reason_code == "CONNECT_TIMEOUT"
        else "Verifique conectividade do ambiente e disponibilidade do endpoint remoto."
    )
    raise RuntimeError(
        f"Falha ao consumir URL após {runtime_config['fetch_max_attempts']} tentativa(s). "
        f"code={reason_code}. detalhe={base_message}. {connectivity_hint}",
    ) from last_error


def extract_items_from_response(payload: Any) -> list[Any] | None:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return None
    items = payload.get("items")
    return items if isinstance(items, list) else None


def create_execution(cur, source_url: str) -> int:
    cur.execute(
        """
        INSERT INTO sigs.importacao_teste_bancada_execucao (
          origem_url,
          status
        )
        VALUES (%s, 'PROCESSANDO')
        RETURNING id
        """,
        (source_url,),
    )
    row = cur.fetchone()
    assert row is not None
    return row[0]


def finish_execution(cur, execution_id: int, payload: dict[str, Any]) -> None:
    cur.execute(
        """
        UPDATE sigs.importacao_teste_bancada_execucao
           SET finalizado_em = NOW(),
               status = %s,
               total_recebidos = %s,
               total_inseridos_raw = %s,
               total_processados = %s,
               total_inseridos_final = %s,
               total_atualizados_final = %s,
               total_erros = %s,
               mensagem = %s
         WHERE id = %s
        """,
        (
            payload["status"],
            payload["total_recebidos"],
            payload["total_inseridos_raw"],
            payload["total_processados"],
            payload["total_inseridos_final"],
            payload["total_atualizados_final"],
            payload["total_erros"],
            payload["mensagem"],
            execution_id,
        ),
    )


def get_latest_final_timestamp(cur) -> datetime | None:
    cur.execute(
        """
        SELECT e3timestamp
          FROM sigs.teste_bancada
         ORDER BY e3timestamp DESC
         LIMIT 1
        """,
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return None
    return parse_timestamp(row[0])


def insert_raw_if_missing(
    cur,
    execution_id: int,
    item: dict[str, Any],
    mapped: dict[str, Any],
    payload_hash: str,
) -> tuple[bool, int | None]:
    cur.execute(
        """
        INSERT INTO sigs.raw_teste_bancada (
          execucao_id,
          e3timestamp,
          id_equipamento,
          payload,
          payload_hash
        )
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (id_equipamento, e3timestamp)
        DO NOTHING
        RETURNING id
        """,
        (
            execution_id,
            mapped["e3timestamp"],
            mapped["id_equipamento"],
            Json(item),
            payload_hash,
        ),
    )
    row = cur.fetchone()
    if row:
        return True, row[0]

    cur.execute(
        """
        SELECT id
          FROM sigs.raw_teste_bancada
         WHERE id_equipamento = %s
           AND e3timestamp = %s
         LIMIT 1
        """,
        (mapped["id_equipamento"], mapped["e3timestamp"]),
    )
    existing_row = cur.fetchone()
    return False, existing_row[0] if existing_row else None


def mark_raw_processed(cur, raw_id: int) -> None:
    cur.execute(
        """
        UPDATE sigs.raw_teste_bancada
           SET processado = TRUE,
               erro_processamento = NULL,
               updated_at = NOW()
         WHERE id = %s
        """,
        (raw_id,),
    )


def mark_raw_error(cur, raw_id: int, error_message: str) -> None:
    cur.execute(
        """
        UPDATE sigs.raw_teste_bancada
           SET processado = FALSE,
               erro_processamento = LEFT(%s, 4000),
               updated_at = NOW()
         WHERE id = %s
        """,
        (error_message, raw_id),
    )


def insert_final_if_missing(cur, raw_id: int, mapped: dict[str, Any]) -> bool:
    values = [
        raw_id,
        mapped["e3timestamp"],
        mapped["id_equipamento"],
        mapped["cliente"],
        mapped["pedido"],
        mapped["modelo_bomba"],
        mapped["vazao"],
        mapped["pressao"],
        mapped["potencia"],
        mapped["tensao"],
        mapped["rendimento"],
        mapped["cosseno_fi"],
        mapped["corrente"],
        mapped["frequencia"],
        mapped["rotacao"],
        mapped["diametro_rotor"],
        mapped["numero_serie"],
        mapped["numero_motor"],
        mapped["material_rotor"],
        mapped["material_difusor"],
        mapped["medidor_vazao"],
        mapped["medidor_pressao"],
        mapped["medidor_eletrico"],
        mapped["referencia"],
        mapped["fator_servico"],
        mapped["versao_teste"],
        mapped["observacao"],
        mapped["sensor_temperatura"],
        mapped["sensor_vibracao"],
        mapped["sensor_nivel"],
        mapped["norma"],
        mapped["pressao_succao"],
        mapped["pressao_descarga"],
        mapped["corretor"],
        mapped["pressao_total"],
        mapped["vazao_m3h"],
        mapped["vazao_lps"],
        mapped["corrente_fase_r"],
        mapped["corrente_fase_s"],
        mapped["corrente_fase_t"],
        mapped["corrente_media"],
        mapped["tensao_fase_rs"],
        mapped["tensao_fase_st"],
        mapped["tensao_fase_tr"],
        mapped["tensao_media"],
        mapped["cosseno_fi_2"],
        mapped["potencia_kw"],
        mapped["potencia_cv"],
        mapped["rendimento_motor"],
        mapped["rendimento_hidroenergetico"],
        mapped["rendimento_bomba"],
        mapped["potencia_mecanica"],
        mapped["temperatura_fase_r"],
        mapped["temperatura_fase_s"],
        mapped["temperatura_fase_t"],
        mapped["temperatura_axial"],
        mapped["temperatura_radial"],
        mapped["vibracao_axial"],
        mapped["vibracao_radial"],
        mapped["vibracao_terceiro_eixo"],
        mapped["nivel_1"],
        mapped["nivel_2"],
        mapped["rotacao_medida"],
        mapped["potencia_ativa_r"],
        mapped["potencia_ativa_s"],
        mapped["potencia_ativa_t"],
        mapped["potencia_ativa_media"],
        mapped["potencia_reativa_r"],
        mapped["potencia_reativa_s"],
        mapped["potencia_reativa_t"],
        mapped["potencia_reativa_media"],
        mapped["potencia_aparente_r"],
        mapped["potencia_aparente_s"],
        mapped["potencia_aparente_t"],
        mapped["potencia_aparente_media"],
        mapped["fator_potencia_r"],
        mapped["fator_potencia_s"],
        mapped["fator_potencia_t"],
        mapped["fator_potencia_media"],
        mapped["aprovacao"],
        mapped["tipo_rotor"],
        mapped["qtd_estagios"],
        mapped["diametro_interno_rotor"],
        mapped["tipo_equipamento"],
        mapped["unidade_negocio"],
        mapped["corrente_calculada"],
        mapped["aprov_calc"],
    ]

    placeholders = ", ".join(["%s"] * len(values))
    cur.execute(
        f"""
        INSERT INTO sigs.teste_bancada (
          raw_id,
          e3timestamp,
          id_equipamento,
          cliente,
          pedido,
          modelo_bomba,
          vazao,
          pressao,
          potencia,
          tensao,
          rendimento,
          cosseno_fi,
          corrente,
          frequencia,
          rotacao,
          diametro_rotor,
          numero_serie,
          numero_motor,
          material_rotor,
          material_difusor,
          medidor_vazao,
          medidor_pressao,
          medidor_eletrico,
          referencia,
          fator_servico,
          versao_teste,
          observacao,
          sensor_temperatura,
          sensor_vibracao,
          sensor_nivel,
          norma,
          pressao_succao,
          pressao_descarga,
          corretor,
          pressao_total,
          vazao_m3h,
          vazao_lps,
          corrente_fase_r,
          corrente_fase_s,
          corrente_fase_t,
          corrente_media,
          tensao_fase_rs,
          tensao_fase_st,
          tensao_fase_tr,
          tensao_media,
          cosseno_fi_2,
          potencia_kw,
          potencia_cv,
          rendimento_motor,
          rendimento_hidroenergetico,
          rendimento_bomba,
          potencia_mecanica,
          temperatura_fase_r,
          temperatura_fase_s,
          temperatura_fase_t,
          temperatura_axial,
          temperatura_radial,
          vibracao_axial,
          vibracao_radial,
          vibracao_terceiro_eixo,
          nivel_1,
          nivel_2,
          rotacao_medida,
          potencia_ativa_r,
          potencia_ativa_s,
          potencia_ativa_t,
          potencia_ativa_media,
          potencia_reativa_r,
          potencia_reativa_s,
          potencia_reativa_t,
          potencia_reativa_media,
          potencia_aparente_r,
          potencia_aparente_s,
          potencia_aparente_t,
          potencia_aparente_media,
          fator_potencia_r,
          fator_potencia_s,
          fator_potencia_t,
          fator_potencia_media,
          aprovacao,
          tipo_rotor,
          qtd_estagios,
          diametro_interno_rotor,
          tipo_equipamento,
          unidade_negocio,
          corrente_calculada,
          aprov_calc
        )
        VALUES ({placeholders})
        ON CONFLICT (id_equipamento, e3timestamp)
        DO NOTHING
        RETURNING id
        """,
        values,
    )
    return cur.fetchone() is not None


def handler(event: Any = None, context: Any = None) -> dict[str, Any]:
    del event, context

    started_at = time.time() * 1000
    runtime_config = get_runtime_config()
    logger.info("[importacao] Iniciando importação da URL: %s", runtime_config["source_url"])
    logger.info("[importacao] Aguardando conexão com o banco...")

    conn = None
    execution_id = None
    total_recebidos = 0
    total_inseridos_raw = 0
    total_processados = 0
    total_inseridos_final = 0
    total_atualizados_final = 0
    total_ignorados_existentes = 0
    total_ignorados_ate_ultima_data = 0
    total_erros = 0
    last_imported_timestamp = None
    error_count_by_message: dict[str, int] = {}

    try:
        conn = connect_db_direct()
        conn.autocommit = True
        logger.info("[importacao] Conexão com banco estabelecida.")

        with conn.cursor() as cur:
            execution_id = create_execution(cur, runtime_config["source_url"])
        logger.info("[importacao] Execução criada com id=%s.", execution_id)

        with conn.cursor() as cur:
            last_imported_timestamp = get_latest_final_timestamp(cur)

        if last_imported_timestamp is not None:
            logger.info(
                "[importacao] Última data no banco (ORDER BY e3timestamp DESC): %s.",
                last_imported_timestamp.isoformat(),
            )
            logger.info(
                "[importacao] Serão processados itens com e3timestamp maior ou igual a essa data.",
            )
        else:
            logger.info(
                "[importacao] Banco ainda sem dados em teste_bancada. Todos os itens serão avaliados para inserção.",
            )

        logger.info("[importacao] Buscando dados da API...")
        logger.info(
            "[importacao] Configuração de fetch: timeout=%sms, tentativas=%s, backoff_base=%sms.",
            runtime_config["request_timeout_ms"],
            runtime_config["fetch_max_attempts"],
            runtime_config["fetch_retry_base_delay_ms"],
        )
        response_payload = fetch_json(runtime_config["source_url"], runtime_config)
        data = extract_items_from_response(response_payload)

        if data is None:
            if isinstance(response_payload, dict):
                keys = ", ".join(response_payload.keys()) or "(sem chaves)"
            else:
                keys = f"(tipo {type(response_payload).__name__})"
            raise RuntimeError(
                f"A resposta da URL não contém lista de itens. Chaves encontradas: {keys}.",
            )

        total_recebidos = len(data)
        logger.info("[importacao] API retornou %s itens.", total_recebidos)

        for item in data:
            raw_id = None

            try:
                if not isinstance(item, dict):
                    raise RuntimeError("Item da resposta inválido: esperado objeto JSON.")

                mapped = map_payload(item)

                if not mapped["e3timestamp"]:
                    raise RuntimeError("Campo e3timestamp inválido ou ausente.")

                if mapped["id_equipamento"] is None:
                    raise RuntimeError("Campo id_equipamento inválido ou ausente.")

                if not mapped["cliente"]:
                    raise RuntimeError("Campo cliente inválido ou ausente.")

                mapped_timestamp_ms = parse_timestamp_ms(mapped["e3timestamp"])
                if mapped_timestamp_ms is None:
                    raise RuntimeError("Campo e3timestamp inválido.")

                last_imported_timestamp_ms = parse_timestamp_ms(last_imported_timestamp)
                if (
                    last_imported_timestamp_ms is not None
                    and mapped_timestamp_ms < last_imported_timestamp_ms
                ):
                    total_ignorados_ate_ultima_data += 1
                    continue

                payload_hash = build_payload_hash(item)

                with conn.cursor() as cur:
                    cur.execute("BEGIN")
                    inserted_raw, raw_id = insert_raw_if_missing(
                        cur,
                        execution_id,
                        item,
                        mapped,
                        payload_hash,
                    )
                    if not raw_id:
                        raise RuntimeError(
                            "Falha ao resolver raw_id para o registro atual (insert/select).",
                        )

                    inserted_final = insert_final_if_missing(cur, raw_id, mapped)
                    mark_raw_processed(cur, raw_id)
                    cur.execute("COMMIT")

                if inserted_raw:
                    total_inseridos_raw += 1

                if inserted_final:
                    total_processados += 1
                    total_inseridos_final += 1
                else:
                    total_ignorados_existentes += 1

            except Exception as error:
                total_erros += 1
                error_message = str(error)

                try:
                    with conn.cursor() as cur:
                        cur.execute("ROLLBACK")
                except Exception:
                    pass

                if raw_id:
                    try:
                        with conn.cursor() as cur:
                            mark_raw_error(cur, raw_id, error_message)
                    except Exception:
                        pass

                count = error_count_by_message.get(error_message, 0) + 1
                error_count_by_message[error_message] = count

                if count <= MAX_ERROR_LOGS_PER_MESSAGE:
                    logger.error("Erro ao processar item: %s", error_message)
                elif count == MAX_ERROR_LOGS_PER_MESSAGE + 1:
                    logger.error(
                        'Erro repetido "%s" (mais ocorrências serão suprimidas).',
                        error_message,
                    )

            total_iterados = (
                total_processados
                + total_ignorados_existentes
                + total_ignorados_ate_ultima_data
                + total_erros
            )
            if (
                runtime_config["progress_log_every"] > 0
                and total_iterados > 0
                and total_iterados % runtime_config["progress_log_every"] == 0
            ):
                elapsed_ms = (time.time() * 1000) - started_at
                rate_per_second = total_iterados / (elapsed_ms / 1000) if elapsed_ms > 0 else 0
                remaining_items = max(0, total_recebidos - total_iterados)
                eta_text = (
                    format_duration_ms((remaining_items / rate_per_second) * 1000)
                    if rate_per_second > 0
                    else "n/a"
                )
                logger.info(
                    "[importacao] Progresso: %s/%s (ok=%s, ignorados_existentes=%s, "
                    "ignorados_ate_ultima_data=%s, erro=%s) | ETA: %s",
                    total_iterados,
                    total_recebidos,
                    total_processados,
                    total_ignorados_existentes,
                    total_ignorados_ate_ultima_data,
                    total_erros,
                    eta_text,
                )

        if error_count_by_message:
            logger.error("Resumo de erros: %s", error_count_by_message)

        status = (
            "SUCESSO"
            if total_erros == 0
            else "SUCESSO_PARCIAL"
            if (
                total_processados > 0
                or total_ignorados_existentes > 0
                or total_ignorados_ate_ultima_data > 0
            )
            else "ERRO"
        )

        with conn.cursor() as cur:
            finish_execution(
                cur,
                execution_id,
                {
                    "status": status,
                    "total_recebidos": total_recebidos,
                    "total_inseridos_raw": total_inseridos_raw,
                    "total_processados": total_processados,
                    "total_inseridos_final": total_inseridos_final,
                    "total_atualizados_final": total_atualizados_final,
                    "total_erros": total_erros,
                    "mensagem": (
                        "Importação concluída. "
                        f"Inseridos: {total_processados}, "
                        f"ignorados_existentes: {total_ignorados_existentes}, "
                        f"ignorados_ate_ultima_data: {total_ignorados_ate_ultima_data}, "
                        f"erros: {total_erros}."
                    ),
                },
            )
        logger.info(
            "[importacao] Concluído. Inseridos=%s, ignorados_existentes=%s, "
            "ignorados_ate_ultima_data=%s, erros=%s.",
            total_inseridos_final,
            total_ignorados_existentes,
            total_ignorados_ate_ultima_data,
            total_erros,
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Importação concluída com sucesso.",
                    "executionId": execution_id,
                    "totalRecebidos": total_recebidos,
                    "totalInseridosRaw": total_inseridos_raw,
                    "totalProcessados": total_processados,
                    "totalInseridosFinal": total_inseridos_final,
                    "totalAtualizadosFinal": total_atualizados_final,
                    "totalIgnoradosExistentes": total_ignorados_existentes,
                    "totalIgnoradosAteUltimaData": total_ignorados_ate_ultima_data,
                    "totalErros": total_erros,
                },
                ensure_ascii=False,
            ),
        }
    except Exception as error:
        logger.exception("Erro fatal: %s", error)

        if execution_id and conn:
            try:
                with conn.cursor() as cur:
                    finish_execution(
                        cur,
                        execution_id,
                        {
                            "status": "ERRO",
                            "total_recebidos": total_recebidos,
                            "total_inseridos_raw": total_inseridos_raw,
                            "total_processados": total_processados,
                            "total_inseridos_final": total_inseridos_final,
                            "total_atualizados_final": total_atualizados_final,
                            "total_erros": total_erros + 1,
                            "mensagem": str(error),
                        },
                    )
            except Exception as finish_error:
                logger.exception(
                    "Erro ao finalizar execução com falha: %s",
                    finish_error,
                )

        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "message": "Erro ao importar dados.",
                    "error": str(error),
                },
                ensure_ascii=False,
            ),
        }
    finally:
        if conn:
            conn.close()
        elapsed_ms = (time.time() * 1000) - started_at
        logger.info("[importacao] Tempo total de execução: %s.", format_duration_ms(elapsed_ms))


if __name__ == "__main__":
    result = handler()
    print(result["body"])
    sys.exit(0 if result["statusCode"] < 400 else 1)
