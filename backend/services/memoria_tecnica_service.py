# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Memoria tecnica do chat - resumo governado.
Armazena apenas fatos tecnicos relevantes para continuidade.
"""

import re

from backend.core.config import logger
from backend.database import get_db_connection
from backend.services.historico_chat_service import obter_historico_chat


def criar_tabela_memoria_tecnica():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS memoria_tecnica (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversa_id INTEGER NOT NULL REFERENCES historico_conversas(id) ON DELETE CASCADE,
            dominio VARCHAR(64) NOT NULL DEFAULT 'geral',
            resumo TEXT NOT NULL DEFAULT '',
            atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (usuario_id, conversa_id, dominio)
        );
    """
    )
    cur.execute(
        """
        ALTER TABLE memoria_tecnica
        ADD COLUMN IF NOT EXISTS dominio VARCHAR(64) NOT NULL DEFAULT 'geral';
    """
    )
    cur.execute(
        """
        ALTER TABLE memoria_tecnica
        DROP CONSTRAINT IF EXISTS memoria_tecnica_usuario_id_conversa_id_key;
    """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_memoria_tecnica_unica
        ON memoria_tecnica(usuario_id, conversa_id, dominio);
    """
    )
    conn.commit()
    cur.close()
    conn.close()
    logger.info("Tabela memoria_tecnica verificada/criada com sucesso")


def obter_memoria_tecnica(usuario_id: int, conversa_id: int, dominio: str | None = None) -> str:
    if not conversa_id:
        return ""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if dominio:
            cur.execute(
                """
                SELECT resumo
                FROM memoria_tecnica
                WHERE usuario_id = %s AND conversa_id = %s AND dominio = %s;
            """,
                (usuario_id, conversa_id, dominio),
            )
        else:
            cur.execute(
                """
                SELECT resumo
                FROM memoria_tecnica
                WHERE usuario_id = %s AND conversa_id = %s;
            """,
                (usuario_id, conversa_id),
            )
        row = cur.fetchone()
        return row[0] if row else ""
    finally:
        cur.close()
        conn.close()


def _extrair_fatos(texto: str) -> list[str]:
    if not texto:
        return []
    texto = texto.strip()
    if not texto:
        return []

    sentencas = [s.strip() for s in re.split(r"[.\n;]+", texto) if s.strip()]
    palavras_chave = [
        "bomba",
        "turbina",
        "vazao",
        "altura",
        "pressao",
        "diametro",
        "perda de carga",
        "npsh",
        "cavitacao",
        "rendimento",
        "potencia",
        "rotacao",
        "rpm",
        "mca",
        "m3/h",
        "bar",
        "kpa",
        "mm",
        "hipotese",
        "assumido",
        "assumimos",
        "decisao",
        "conclusao",
        "suc",
        "descarga",
        "curva",
        "catalogo",
    ]
    ruido = [
        "oi",
        "ola",
        "bom dia",
        "boa tarde",
        "boa noite",
        "obrigado",
        "valeu",
        "beleza",
        "ok",
    ]

    fatos = []
    for sentenca in sentencas:
        sentenca_norm = sentenca.lower()
        if any(r in sentenca_norm for r in ruido):
            continue
        if len(sentenca_norm) < 12:
            continue
        if any(k in sentenca_norm for k in palavras_chave) or re.search(r"\d", sentenca_norm):
            fatos.append(sentenca)
    return fatos


def gerar_resumo_tecnico(
    historico: list[dict],
    memoria_anterior: str = "",
    max_linhas: int = 10,
    linha_inicial: str | None = None,
) -> str:
    linhas = []
    if linha_inicial:
        linha = linha_inicial.strip()
        if linha:
            linhas.append(linha)
    if memoria_anterior:
        for linha in [l.strip() for l in memoria_anterior.split("\n") if l.strip()]:
            if linha not in linhas:
                linhas.append(linha)

    for item in historico[-8:]:
        conteudo = item.get("content") or ""
        fatos = _extrair_fatos(conteudo)
        for fato in fatos:
            if fato not in linhas:
                linhas.append(fato)

    linhas = linhas[:max_linhas]
    return "\n".join(linhas)


def atualizar_memoria_tecnica(
    usuario_id: int,
    conversa_id: int,
    dominio: str | None = None,
    linha_inicial: str | None = None,
):
    if not conversa_id:
        return
    try:
        historico = obter_historico_chat(usuario_id, conversa_id)
        memoria_atual = obter_memoria_tecnica(usuario_id, conversa_id, dominio)
        resumo = gerar_resumo_tecnico(historico, memoria_atual, linha_inicial=linha_inicial)
    except Exception as e:
        logger.error(f"Falha ao gerar memoria tecnica: {e}")
        return

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if dominio:
            cur.execute(
                """
                INSERT INTO memoria_tecnica (usuario_id, conversa_id, dominio, resumo)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (usuario_id, conversa_id, dominio)
                DO UPDATE SET resumo = EXCLUDED.resumo, atualizado_em = CURRENT_TIMESTAMP;
            """,
                (usuario_id, conversa_id, dominio, resumo),
            )
        else:
            cur.execute(
                """
                INSERT INTO memoria_tecnica (usuario_id, conversa_id, resumo)
                VALUES (%s, %s, %s)
                ON CONFLICT (usuario_id, conversa_id)
                DO UPDATE SET resumo = EXCLUDED.resumo, atualizado_em = CURRENT_TIMESTAMP;
            """,
                (usuario_id, conversa_id, resumo),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        # Compatibilidade com constraint antiga (usuario_id, conversa_id)
        if "memoria_tecnica_usuario_id_conversa_id_key" in str(e):
            cur.execute(
                """
                UPDATE memoria_tecnica
                SET resumo = %s, dominio = %s, atualizado_em = CURRENT_TIMESTAMP
                WHERE usuario_id = %s AND conversa_id = %s;
            """,
                (resumo, dominio or "geral", usuario_id, conversa_id),
            )
            conn.commit()
        else:
            raise
    finally:
        cur.close()
        conn.close()


def mensagem_inicial_por_dominio(dominio: str | None) -> str:
    dominio_normalizado = (dominio or "dominio_neutro").strip()
    mensagens = {
        "selecao_equipamento": (
            "Escopo: seleção de equipamento. Assumo escoamento permanente, fluido incompressível e temperatura constante. "
            "Informe vazão desejada, altura manométrica total, fluido e restrições (pressão, diâmetro, energia)."
        ),
        "hidraulica_perda_carga": (
            "Escopo: perda de carga em tubulações. Assumo escoamento permanente, monofásico e fluido incompressível. "
            "Informe vazão, diâmetros, comprimentos, rugosidade e lista de acessórios/válvulas."
        ),
        "hidraulica_npsh": (
            "Escopo: NPSH. Assumo escoamento permanente, líquido incompressível e temperatura constante. "
            "Informe vazão, altura geométrica de sucção, perdas na sucção, pressão atmosférica local e fluido."
        ),
        "dominio_neutro": (
            "Escopo técnico geral. Assumo escoamento permanente e fluido incompressível, salvo indicação contrária. "
            "Descreva o objetivo, dados disponíveis e restrições."
        ),
    }
    return mensagens.get(dominio_normalizado, mensagens["dominio_neutro"])

