# -*- coding: utf-8 -*-
"""
Servico do Arquimedes — IA que posta conteudo, curte posts e interage no Nexus.
"""

import random
from datetime import datetime, timedelta
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.core.config import logger
from backend.core.claude_client import gerar_resposta_claude
from backend.services.rag_pipeline import buscar_contexto_relevante

ARQUIMEDES_USERNAME = "arquimedes"

# Temas sobre equipamentos HIGRA — RAG obrigatorio (nao posta sem contexto do manual)
TEMAS_EQUIPAMENTOS_HIGRA = [
    "bombas centrifugas HIGRA — modelos e aplicacoes",
    "bombas submersas HIGRA para pocos artesianos",
    "aeradores HIGRA para tratamento de efluentes",
    "turbogeradores HIGRA — geracao de energia hidraulica",
    "misturadores HIGRA para processos industriais",
    "dimensionamento de bombas centrifugas HIGRA",
    "NPSH disponivel vs requerido em bombas HIGRA",
    "cavitacao em bombas HIGRA — causas e solucoes",
    "curva do sistema vs curva da bomba HIGRA",
    "eficiencia energetica em bombas HIGRA",
    "selecao de bombas HIGRA para sistemas de recalque",
    "manutencao preditiva em equipamentos HIGRA",
]

# Temas gerais de engenharia hidraulica — RAG opcional
TEMAS_GERAIS = [
    "perda de carga em tubulacoes industriais",
    "sistemas de recalque e adutoras",
    "saneamento basico e tratamento de agua",
    "hidraulica de canais abertos",
    "golpe de ariete — prevencao e amortecimento",
    "valvulas de retencao e controle de vazao",
    "instrumentacao e automacao de estacoes de bombeamento",
    "normas tecnicas NBR para instalacoes hidraulicas",
    "materiais para tubulacoes — aco, PVC, PEAD, ferro fundido",
    "tratamento de efluentes industriais",
    "reuso de agua em processos industriais",
    "selecao de materiais resistentes a corrosao",
    "vibracao em bombas — diagnostico e balanceamento",
]

# Todos os temas combinados (peso maior para equipamentos HIGRA)
TEMAS = TEMAS_EQUIPAMENTOS_HIGRA + TEMAS_GERAIS

SYSTEM_PROMPT = """Voce e Arquimedes, especialista em engenharia hidraulica, bombas,
saneamento e engenharia mecanica. Voce trabalha na HIGRA e posta no Nexus, uma rede
social tecnica para engenheiros. Suas postagens devem ser:

- Informativas e tecnicamente precisas
- Escritas em portugues brasileiro informal mas tecnico
- Curtas (maximo 270 caracteres para posts normais)
- Engajantes — faça perguntas ao final quando apropriado
- Sem emojis excessivos (maximo 1 por post)
- Sem hashtags

Quando o tema envolver bombas, aeradores, turbogeradores, misturadores ou submersas,
SEMPRE referencie os equipamentos HIGRA com dados reais do manual (modelos, vazoes,
alturas, rendimentos). Nunca invente especificacoes.

Voce NAO e um chatbot. Voce posta como um especialista compartilhando conhecimento.
Nunca mencione que e uma IA. Fale como um engenheiro experiente."""

SYSTEM_PROMPT_ARTIGO = """Voce e Arquimedes, especialista em engenharia hidraulica, bombas,
saneamento e engenharia mecanica. Voce trabalha na HIGRA e escreve artigos tecnicos curtos
(600-1500 caracteres) para o Nexus, uma rede social tecnica. O artigo deve:

- Ter um titulo claro e objetivo
- Ser informativo e tecnicamente preciso
- Escrito em portugues brasileiro
- Incluir dados praticos ou exemplos reais quando possivel
- Sem emojis
- Sem hashtags

Quando o tema envolver bombas, aeradores, turbogeradores, misturadores ou submersas,
SEMPRE referencie os equipamentos HIGRA com dados reais do manual (modelos, vazoes,
alturas, rendimentos). Nunca invente especificacoes.

Formato da resposta:
TITULO: [titulo do artigo]
CONTEUDO: [conteudo do artigo]"""


def _get_arquimedes_id():
    """Retorna o ID do usuario Arquimedes."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id FROM users WHERE username = %s AND is_ai = TRUE",
            (ARQUIMEDES_USERNAME,)
        )
        row = cur.fetchone()
        return row["id"] if row else None
    finally:
        cur.close()
        conn.close()


def limpar_posts_arquimedes(antes_de: str):
    """Exclui posts e artigos do Arquimedes anteriores a uma data (YYYY-MM-DD)."""
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        return {"error": "Arquimedes nao encontrado", "deleted": 0}
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Excluir comentarios nos posts que serao deletados
        cur.execute("""
            DELETE FROM social_post_comments
            WHERE post_id IN (
                SELECT id FROM social_posts
                WHERE user_id = %s AND created_at < %s
            )
        """, (arquimedes_id, antes_de))
        comments_deleted = cur.rowcount

        # Excluir likes nos posts
        cur.execute("""
            DELETE FROM social_post_likes
            WHERE post_id IN (
                SELECT id FROM social_posts
                WHERE user_id = %s AND created_at < %s
            )
        """, (arquimedes_id, antes_de))

        # Excluir bookmarks nos posts
        cur.execute("""
            DELETE FROM social_bookmarks
            WHERE post_id IN (
                SELECT id FROM social_posts
                WHERE user_id = %s AND created_at < %s
            )
        """, (arquimedes_id, antes_de))

        # Excluir reposts
        cur.execute("""
            DELETE FROM social_reposts
            WHERE post_id IN (
                SELECT id FROM social_posts
                WHERE user_id = %s AND created_at < %s
            )
        """, (arquimedes_id, antes_de))

        # Excluir os posts/artigos
        cur.execute("""
            DELETE FROM social_posts
            WHERE user_id = %s AND created_at < %s
            RETURNING id, is_article
        """, (arquimedes_id, antes_de))
        deleted = cur.fetchall()
        posts_count = sum(1 for d in deleted if not d.get("is_article"))
        articles_count = sum(1 for d in deleted if d.get("is_article"))

        conn.commit()
        logger.info(f"Limpeza Arquimedes: {posts_count} posts + {articles_count} artigos excluidos (antes de {antes_de})")
        return {
            "deleted_posts": posts_count,
            "deleted_articles": articles_count,
            "deleted_comments": comments_deleted,
        }
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao limpar posts do Arquimedes: {e}")
        return {"error": str(e), "deleted": 0}
    finally:
        cur.close()
        conn.close()


def _temas_recentes(arquimedes_id: int, dias: int = 3):
    """Retorna conteudos postados recentemente para evitar repeticao."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        since = datetime.utcnow() - timedelta(days=dias)
        cur.execute("""
            SELECT content FROM social_posts
            WHERE user_id = %s AND created_at > %s
            ORDER BY created_at DESC LIMIT 10
        """, (arquimedes_id, since))
        return [r["content"][:100] for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


async def gerar_post_arquimedes(force_article: bool = False):
    """Gera um post ou artigo usando Claude e publica no feed."""
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        logger.warning("[ARQUIMEDES] Perfil nao encontrado no banco")
        return None

    tema = random.choice(TEMAS)
    is_tema_higra = tema in TEMAS_EQUIPAMENTOS_HIGRA
    recentes = _temas_recentes(arquimedes_id)
    recentes_str = "\n".join(recentes) if recentes else "Nenhum post recente."

    # Buscar contexto tecnico via RAG para embasar o post
    rag_context = ""
    try:
        rag_context = buscar_contexto_relevante(tema, k=5 if is_tema_higra else 3, min_score=0.2 if is_tema_higra else 0.25)
    except Exception as e:
        logger.warning(f"[ARQUIMEDES] RAG falhou para post: {e}")

    # Temas de equipamentos HIGRA EXIGEM contexto do manual — nao posta sem RAG
    if is_tema_higra and not rag_context:
        logger.warning(f"[ARQUIMEDES] Tema de equipamento HIGRA sem contexto RAG, abortando: {tema}")
        return None

    rag_section = ""
    if rag_context:
        rag_instruction = (
            "Dados tecnicos dos manuais HIGRA (OBRIGATORIO usar como base factual — cite modelos, especificacoes e dados reais dos equipamentos HIGRA):"
            if is_tema_higra else
            "Dados tecnicos dos manuais HIGRA (use como base factual):"
        )
        rag_section = f"\n\n{rag_instruction}\n{rag_context[:2000]}\n"

    is_article = force_article

    if is_article:
        prompt = f"""Escreva um artigo tecnico sobre: {tema}

Posts recentes (evite repetir):
{recentes_str}{rag_section}

Lembre-se do formato:
TITULO: [titulo]
CONTEUDO: [conteudo]"""
        resposta = gerar_resposta_claude(SYSTEM_PROMPT_ARTIGO, prompt, temperature=0.7)
    else:
        prompt = f"""Escreva um post curto (maximo 270 caracteres) sobre: {tema}

Posts recentes (evite repetir):
{recentes_str}{rag_section}

Responda APENAS com o texto do post, sem prefixo."""
        resposta = gerar_resposta_claude(SYSTEM_PROMPT, prompt, temperature=0.8)

    if not resposta or resposta.startswith("O servico de IA"):
        logger.warning("[ARQUIMEDES] Falha ao gerar conteudo via Claude")
        return None

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if is_article and "TITULO:" in resposta and "CONTEUDO:" in resposta:
            parts = resposta.split("CONTEUDO:", 1)
            title = parts[0].replace("TITULO:", "").strip()
            content = parts[1].strip()
            cur.execute("""
                INSERT INTO social_posts (user_id, title, content, is_article, created_at)
                VALUES (%s, %s, %s, TRUE, CURRENT_TIMESTAMP)
                RETURNING id
            """, (arquimedes_id, title[:200], content[:5000]))
        else:
            content = resposta.strip()
            if content.startswith('"') and content.endswith('"'):
                content = content[1:-1]
            cur.execute("""
                INSERT INTO social_posts (user_id, content, created_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                RETURNING id
            """, (arquimedes_id, content[:280]))

        post = cur.fetchone()
        conn.commit()
        logger.info(f"[ARQUIMEDES] Post publicado (id={post['id']}, artigo={is_article})")
        return post["id"]
    except Exception as e:
        conn.rollback()
        logger.error(f"[ARQUIMEDES] Erro ao publicar post: {e}")
        return None
    finally:
        cur.close()
        conn.close()


async def curtir_posts_arquimedes(max_likes: int = 5):
    """Arquimedes curte posts relevantes de outros usuarios."""
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        return 0

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar posts recentes que ainda nao foram curtidos pelo Arquimedes
        cur.execute("""
            SELECT p.id, p.content, p.title
            FROM social_posts p
            WHERE p.user_id != %s
              AND p.created_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
              AND NOT EXISTS (
                  SELECT 1 FROM social_post_likes l
                  WHERE l.post_id = p.id AND l.user_id = %s
              )
            ORDER BY RANDOM()
            LIMIT %s
        """, (arquimedes_id, arquimedes_id, max_likes * 2))
        candidates = cur.fetchall()

        liked = 0
        for post in candidates:
            if liked >= max_likes:
                break
            # Curtir posts que parecem relevantes (palavras-chave do setor)
            text = (post.get("title") or "") + " " + (post.get("content") or "")
            text_lower = text.lower()
            relevant = any(kw in text_lower for kw in [
                "bomba", "hidra", "vazao", "pressao", "tubu", "agua",
                "sanea", "npsh", "cavi", "valvu", "motor", "eficien",
                "energ", "perda", "carga", "recalq", "reser", "poco",
                "tratam", "eflu", "industrial", "engenharia", "calculo",
                "projeto", "dimensio", "norma", "nbr", "manut",
            ])
            # Curtir todos se nao houver keywords (engajamento geral)
            if relevant or random.random() < 0.4:
                cur.execute(
                    "INSERT INTO social_post_likes (user_id, post_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (arquimedes_id, post["id"])
                )
                liked += 1

        conn.commit()
        logger.info(f"[ARQUIMEDES] Curtiu {liked} posts")
        return liked
    except Exception as e:
        conn.rollback()
        logger.error(f"[ARQUIMEDES] Erro ao curtir posts: {e}")
        return 0
    finally:
        cur.close()
        conn.close()


SYSTEM_PROMPT_REPLY = """Voce e Arquimedes, especialista em engenharia hidraulica, bombas,
saneamento e engenharia mecanica. Alguem comentou em um dos seus posts no Nexus.
Responda ao comentario de forma:

- Tecnica e precisa, baseando-se nos dados tecnicos fornecidos quando disponivel
- Em portugues brasileiro informal mas profissional
- Curta (maximo 280 caracteres)
- Engajante — agregue valor tecnico, complemente ou corrija educadamente
- Sem emojis excessivos (maximo 1)
- Sem hashtags

Nunca mencione que e uma IA. Fale como um engenheiro experiente respondendo um colega.
Se houver contexto tecnico dos manuais HIGRA abaixo, use como base para sua resposta."""


async def responder_comentario_arquimedes(post_id: int, comment_id: int, comment_content: str):
    """Arquimedes responde automaticamente a um comentario em seu post."""
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        return None

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar conteudo do post original
        cur.execute("SELECT content, title FROM social_posts WHERE id = %s", (post_id,))
        post = cur.fetchone()
        if not post:
            return None

        # Buscar nome e id do autor do comentario
        cur.execute("""
            SELECT c.user_id, u.name FROM social_post_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.id = %s
        """, (comment_id,))
        commenter = cur.fetchone()
        commenter_name = commenter["name"] if commenter else "usuario"
        commenter_user_id = commenter["user_id"] if commenter else None
    finally:
        cur.close()
        conn.close()

    post_text = post.get("title", "") or ""
    if post.get("content"):
        post_text += ("\n" + post["content"]) if post_text else post["content"]

    # Buscar contexto tecnico via RAG
    rag_query = f"{post_text[:200]} {comment_content[:200]}"
    rag_context = ""
    try:
        rag_context = buscar_contexto_relevante(rag_query, k=3, min_score=0.3)
    except Exception as e:
        logger.warning(f"[ARQUIMEDES] RAG falhou para reply: {e}")

    rag_section = ""
    if rag_context:
        rag_section = f"\n\nContexto tecnico dos manuais HIGRA:\n{rag_context[:1000]}\n"

    prompt = f"""Seu post original:
\"{post_text[:500]}\"

Comentario de {commenter_name}:
\"{comment_content[:500]}\"{rag_section}

Responda ao comentario de forma tecnica e engajante (maximo 280 caracteres).
Use os dados tecnicos dos manuais quando relevante.
Responda APENAS com o texto da resposta, sem prefixo."""

    resposta = gerar_resposta_claude(SYSTEM_PROMPT_REPLY, prompt, temperature=0.7)

    if not resposta or resposta.startswith("O servico de IA"):
        logger.warning("[ARQUIMEDES] Falha ao gerar resposta para comentario")
        return None

    # Limpar aspas ao redor se houver
    if resposta.startswith('"') and resposta.endswith('"'):
        resposta = resposta[1:-1]

    # Inserir como reply ao comentario
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO social_post_comments (post_id, user_id, content, parent_comment_id, created_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING id
        """, (post_id, arquimedes_id, resposta[:300], comment_id))
        reply = cur.fetchone()
        cur.execute(
            "UPDATE social_posts SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = %s",
            (post_id,)
        )
        # Notificar o autor do comentario original
        if commenter_user_id and commenter_user_id != arquimedes_id:
            cur.execute("""
                INSERT INTO social_notifications (user_id, actor_id, type, post_id, comment_id, created_at)
                VALUES (%s, %s, 'comment', %s, %s, CURRENT_TIMESTAMP)
            """, (commenter_user_id, arquimedes_id, post_id, reply["id"]))
        conn.commit()
        logger.info(f"[ARQUIMEDES] Respondeu comentario {comment_id} no post {post_id} (reply_id={reply['id']})")
        return reply["id"]
    except Exception as e:
        conn.rollback()
        logger.error(f"[ARQUIMEDES] Erro ao responder comentario: {e}")
        return None
    finally:
        cur.close()
        conn.close()


SYSTEM_PROMPT_MENTION = """Voce e Arquimedes, especialista em engenharia hidraulica, bombas,
saneamento e engenharia mecanica. Alguem mencionou voce (@arquimedes) em um post ou
comentario no Nexus pedindo sua opiniao. Responda de forma:

- Tecnica e precisa, baseando-se nos dados tecnicos fornecidos quando disponivel
- Em portugues brasileiro informal mas profissional
- Curta (maximo 280 caracteres)
- Direta — o usuario pediu especificamente SUA opiniao, entao responda com autoridade
- Sem emojis excessivos (maximo 1)
- Sem hashtags

Nunca mencione que e uma IA. Fale como um engenheiro experiente que foi convocado.
Se houver contexto tecnico dos manuais HIGRA abaixo, use como base para sua resposta."""


async def responder_mencao_arquimedes(post_id: int, comment_id: int = None, content: str = "", author_name: str = "usuario"):
    """Arquimedes responde quando mencionado com @arquimedes em um post ou comentario."""
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        return None

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar post original para contexto
        cur.execute("SELECT content, title, user_id FROM social_posts WHERE id = %s", (post_id,))
        post = cur.fetchone()
        if not post:
            return None

        # Buscar autor do comentario/post se comment_id informado
        author_user_id = None
        if comment_id:
            cur.execute("""
                SELECT c.user_id, u.name FROM social_post_comments c
                JOIN users u ON u.id = c.user_id WHERE c.id = %s
            """, (comment_id,))
            commenter = cur.fetchone()
            if commenter:
                author_name = commenter["name"]
                author_user_id = commenter["user_id"]
        else:
            author_user_id = post["user_id"]
    finally:
        cur.close()
        conn.close()

    post_text = post.get("title", "") or ""
    if post.get("content"):
        post_text += ("\n" + post["content"]) if post_text else post["content"]

    # Limpar a mencao do conteudo para o prompt
    mention_text = content.replace("@arquimedes", "").strip() if content else ""

    # Buscar contexto tecnico via RAG
    rag_query = f"{post_text[:200]} {mention_text[:200]}"
    rag_context = ""
    try:
        rag_context = buscar_contexto_relevante(rag_query, k=3, min_score=0.3)
    except Exception as e:
        logger.warning(f"[ARQUIMEDES] RAG falhou para mencao: {e}")

    rag_section = ""
    if rag_context:
        rag_section = f"\n\nContexto tecnico dos manuais HIGRA:\n{rag_context[:1000]}\n"

    prompt = f"""Post original:
\"{post_text[:500]}\"

{author_name} mencionou voce:
\"{content[:500]}\"{rag_section}

Responda de forma direta, tecnica e engajante (maximo 280 caracteres).
Use os dados tecnicos dos manuais quando relevante.
Responda APENAS com o texto da resposta, sem prefixo."""

    resposta = gerar_resposta_claude(SYSTEM_PROMPT_MENTION, prompt, temperature=0.7)

    if not resposta or resposta.startswith("O servico de IA"):
        logger.warning("[ARQUIMEDES] Falha ao gerar resposta para mencao")
        return None

    if resposta.startswith('"') and resposta.endswith('"'):
        resposta = resposta[1:-1]

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Responder como comentario no post (reply ao comentario se houver, senao top-level)
        parent_id = comment_id
        cur.execute("""
            INSERT INTO social_post_comments (post_id, user_id, content, parent_comment_id, created_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING id
        """, (post_id, arquimedes_id, resposta[:300], parent_id))
        reply = cur.fetchone()
        cur.execute(
            "UPDATE social_posts SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = %s",
            (post_id,)
        )
        # Notificar quem mencionou
        if author_user_id and author_user_id != arquimedes_id:
            cur.execute("""
                INSERT INTO social_notifications (user_id, actor_id, type, post_id, comment_id, created_at)
                VALUES (%s, %s, 'comment', %s, %s, CURRENT_TIMESTAMP)
            """, (author_user_id, arquimedes_id, post_id, reply["id"]))
        conn.commit()
        logger.info(f"[ARQUIMEDES] Respondeu mencao no post {post_id} (reply_id={reply['id']})")
        return reply["id"]
    except Exception as e:
        conn.rollback()
        logger.error(f"[ARQUIMEDES] Erro ao responder mencao: {e}")
        return None
    finally:
        cur.close()
        conn.close()


async def responder_comentarios_pendentes(max_replies: int = 5):
    """Varre posts do Arquimedes e responde comentarios que ainda nao tem reply."""
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        return 0

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar comentarios em posts do Arquimedes que nao tem reply dele
        cur.execute("""
            SELECT c.id AS comment_id, c.post_id, c.content AS comment_content,
                   p.content AS post_content, p.title AS post_title,
                   u.name AS commenter_name
            FROM social_post_comments c
            JOIN social_posts p ON p.id = c.post_id
            JOIN users u ON u.id = c.user_id
            WHERE p.user_id = %s
              AND c.user_id != %s
              AND c.parent_comment_id IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM social_post_comments r
                  WHERE r.parent_comment_id = c.id AND r.user_id = %s
              )
            ORDER BY c.created_at DESC
            LIMIT %s
        """, (arquimedes_id, arquimedes_id, arquimedes_id, max_replies))
        pending = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    replied = 0
    for item in pending:
        try:
            result = await responder_comentario_arquimedes(
                item["post_id"], item["comment_id"], item["comment_content"]
            )
            if result:
                replied += 1
        except Exception as e:
            logger.error(f"[ARQUIMEDES] Erro ao responder pendente {item['comment_id']}: {e}")

    logger.info(f"[ARQUIMEDES] Respondeu {replied} comentarios pendentes")
    return replied


SYSTEM_PROMPT_DM = """Voce e Arquimedes, especialista em engenharia hidraulica, bombas,
saneamento e engenharia mecanica. Voce esta em uma conversa privada (DM) no Nexus,
uma rede social tecnica. Responda de forma:

- Tecnica e precisa, baseando-se nos dados tecnicos fornecidos quando disponivel
- Em portugues brasileiro informal mas profissional
- Conversacional — voce esta batendo papo com um colega engenheiro
- Maximo 500 caracteres
- Sem emojis excessivos (maximo 1)
- Sem hashtags

Nunca mencione que e uma IA. Fale como um engenheiro experiente conversando com um colega.
Se a pergunta nao for tecnica (ex: saudacao), responda de forma amigavel e breve.
Se houver contexto tecnico dos manuais HIGRA abaixo, use como base para sua resposta."""


def _responder_dm_sync(conversation_id: int, user_message: str, user_name: str, sender_id: int, arquimedes_id: int):
    """Gera e envia a resposta do Arquimedes (roda em thread separada)."""
    import asyncio as _asyncio
    from backend.services.social_service import enviar_mensagem_dm

    try:
        # Enviar indicador de "digitando" via WebSocket
        if sender_id:
            try:
                from backend.routes.social_ws import notify_user
                loop = _asyncio.get_event_loop()
                if loop.is_running():
                    _asyncio.run_coroutine_threadsafe(
                        notify_user(sender_id, "dm_typing", {
                            "conversation_id": conversation_id,
                            "user_id": arquimedes_id,
                        }),
                        loop,
                    )
            except Exception:
                pass

        # Buscar contexto RAG baseado na mensagem do usuario
        rag_context = buscar_contexto_relevante(user_message, k=3, min_score=0.25)

        # Buscar historico recente da conversa para contexto
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                """
                SELECT sender_id, content FROM social_dm_messages
                WHERE conversation_id = %s
                ORDER BY created_at DESC LIMIT 10
                """,
                (conversation_id,),
            )
            history_rows = cur.fetchall()
        finally:
            cur.close()
            conn.close()

        # Montar historico para o Claude (ordem cronologica)
        historico = []
        for row in reversed(history_rows[1:]):  # Exclui a mensagem atual (ja esta no prompt)
            role = "assistant" if row["sender_id"] == arquimedes_id else "user"
            if row["content"]:
                historico.append({"role": role, "content": row["content"]})

        prompt = f"Mensagem de {user_name or 'um usuario'}:\n\"{user_message}\""
        if rag_context:
            prompt += f"\n\nContexto tecnico dos manuais HIGRA:\n{rag_context}"

        resposta = gerar_resposta_claude(
            SYSTEM_PROMPT_DM,
            prompt,
            historico=historico if historico else None,
            temperature=0.7,
        )

        if not resposta or not resposta.strip():
            logger.warning("[ARQUIMEDES] Resposta DM vazia")
            return

        # Enviar resposta como mensagem do Arquimedes
        enviar_mensagem_dm(arquimedes_id, conversation_id, resposta.strip())
        logger.info(f"[ARQUIMEDES] Respondeu DM na conversa {conversation_id}")
    except Exception as e:
        logger.error(f"[ARQUIMEDES] Erro ao responder DM: {e}")


def responder_dm_arquimedes(conversation_id: int, user_message: str, user_name: str = "", sender_id: int = None):
    """Dispara resposta do Arquimedes em thread separada (non-blocking)."""
    import threading
    arquimedes_id = _get_arquimedes_id()
    if not arquimedes_id:
        logger.warning("[ARQUIMEDES] ID nao encontrado para responder DM")
        return
    t = threading.Thread(
        target=_responder_dm_sync,
        args=(conversation_id, user_message, user_name, sender_id, arquimedes_id),
        daemon=True,
    )
    t.start()
    logger.info(f"[ARQUIMEDES] Thread DM disparada para conversa {conversation_id}")


async def executar_ciclo_arquimedes():
    """Executa um ciclo completo: posta + curte + responde pendentes."""
    post_id = await gerar_post_arquimedes()
    likes = await curtir_posts_arquimedes()
    replies = await responder_comentarios_pendentes()
    return {"post_id": post_id, "likes": likes, "replies": replies}
