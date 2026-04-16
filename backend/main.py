# -*- coding: utf-8 -*-
"""
Módulo principal da API Higra Sigs
"""

from contextlib import asynccontextmanager
import asyncio
import json
import os
import threading
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

# ==========================================================
# Configuração global e logs
# ==========================================================
from backend.core.config import logger, CORS_ORIGINS
from backend.core.limiter import limiter
from backend.database import get_db_connection
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Rotas principais
from backend.routes import (
    historico,
    chat_ws,
    social,
    social_ws,
    arquimedes,
)
from backend.auth.routes import router as auth_router, bootstrap_auth_schema

# Serviços e tabelas
from backend.services.historico_conversas_service import criar_tabela_historico_conversas
from backend.services.historico_chat_service import criar_tabela_historico_chat
from backend.services.memoria_tecnica_service import criar_tabela_memoria_tecnica
from backend.services.social_service import criar_tabelas_social
from backend.routes.tarefas.tarefas import create_tarefas_tables
from backend.routes.indicadores.metas import create_indicadores_tables
from backend.routes.projetos.projetos import create_projetos_tables
from backend.routes.reunioes.agendas import create_reunioes_tables
from backend.routes.documentos.documentos import create_documentos_tables
from backend.routes.planos_acao.planos import create_planos_tables
from backend.routes.qualidade.rq03 import create_rq03_tables
from backend.routes.qualidade.rq03_configs import create_rq03_config_tables
from backend.routes.qualidade.rq49 import create_rq49_tables
from backend.routes.qualidade.rq80 import create_rq80_tables
from backend.routes.qualidade.sst import create_sst_tables
from backend.routes.qualidade.rq94 import create_rq94_tables
from backend.routes.qualidade.indicadores_qual import create_indicadores_qual_tables
from backend.routes.fabricacao.checklists import create_fabricacao_tables
from backend.routes.fabricacao.steps import create_step_tables
from backend.routes.fabricacao.cadastros import create_fab_cadastros_tables
from backend.routes.motores.fichas import create_motores_tables
from backend.routes.assistencia.atendimentos import create_assistencia_tables
from backend.routes.assistencia.laudos import create_laudos_tables
from backend.routes.chamados.chamados import create_chamados_tables
from backend.routes.laboratorio.testes import create_laboratorio_tables
from backend.services.gamificacao import create_gamificacao_tables
from backend.routes.comunicacao.eventos import create_comunicacao_tables
from backend.services.focco_service import create_focco_tables

def _resolve_chat_provider() -> str:
    provider = (os.getenv("CHAT_PROVIDER", "") or "").strip().lower()
    if provider:
        return provider

    n8n_webhook_url = (os.getenv("N8N_CHAT_WEBHOOK_URL", "") or "").strip()
    if n8n_webhook_url:
        return "n8n"

    return "local"


def _is_truthy_env(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_bounded_int_env(
    value: Optional[str],
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    try:
        parsed = int(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    if parsed < minimum or parsed > maximum:
        return default
    return parsed


def _resolve_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        logger.warning(
            "Timezone inválido para importação teste bancada (%s). Usando America/Sao_Paulo.",
            timezone_name,
        )
        return ZoneInfo("America/Sao_Paulo")


def _next_daily_run(hour: int, minute: int, tz: ZoneInfo) -> datetime:
    now = datetime.now(tz)
    next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return next_run


def _database_available() -> bool:
    conn = None
    try:
        conn = get_db_connection()
        return True
    except Exception as exc:
        logger.warning(
            "Banco indisponivel no startup; pulando inicializacao de tabelas: %s",
            exc,
        )
        return False
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _run_startup_step(label: str, fn) -> None:
    try:
        fn()
        logger.info("%s", label)
    except Exception as exc:
        logger.exception("Erro no bootstrap de %s: %s", label, exc)


def _bootstrap_module_tables() -> None:
    """Inicializa tabelas modulares do SIGS no startup da aplicação."""
    bootstrap_steps = [
        ("Tabelas de tarefas verificadas/criadas.", create_tarefas_tables),
        ("Tabelas de indicadores verificadas/criadas.", create_indicadores_tables),
        ("Tabelas de projetos verificadas/criadas.", create_projetos_tables),
        ("Tabelas de reuniões verificadas/criadas.", create_reunioes_tables),
        ("Tabelas de documentos verificadas/criadas.", create_documentos_tables),
        ("Tabelas de planos de ação verificadas/criadas.", create_planos_tables),
        ("Tabelas RQ03/SST verificadas/criadas.", create_rq03_tables),
        ("Tabelas RQ03 configurações verificadas/criadas.", create_rq03_config_tables),
        ("Tabelas RQ49 verificadas/criadas.", create_rq49_tables),
        ("Tabelas RQ80/RQ94 verificadas/criadas.", create_rq80_tables),
        ("Tabelas SST verificadas/criadas.", create_sst_tables),
        ("Tabelas RQ94 verificadas/criadas.", create_rq94_tables),
        ("Tabelas Indicadores/FMEA verificadas/criadas.", create_indicadores_qual_tables),
        ("Tabelas de fabricação verificadas/criadas.", create_fabricacao_tables),
        ("Tabelas de steps de fabricação verificadas/criadas.", create_step_tables),
        ("Tabelas cadastros fabricação verificadas/criadas.", create_fab_cadastros_tables),
        ("Tabelas de motores verificadas/criadas.", create_motores_tables),
        ("Tabelas de assistência verificadas/criadas.", create_assistencia_tables),
        ("Tabelas de laudos verificadas/criadas.", create_laudos_tables),
        ("Tabelas de chamados verificadas/criadas.", create_chamados_tables),
        ("Tabelas de laboratório verificadas/criadas.", create_laboratorio_tables),
        ("Tabela de gamificação verificada/criada.", create_gamificacao_tables),
        ("Tabelas de comunicação verificadas/criadas.", create_comunicacao_tables),
        ("Tabelas de cache Focco verificadas/criadas.", create_focco_tables),
    ]

    for label, fn in bootstrap_steps:
        _run_startup_step(label, fn)


def _register_background_task(
    tasks: list[tuple[str, asyncio.Task]],
    label: str,
    coroutine,
) -> asyncio.Task:
    task = asyncio.create_task(coroutine)
    tasks.append((label, task))
    return task


def _run_rag_warmup_safe() -> None:
    if not (LOCAL_AI_ENABLED and rag_warmup is not None):
        logger.info("Warmup RAG desativado (modo n8n ou stack de IA local ausente).")
        return

    try:
        rag_warmup()
    except Exception as exc:
        logger.warning("Warmup RAG falhou; a API segue em modo degradado: %s", exc)


CHAT_PROVIDER = _resolve_chat_provider()
LOCAL_AI_ENABLED = CHAT_PROVIDER != "n8n"

if LOCAL_AI_ENABLED:
    try:
        from backend.services.rag_pipeline import warmup as rag_warmup
        from backend.routes import documents_routes
    except Exception as exc:
        logger.warning(
            "CHAT_PROVIDER=local, mas stack de IA local indisponivel: %s. "
            "Subindo API sem warmup RAG e sem rota de documentos.",
            exc,
        )
        LOCAL_AI_ENABLED = False
        rag_warmup = None
        documents_routes = None
else:
    rag_warmup = None
    documents_routes = None


# ==========================================================
# Lifespan — inicialização e encerramento
# ==========================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando Higra Sigs API...")
    background_tasks: list[tuple[str, asyncio.Task]] = []

    if _database_available():
        try:
            bootstrap_auth_schema()
            logger.info("Bootstrap de auth concluido com sucesso")
        except Exception as e:
            logger.exception(f"Erro no bootstrap de auth: {e}")

        try:
            criar_tabela_historico_conversas()
            criar_tabela_historico_chat()
            criar_tabela_memoria_tecnica()
            logger.info("Tabelas de chat verificadas/criadas com sucesso")
        except Exception as e:
            logger.exception(f"Erro ao criar tabelas de chat: {e}")

        try:
            criar_tabelas_social()
            logger.info("Tabelas do social verificadas/criadas com sucesso")
        except Exception as e:
            logger.exception(f"Erro ao criar tabelas do social: {e}")

        _bootstrap_module_tables()

    else:
        logger.warning("Inicializacao de tabelas ignorada porque o banco nao respondeu no startup.")

    try:
        blocking_rag_warmup = _is_truthy_env(
            os.getenv("RAG_WARMUP_BLOCKING"),
            default=False,
        )
        if blocking_rag_warmup:
            logger.info("Warmup RAG configurado como bloqueante no startup.")
            _run_rag_warmup_safe()
        else:
            threading.Thread(
                target=_run_rag_warmup_safe,
                name="rag-warmup",
                daemon=True,
            ).start()
            logger.info("Warmup RAG agendado em background.")
    except Exception as e:
        logger.exception(f"Erro no warmup: {e}")

    logger.info("Inicialização concluída")

    try:

        # Iniciar scheduler do Arquimedes (2 posts/dia, 1 artigo/dia)
        arquimedes_enabled = os.getenv("ARQUIMEDES_ENABLED", "true").lower() == "true"
        if arquimedes_enabled:
            async def _arquimedes_loop():
                from backend.services.arquimedes_service import gerar_post_arquimedes, curtir_posts_arquimedes, responder_comentarios_pendentes
                from backend.routes.arquimedes import arquimedes_config
                import time
                now = time.time()
                # Iniciar com timestamps atuais para não disparar tudo de uma vez no startup
                last_post = now
                last_article = now
                last_like = now
                last_reply = now
                await asyncio.sleep(60)  # esperar 1min antes do primeiro ciclo
                while True:
                    try:
                        now = time.time()
                        if now - last_post >= arquimedes_config["post_interval"]:
                            await gerar_post_arquimedes(force_article=False)
                            last_post = now
                        if now - last_article >= arquimedes_config["article_interval"]:
                            await gerar_post_arquimedes(force_article=True)
                            last_article = now
                        if now - last_like >= arquimedes_config["like_interval"]:
                            await curtir_posts_arquimedes()
                            last_like = now
                        if now - last_reply >= arquimedes_config["reply_interval"]:
                            await responder_comentarios_pendentes()
                            last_reply = now
                    except Exception as e:
                        logger.warning(f"[ARQUIMEDES] Erro no ciclo: {e}")
                    await asyncio.sleep(300)  # checar a cada 5min

            _register_background_task(background_tasks, "arquimedes-scheduler", _arquimedes_loop())
            logger.info("[ARQUIMEDES] Scheduler iniciado (post=12h, artigo=24h, like=4h, reply=30min)")

        # Scheduler de limpeza de notificações antigas
        async def _notif_cleanup_loop():
            from backend.services.social_service import limpar_notificacoes_antigas
            cleanup_interval = 21600  # 6h
            await asyncio.sleep(300)  # esperar 5min após startup
            while True:
                try:
                    limpar_notificacoes_antigas()
                except Exception as e:
                    logger.warning(f"[NOTIF-CLEANUP] Erro: {e}")
                await asyncio.sleep(cleanup_interval)

        _register_background_task(background_tasks, "notif-cleanup-scheduler", _notif_cleanup_loop())
        logger.info("[NOTIF-CLEANUP] Scheduler iniciado (cleanup=6h)")

        # Scheduler de sync Focco ERP (diário)
        focco_sync_enabled = _is_truthy_env(
            os.getenv("FOCCO_SYNC_ENABLED"),
            default=bool((os.getenv("FOCCO_DB_HOST", "") or "").strip()),
        )
        if focco_sync_enabled:
            async def _focco_sync_loop():
                from backend.services.focco_service import sync_pvs_to_cache

                timezone_name = (
                    os.getenv("FOCCO_SYNC_TIMEZONE", "America/Sao_Paulo")
                    or "America/Sao_Paulo"
                ).strip()
                schedule_tz = _resolve_timezone(timezone_name)
                schedule_hour = _parse_bounded_int_env(
                    os.getenv("FOCCO_SYNC_HOUR"), 3, minimum=0, maximum=23,
                )
                schedule_minute = _parse_bounded_int_env(
                    os.getenv("FOCCO_SYNC_MINUTE"), 0, minimum=0, maximum=59,
                )

                await asyncio.sleep(60)

                while True:
                    next_run = _next_daily_run(schedule_hour, schedule_minute, schedule_tz)
                    wait_seconds = max(1, int((next_run - datetime.now(schedule_tz)).total_seconds()))
                    logger.info("[FOCCO-SYNC] Próxima execução: %s", next_run.isoformat())
                    await asyncio.sleep(wait_seconds)

                    try:
                        result = await asyncio.to_thread(sync_pvs_to_cache)
                        logger.info("[FOCCO-SYNC] Concluído: %s", result)
                    except Exception as exc:
                        logger.exception("[FOCCO-SYNC] Erro: %s", exc)

            _register_background_task(background_tasks, "focco-sync-scheduler", _focco_sync_loop())
            logger.info("[FOCCO-SYNC] Scheduler iniciado (diário às 03:00 por padrão).")

        importacao_teste_bancada_enabled = _is_truthy_env(
            os.getenv("IMPORTACAO_TESTE_BANCADA_ENABLED"),
            default=bool((os.getenv("SOURCE_URL", "") or "").strip()),
        )
        if importacao_teste_bancada_enabled:
            async def _importacao_teste_bancada_loop():
                from backend.schedule.importacao_teste_bancada import handler as run_importacao_teste_bancada

                timezone_name = (
                    os.getenv("IMPORTACAO_TESTE_BANCADA_TIMEZONE", "America/Sao_Paulo")
                    or "America/Sao_Paulo"
                ).strip()
                schedule_tz = _resolve_timezone(timezone_name)
                schedule_hour = _parse_bounded_int_env(
                    os.getenv("IMPORTACAO_TESTE_BANCADA_HOUR"),
                    2,
                    minimum=0,
                    maximum=23,
                )
                schedule_minute = _parse_bounded_int_env(
                    os.getenv("IMPORTACAO_TESTE_BANCADA_MINUTE"),
                    0,
                    minimum=0,
                    maximum=59,
                )

                await asyncio.sleep(30)

                while True:
                    next_run = _next_daily_run(
                        schedule_hour,
                        schedule_minute,
                        schedule_tz,
                    )
                    wait_seconds = max(
                        1,
                        int((next_run - datetime.now(schedule_tz)).total_seconds()),
                    )
                    logger.info(
                        "[IMPORTACAO-TESTE-BANCADA] Próxima execução agendada para %s.",
                        next_run.isoformat(),
                    )
                    await asyncio.sleep(wait_seconds)

                    try:
                        result = await asyncio.to_thread(run_importacao_teste_bancada)
                        status_code = int(result.get("statusCode", 500))
                        raw_body = result.get("body")
                        parsed_body = json.loads(raw_body) if isinstance(raw_body, str) else {}
                        if status_code >= 400:
                            logger.warning(
                                "[IMPORTACAO-TESTE-BANCADA] Execução finalizou com erro: status=%s body=%s",
                                status_code,
                                parsed_body or raw_body,
                            )
                        else:
                            logger.info(
                                "[IMPORTACAO-TESTE-BANCADA] Execução concluída: status=%s resumo=%s",
                                status_code,
                                parsed_body,
                            )
                    except Exception as exc:
                        logger.exception(
                            "[IMPORTACAO-TESTE-BANCADA] Erro no scheduler: %s",
                            exc,
                        )

            _register_background_task(
                background_tasks,
                "importacao-teste-bancada-scheduler",
                _importacao_teste_bancada_loop(),
            )
            logger.info(
                "[IMPORTACAO-TESTE-BANCADA] Scheduler iniciado (diário às 02:00 por padrão).",
            )

    except Exception as e:
        logger.error(f"Falha ao carregar recursos na inicialização: {e}")

    try:
        yield
    finally:
        for label, task in reversed(background_tasks):
            if task.done():
                continue
            logger.info("Encerrando tarefa de background: %s", label)
            task.cancel()

        for label, task in reversed(background_tasks):
            if task.done():
                continue
            try:
                await task
            except asyncio.CancelledError:
                logger.info("Tarefa de background encerrada: %s", label)
            except Exception as exc:
                logger.warning("Erro ao encerrar tarefa %s: %s", label, exc)


# ==========================================================
# FastAPI App
# ==========================================================
app = FastAPI(
    title="HIGRA Sigs API",
    description="API oficial do HIGRA Expert — Assistente Técnico Inteligente",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ==========================================================
# Rotas REST + WebSocket
# ==========================================================
app.include_router(historico.router)
app.include_router(chat_ws.router)
if documents_routes is not None:
    app.include_router(documents_routes.router)
app.include_router(social.router)
app.include_router(social_ws.router)
app.include_router(arquimedes.router)
app.include_router(auth_router, prefix="", tags=["Autenticação e Usuários"])

# --- SIGS Módulos (FASE 1) ---
from backend.routes.cadastros import empresas as cad_empresas, filiais as cad_filiais, processos as cad_processos, usuarios_sigs as cad_usuarios
from backend.routes.tarefas import tarefas as mod_tarefas
from backend.routes.home import home as mod_home

app.include_router(cad_empresas.router,   prefix="/api/cadastros/empresas",   tags=["Cadastros - Empresas"])
app.include_router(cad_filiais.router,    prefix="/api/cadastros/filiais",    tags=["Cadastros - Filiais"])
app.include_router(cad_processos.router,  prefix="/api/cadastros/processos",  tags=["Cadastros - Processos"])
app.include_router(cad_usuarios.router,   prefix="/api/cadastros/usuarios",   tags=["Cadastros - Usuários SIGS"])
app.include_router(mod_tarefas.router,    prefix="/api/tarefas",              tags=["Tarefas"])
app.include_router(mod_home.router,       prefix="/api/home",                 tags=["Home / Dashboard"])

# --- Utils API (PL/SQL functions) ---
from backend.routes.cadastros import utils_api as mod_utils
app.include_router(mod_utils.router, prefix="/api/utils", tags=["Utils - Functions"])

# --- LOVs (Cascading) ---
from backend.routes.cadastros import lovs as mod_lovs
app.include_router(mod_lovs.router, prefix="/api/lov", tags=["LOVs - Dropdowns"])

from backend.routes.cadastros import export_csv as mod_export
app.include_router(mod_export.router, prefix="/api/export", tags=["Export CSV"])

# --- Gamificação / Ranking ---
from backend.routes.indicadores import ranking as mod_ranking
app.include_router(mod_ranking.router, prefix="/api/gamificacao", tags=["Gamificação / Ranking"])

# --- Comunicação / Eventos ---
from backend.routes.comunicacao import eventos as mod_comunicacao
app.include_router(mod_comunicacao.router, prefix="/api/comunicacao", tags=["Comunicação / Eventos"])

# --- Biblioteca ---
from backend.routes.documentos import biblioteca as mod_biblioteca
app.include_router(mod_biblioteca.router, prefix="/api/biblioteca", tags=["Biblioteca"])

# --- SIGS Módulos (FASE 2) ---
from backend.routes.indicadores import metas as mod_indicadores
from backend.routes.projetos import projetos as mod_projetos
from backend.routes.reunioes import agendas as mod_reunioes
from backend.routes.documentos import documentos as mod_documentos
from backend.routes.planos_acao import planos as mod_planos

app.include_router(mod_indicadores.router, prefix="/api/indicadores/metas",  tags=["Indicadores - Metas"])
app.include_router(mod_projetos.router,    prefix="/api/projetos",           tags=["Projetos"])

from backend.routes.projetos import focco as mod_focco
app.include_router(mod_focco.router,       prefix="/api/projetos/focco",     tags=["Projetos - Focco ERP"])
app.include_router(mod_reunioes.router,    prefix="/api/reunioes/agendas",   tags=["Reuniões"])
app.include_router(mod_documentos.router,  prefix="/api/documentos",         tags=["Documentos"])
app.include_router(mod_planos.router,      prefix="/api/planos-acao",        tags=["Planos de Ação"])

from backend.routes.planos_acao import plano_features as mod_plano_feat
app.include_router(mod_plano_feat.router,  prefix="/api/planos-acao",        tags=["Planos de Ação - Features"])

# --- SIGS Módulos (FASE 3 — Qualidade) ---
from backend.routes.qualidade import rq03 as mod_rq03, rq49 as mod_rq49, rq80 as mod_rq80
from backend.routes.qualidade import rq03_configs as mod_rq03_cfg
from backend.routes.qualidade import sst as mod_sst
from backend.routes.qualidade import indicadores_qual as mod_ind_qual
from backend.routes.qualidade import rq94 as mod_rq94
app.include_router(mod_rq03.router,     prefix="/api/qualidade/rq03",         tags=["Qualidade - RQ03"])
app.include_router(mod_rq03_cfg.router, prefix="/api/qualidade/rq03-config",  tags=["Qualidade - RQ03 Configs"])
app.include_router(mod_rq49.router,     prefix="/api/qualidade/rq49",         tags=["Qualidade - RQ49"])
app.include_router(mod_rq80.router,     prefix="/api/qualidade",              tags=["Qualidade - RQ80/RQ94"])
app.include_router(mod_sst.router,      prefix="/api/qualidade/sst",           tags=["Qualidade - SST"])
app.include_router(mod_ind_qual.router, prefix="/api/qualidade",               tags=["Qualidade - Indicadores/FMEA"])
app.include_router(mod_rq94.router,     prefix="/api/qualidade",               tags=["Qualidade - RQ94"])

# --- SIGS Módulos (FASE 4 — Industrial) ---
from backend.routes.fabricacao import checklists as mod_fabricacao
from backend.routes.motores import fichas as mod_motores
from backend.routes.assistencia import atendimentos as mod_assistencia
from backend.routes.chamados import chamados as mod_chamados

app.include_router(mod_fabricacao.router,   prefix="/api/fabricacao",                tags=["Fabricação"])

from backend.routes.fabricacao import steps as mod_fab_steps
from backend.routes.fabricacao import cadastros as mod_fab_cadastros
app.include_router(mod_fab_steps.router,      prefix="/api/fabricacao",                tags=["Fabricação - Steps"])
app.include_router(mod_fab_cadastros.router,  prefix="/api/fabricacao/cadastros",      tags=["Fabricação - Cadastros"])
app.include_router(mod_motores.router,      prefix="/api/motores",                   tags=["Motores"])
app.include_router(mod_assistencia.router,  prefix="/api/assistencia/atendimentos",   tags=["Assistência"])
app.include_router(mod_chamados.router,     prefix="/api/chamados",                  tags=["Chamados"])

from backend.routes.assistencia import configs as mod_ass_configs
app.include_router(mod_ass_configs.router,  prefix="/api/assistencia",               tags=["Assistência - Config"])

from backend.routes.assistencia import laudos as mod_laudos
app.include_router(mod_laudos.router,       prefix="/api/laudos",                    tags=["Service / Laudos"])

from backend.routes.cadastros import permissoes as mod_permissoes
app.include_router(mod_permissoes.router,   prefix="/api/admin/permissoes",           tags=["Admin - Permissões"])

# --- SIGS Módulos (FASE 5 — Laboratório) ---
from backend.routes.laboratorio import testes as mod_laboratorio
app.include_router(mod_laboratorio.router, prefix="/api/laboratorio", tags=["Laboratório"])

app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")), name="static")

# ==========================================================
# Endpoints utilitários globais (616-645)
# ==========================================================
from fastapi import Request
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor

@app.get("/health", tags=["Sistema"])
async def health_check():
    """630 — Health check detalhado."""
    db_ok = False
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        db_ok = True
    except Exception:
        pass
    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "error",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
    }


from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from fastapi import Depends, Query


@app.get("/api/usuarios/buscar", tags=["Usuários"])
async def buscar_usuarios(q: str = Query("", min_length=1), limit: int = Query(10, le=50),
                           usuario_id: int = Depends(require_user)):
    """643 — Autocomplete de usuários por nome/username."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT id, name, username, email FROM public.users
            WHERE (name ILIKE %s OR username ILIKE %s OR email ILIKE %s) AND ativo='S'
            ORDER BY name LIMIT %s""",
            (f"%{q}%", f"%{q}%", f"%{q}%", limit))
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@app.get("/api/busca-global", tags=["Busca"])
async def busca_global(q: str = Query("", min_length=2), limit: int = Query(5, le=20),
                        usuario_id: int = Depends(require_user)):
    """623 — Busca full-text em múltiplas tabelas."""
    if not q.strip():
        return {"resultados": []}
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    resultados = []
    like = f"%{q}%"
    searches = [
        ("Tarefa", "SELECT id, descricao as titulo FROM public.hgr_tar_cad_tarefa WHERE descricao ILIKE %s AND ativo='S' LIMIT %s", "/tarefas"),
        ("Projeto", "SELECT id, descricao as titulo FROM public.hgr_prj_cad_projeto WHERE descricao ILIKE %s AND ativo='S' LIMIT %s", "/projetos"),
        ("Meta", "SELECT id, descricao as titulo FROM public.hgr_ges_cad_meta WHERE descricao ILIKE %s AND ativo='S' LIMIT %s", "/indicadores"),
        ("Reuniao", "SELECT id, descricao as titulo FROM public.sth_reu_agenda WHERE descricao ILIKE %s LIMIT %s", "/reunioes"),
    ]
    try:
        for tipo, sql, base_url in searches:
            try:
                cur.execute(sql, (like, limit))
                for row in cur.fetchall():
                    resultados.append({"tipo": tipo, "id": row["id"], "titulo": row["titulo"], "url": f"{base_url}/{row['id']}"})
            except Exception:
                conn.rollback()
    finally:
        cur.close()
        conn.close()
    resultados = resultados[:limit * 2]
    return {"resultados": resultados, "total": len(resultados), "q": q}


from backend.routes.cadastros import usuarios_sigs as mod_usuarios_sigs
app.include_router(mod_usuarios_sigs.router, prefix="/api/cadastros/usuarios", tags=["Cadastros - Usuários"])

# ==========================================================
# Execução local
# ==========================================================
if __name__ == "__main__":
    logger.info("Iniciando servidor FastAPI (modo dev)...")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
