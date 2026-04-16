# -*- coding: utf-8 -*-
"""
Rotas do modulo social (feed, curtidas, comentarios, follows, notificacoes).
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from pydantic import BaseModel
from typing import List, Optional
from backend.auth.utils import require_user
from backend.database import get_db_connection
from psycopg2.extras import RealDictCursor
import re
import httpx

from backend.services.social_service import (
    listar_feed,
    criar_post,
    editar_post,
    alternar_like,
    alternar_repost,
    obter_perfil_usuario,
    listar_posts_usuario,
    listar_comentarios,
    criar_comentario,
    alternar_follow,
    listar_sugestoes,
    listar_notificacoes,
    marcar_notificacao_lida,
    marcar_todas_notificacoes_lidas,
    contar_notificacoes_nao_lidas,
    excluir_post,
    buscar_feed,
    buscar_post,
    listar_tendencias,
    alternar_like_comentario,
    obter_stats_usuario,
    listar_curtidas_usuario,
    listar_seguidores,
    listar_seguindo,
    listar_conversas_dm,
    obter_ou_criar_conversa_dm,
    listar_mensagens_dm,
    enviar_mensagem_dm,
    contar_dms_nao_lidas,
    excluir_mensagem_dm,
    editar_mensagem_dm,
    alternar_reacao_dm,
    buscar_posts_por_tag,
    listar_tendencias_explore,
    alternar_block,
    alternar_mute,
    verificar_block_mute,
    criar_enquete,
    votar_enquete,
    obter_enquete_por_post,
    obter_prefs_notificacao,
    atualizar_prefs_notificacao,
    obter_analytics_post,
    obter_analytics_usuario,
    buscar_usuarios,
    alternar_pin_post,
    marcar_dm_como_lida,
    obter_streak_usuario,
    obter_post_da_semana,
    obter_milestones_usuario,
    alternar_reacao_post,
    obter_reacoes_post,
    deletar_notificacao,
    criar_notificacao_sistema,
    listar_thread,
    toggle_announcement,
    listar_posts_agendados,
    cancelar_post_agendado,
    listar_posts_relacionados,
    contar_notificacoes_por_tipo,
)

router = APIRouter(prefix="/social", tags=["Social"])


@router.get("/avatar/{user_id}")
def get_avatar(user_id: int, response: Response):
    """Serve avatar do usuário como imagem com cache HTTP."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT photo, photo_mime, name FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            return Response(status_code=404)
        if not row.get("photo"):
            # Gera avatar SVG placeholder com inicial do nome
            initial = (row.get("name") or "U")[0].upper()
            colors = ["#3a3a5c", "#2e4a4a", "#3d3455", "#4a2e3d", "#3b3352",
                       "#2e3d4a", "#3a4a3a", "#4a3d2e", "#2e3a4a", "#3d2e4a",
                       "#2e4a3d", "#4a3a2e"]
            bg = colors[user_id % len(colors)]
            svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<rect width="128" height="128" fill="{bg}"/>
<text x="64" y="64" dy=".35em" text-anchor="middle"
  font-family="system-ui,sans-serif" font-size="52" font-weight="600"
  fill="#a0a0b8">{initial}</text>
</svg>'''
            return Response(
                content=svg.encode("utf-8"),
                media_type="image/svg+xml",
                headers={"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"},
            )
        photo = row["photo"]
        if isinstance(photo, memoryview):
            photo = bytes(photo)
        mime = row.get("photo_mime") or "image/jpeg"
        return Response(
            content=photo,
            media_type=mime,
            headers={"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"},
        )
    except Exception:
        return Response(status_code=500)
    finally:
        if conn:
            conn.close()


class CriarPostPayload(BaseModel):
    content: str
    media: Optional[List[dict]] = None
    title: Optional[str] = None
    quoted_post_id: Optional[int] = None
    thread_id: Optional[int] = None
    scheduled_at: Optional[str] = None


class EditarPostPayload(BaseModel):
    content: str
    title: Optional[str] = None


class CriarComentarioPayload(BaseModel):
    content: str
    parent_comment_id: Optional[int] = None


class EnviarMensagemPayload(BaseModel):
    content: str = ""
    media_url: Optional[str] = None
    reply_to_id: Optional[int] = None


class CriarEnquetePayload(BaseModel):
    content: Optional[str] = None
    question: str
    options: List[str]
    expires_hours: Optional[int] = None


class VotarEnquetePayload(BaseModel):
    option_id: int


class NotificacaoPrefsPayload(BaseModel):
    like_enabled: Optional[bool] = True
    comment_enabled: Optional[bool] = True
    follow_enabled: Optional[bool] = True
    article_enabled: Optional[bool] = True
    repost_enabled: Optional[bool] = True
    quote_enabled: Optional[bool] = True


@router.get("/feed")
def listar_feed_router(
    limit: int = 20,
    offset: int = 0,
    mode: str = "following",
    cursor_created_at: str = None,
    cursor_id: int = None,
    usuario_id: int = Depends(require_user),
):
    return listar_feed(usuario_id, limit, offset, mode, cursor_created_at, cursor_id)


@router.get("/feed/new-count")
def contar_novos_posts_router(
    since: str = None,
    mode: str = "following",
    usuario_id: int = Depends(require_user),
):
    from backend.services.social_service import contar_novos_posts
    count = contar_novos_posts(usuario_id, since, mode)
    return {"count": count}


@router.get("/search")
def buscar_feed_router(
    q: str,
    limit: int = 20,
    mode: str = "following",
    date_from: str = None,
    date_to: str = None,
    content_type: str = None,
    author: str = None,
    usuario_id: int = Depends(require_user),
):
    resultados = buscar_feed(usuario_id, q, limit, mode, date_from, date_to, content_type, author)
    return {"results": resultados}


@router.post("/posts")
def criar_post_router(
    payload: CriarPostPayload,
    background_tasks: BackgroundTasks,
    usuario_id: int = Depends(require_user),
):
    post = criar_post(usuario_id, payload.content, payload.media, payload.title, payload.quoted_post_id, payload.thread_id, payload.scheduled_at)
    # Se mencionou @arquimedes no post, responder como comentario
    if post and "@arquimedes" in (payload.content or "").lower():
        try:
            from backend.services.arquimedes_service import responder_mencao_arquimedes
            background_tasks.add_task(
                responder_mencao_arquimedes, post["id"], None, payload.content,
            )
        except Exception:
            pass
    return {"post": post}


@router.get("/posts/scheduled")
def listar_agendados_router(
    usuario_id: int = Depends(require_user),
):
    posts = listar_posts_agendados(usuario_id)
    return {"posts": posts}


@router.delete("/posts/scheduled/{post_id}")
def cancelar_agendado_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    return cancelar_post_agendado(usuario_id, post_id)


@router.get("/posts/{post_id}/related")
def listar_relacionados_router(
    post_id: int,
    limit: int = 5,
    usuario_id: int = Depends(require_user),
):
    posts = listar_posts_relacionados(post_id, usuario_id, limit)
    return {"posts": posts}


@router.post("/posts/{post_id}/like")
def alternar_like_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_like(usuario_id, post_id)
    return result


@router.post("/posts/{post_id}/repost")
def alternar_repost_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_repost(usuario_id, post_id)
    return result


@router.get("/posts/{post_id}/thread")
def listar_thread_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    return {"posts": listar_thread(post_id, usuario_id)}


@router.post("/posts/{post_id}/announcement")
def toggle_announcement_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    return toggle_announcement(post_id, usuario_id)


@router.get("/posts/{post_id}")
def buscar_post_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    post = buscar_post(post_id, usuario_id)
    return {"post": post}


@router.put("/posts/{post_id}")
def editar_post_router(
    post_id: int,
    payload: EditarPostPayload,
    usuario_id: int = Depends(require_user),
):
    post = editar_post(usuario_id, post_id, payload.content, payload.title)
    return {"post": post}


@router.delete("/posts/{post_id}")
def excluir_post_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    result = excluir_post(usuario_id, post_id)
    return result


@router.post("/posts/{post_id}/pin")
def alternar_pin_post_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_pin_post(usuario_id, post_id)
    return result


@router.get("/posts/{post_id}/comments")
def listar_comentarios_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    comentarios = listar_comentarios(post_id, usuario_id)
    return {"comments": comentarios}


@router.post("/posts/{post_id}/comments")
def criar_comentario_router(
    post_id: int,
    payload: CriarComentarioPayload,
    background_tasks: BackgroundTasks,
    usuario_id: int = Depends(require_user),
):
    comentario = criar_comentario(
        usuario_id,
        post_id,
        payload.content,
        payload.parent_comment_id,
    )
    if comentario:
        try:
            conn = get_db_connection()
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(
                    "SELECT p.user_id, u.is_ai FROM social_posts p JOIN users u ON u.id = p.user_id WHERE p.id = %s",
                    (post_id,),
                )
                row = cur.fetchone()
            finally:
                conn.close()

            has_arquimedes_mention = "@arquimedes" in (payload.content or "").lower()

            # Se mencionou @arquimedes em qualquer post
            if has_arquimedes_mention:
                from backend.services.arquimedes_service import responder_mencao_arquimedes
                background_tasks.add_task(
                    responder_mencao_arquimedes, post_id, comentario["id"], payload.content,
                )
            # Se o post é do Arquimedes e o comentario não é dele, responder automaticamente
            elif row and row.get("is_ai") and row["user_id"] != usuario_id and not payload.parent_comment_id:
                from backend.services.arquimedes_service import responder_comentario_arquimedes
                background_tasks.add_task(
                    responder_comentario_arquimedes, post_id, comentario["id"], payload.content,
                )
        except Exception:
            pass  # Não bloquear o comentário se o auto-reply falhar
    return {"comment": comentario}


@router.post("/comments/{comment_id}/like")
def alternar_like_comentario_router(
    comment_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_like_comentario(usuario_id, comment_id)
    return result


@router.get("/profile/stats")
def obter_stats_usuario_router(
    usuario_id: int = Depends(require_user),
):
    stats = obter_stats_usuario(usuario_id)
    return stats


@router.get("/users/search")
def buscar_usuarios_router(
    q: str,
    limit: int = 5,
    usuario_id: int = Depends(require_user),
):
    users = buscar_usuarios(q, usuario_id, limit)
    return {"users": users}


@router.get("/ai-profile")
def obter_ai_profile(usuario_id: int = Depends(require_user)):
    """Retorna perfil publico do usuario IA (Arquimedes)."""
    from backend.services.social_service import _encode_photo
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, username, name, photo, photo_mime FROM users WHERE is_ai = TRUE LIMIT 1")
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return {"profile": None}
    row = dict(row)
    _encode_photo(row)
    return {"profile": row}


@router.get("/users/{target_id}/profile")
def obter_perfil_router(
    target_id: int,
    usuario_id: int = Depends(require_user),
):
    perfil = obter_perfil_usuario(target_id, usuario_id)
    return {"profile": perfil}


@router.get("/users/{target_id}/followers")
def listar_seguidores_router(
    target_id: int,
    limit: int = 50,
    offset: int = 0,
    usuario_id: int = Depends(require_user),
):
    users = listar_seguidores(target_id, usuario_id, limit, offset)
    return {"users": users}


@router.get("/users/{target_id}/following")
def listar_seguindo_router(
    target_id: int,
    limit: int = 50,
    offset: int = 0,
    usuario_id: int = Depends(require_user),
):
    users = listar_seguindo(target_id, usuario_id, limit, offset)
    return {"users": users}


@router.get("/users/{target_id}/posts")
def listar_posts_usuario_router(
    target_id: int,
    limit: int = 20,
    offset: int = 0,
    usuario_id: int = Depends(require_user),
):
    posts = listar_posts_usuario(target_id, usuario_id, limit, offset)
    return {"posts": posts}


@router.get("/users/{target_id}/likes")
def listar_curtidas_usuario_router(
    target_id: int,
    limit: int = 20,
    offset: int = 0,
    usuario_id: int = Depends(require_user),
):
    posts = listar_curtidas_usuario(target_id, usuario_id, limit, offset)
    return {"posts": posts}


@router.post("/users/{target_id}/follow")
def alternar_follow_router(
    target_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_follow(usuario_id, target_id)
    return result


@router.get("/suggestions")
def listar_sugestoes_router(
    limit: int = 5,
    usuario_id: int = Depends(require_user),
):
    sugestoes = listar_sugestoes(usuario_id, limit)
    return {"suggestions": sugestoes}


@router.get("/notifications")
def listar_notificacoes_router(
    limit: int = 20,
    offset: int = 0,
    type: Optional[str] = None,
    status: Optional[str] = None,
    grouped: bool = False,
    usuario_id: int = Depends(require_user),
):
    notificacoes = listar_notificacoes(usuario_id, limit, offset, type, status, grouped)
    return {"notifications": notificacoes}


@router.post("/notifications/read-all")
def marcar_todas_notificacoes_lidas_router(
    usuario_id: int = Depends(require_user),
):
    result = marcar_todas_notificacoes_lidas(usuario_id)
    return result


@router.get("/notifications/unread-count")
def contar_notificacoes_nao_lidas_router(
    usuario_id: int = Depends(require_user),
):
    count = contar_notificacoes_nao_lidas(usuario_id)
    return {"count": count}


@router.get("/notifications/unread-counts")
def contar_notificacoes_por_tipo_router(
    usuario_id: int = Depends(require_user),
):
    counts = contar_notificacoes_por_tipo(usuario_id)
    return {"counts": counts}


@router.get("/trends")
def listar_tendencias_router(
    limit: int = 5,
    hours: int = 24,
    usuario_id: int = Depends(require_user),
):
    tendencias = listar_tendencias(limit=limit, hours=hours)
    return {"trends": tendencias}


@router.post("/notifications/{notification_id}/read")
def marcar_notificacao_lida_router(
    notification_id: int,
    usuario_id: int = Depends(require_user),
):
    result = marcar_notificacao_lida(usuario_id, notification_id)
    return result


@router.delete("/notifications/{notification_id}")
def deletar_notificacao_router(
    notification_id: int,
    usuario_id: int = Depends(require_user),
):
    return deletar_notificacao(usuario_id, notification_id)


@router.get("/dm/conversations")
def listar_conversas_dm_router(
    usuario_id: int = Depends(require_user),
):
    conversations = listar_conversas_dm(usuario_id)
    return {"conversations": conversations}


@router.post("/dm/conversations/{other_id}")
def criar_conversa_dm_router(
    other_id: int,
    usuario_id: int = Depends(require_user),
):
    conv_id = obter_ou_criar_conversa_dm(usuario_id, other_id)
    return {"conversation_id": conv_id}


@router.get("/dm/conversations/{conversation_id}/messages")
def listar_mensagens_dm_router(
    conversation_id: int,
    limit: int = 50,
    offset: int = 0,
    usuario_id: int = Depends(require_user),
):
    messages = listar_mensagens_dm(usuario_id, conversation_id, limit, offset)
    return {"messages": messages}


@router.post("/dm/conversations/{conversation_id}/messages")
def enviar_mensagem_dm_router(
    conversation_id: int,
    payload: EnviarMensagemPayload,
    usuario_id: int = Depends(require_user),
):
    message = enviar_mensagem_dm(usuario_id, conversation_id, payload.content, payload.media_url, payload.reply_to_id)
    return {"message": message}


@router.post("/dm/conversations/{conversation_id}/read")
def marcar_dm_lida_router(
    conversation_id: int,
    usuario_id: int = Depends(require_user),
):
    return marcar_dm_como_lida(usuario_id, conversation_id)


@router.get("/dm/unread-count")
def contar_dms_nao_lidas_router(
    usuario_id: int = Depends(require_user),
):
    count = contar_dms_nao_lidas(usuario_id)
    return {"count": count}


@router.delete("/dm/messages/{message_id}")
def excluir_mensagem_dm_router(
    message_id: int,
    usuario_id: int = Depends(require_user),
):
    return excluir_mensagem_dm(usuario_id, message_id)


@router.put("/dm/messages/{message_id}")
def editar_mensagem_dm_router(
    message_id: int,
    payload: dict,
    usuario_id: int = Depends(require_user),
):
    content = payload.get("content", "")
    return editar_mensagem_dm(usuario_id, message_id, content)


@router.post("/dm/messages/{message_id}/react")
def reagir_mensagem_dm_router(
    message_id: int,
    payload: dict,
    usuario_id: int = Depends(require_user),
):
    emoji = payload.get("emoji", "")
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji obrigatorio.")
    return alternar_reacao_dm(usuario_id, message_id, emoji)


@router.get("/dm/online-status")
def verificar_online_status(
    user_ids: str = "",
    usuario_id: int = Depends(require_user),
):
    from backend.routes.social_ws import get_online_user_ids
    online = get_online_user_ids()
    ids = [int(x) for x in user_ids.split(",") if x.strip().isdigit()]
    return {"online": {uid: uid in online for uid in ids}}


@router.get("/explore/tags")
def listar_tendencias_explore_router(
    limit: int = 20,
    hours: int = 72,
    usuario_id: int = Depends(require_user),
):
    tendencias = listar_tendencias_explore(limit=limit, hours=hours)
    return {"trends": tendencias}


@router.get("/explore/tag/{tag}")
def buscar_posts_por_tag_router(
    tag: str,
    limit: int = 20,
    offset: int = 0,
    usuario_id: int = Depends(require_user),
):
    posts = buscar_posts_por_tag(tag, usuario_id, limit, offset)
    return {"posts": posts}


@router.post("/users/{target_id}/block")
def alternar_block_router(
    target_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_block(usuario_id, target_id)
    return result


@router.post("/users/{target_id}/mute")
def alternar_mute_router(
    target_id: int,
    usuario_id: int = Depends(require_user),
):
    result = alternar_mute(usuario_id, target_id)
    return result


@router.get("/users/{target_id}/block-mute")
def verificar_block_mute_router(
    target_id: int,
    usuario_id: int = Depends(require_user),
):
    result = verificar_block_mute(usuario_id, target_id)
    return result


@router.post("/polls")
def criar_enquete_router(
    payload: CriarEnquetePayload,
    usuario_id: int = Depends(require_user),
):
    post = criar_enquete(usuario_id, payload.content, payload.question, payload.options, payload.expires_hours)
    return {"post": post}


@router.post("/polls/{poll_id}/vote")
def votar_enquete_router(
    poll_id: int,
    payload: VotarEnquetePayload,
    usuario_id: int = Depends(require_user),
):
    poll = votar_enquete(usuario_id, poll_id, payload.option_id)
    return {"poll": poll}


@router.get("/posts/{post_id}/poll")
def obter_enquete_post_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    poll = obter_enquete_por_post(post_id, usuario_id)
    return {"poll": poll}


@router.get("/notifications/preferences")
def obter_prefs_notificacao_router(
    usuario_id: int = Depends(require_user),
):
    prefs = obter_prefs_notificacao(usuario_id)
    return {"preferences": prefs}


@router.put("/notifications/preferences")
def atualizar_prefs_notificacao_router(
    payload: NotificacaoPrefsPayload,
    usuario_id: int = Depends(require_user),
):
    prefs = atualizar_prefs_notificacao(usuario_id, payload.dict())
    return {"preferences": prefs}


@router.get("/analytics/me")
def obter_analytics_usuario_router(
    usuario_id: int = Depends(require_user),
):
    analytics = obter_analytics_usuario(usuario_id)
    return {"analytics": analytics}


@router.get("/analytics/posts/{post_id}")
def obter_analytics_post_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    analytics = obter_analytics_post(usuario_id, post_id)
    return {"analytics": analytics}


@router.get("/link-preview")
async def link_preview_router(
    url: str,
    usuario_id: int = Depends(require_user),
):
    """Extrai og:title, og:description e og:image de uma URL."""
    if not url or not url.startswith("http"):
        return {"title": "", "description": "", "image": ""}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=5) as client:
            resp = await client.get(url, headers={"User-Agent": "HigraNexusBot/1.0"})
            html = resp.text[:20000]
        def extract_meta(prop):
            m = re.search(rf'<meta[^>]+(?:property|name)=["\']og:{prop}["\'][^>]+content=["\']([^"\']+)', html, re.I)
            if not m:
                m = re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:{prop}', html, re.I)
            return m.group(1) if m else ""
        title = extract_meta("title")
        if not title:
            m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
            title = m.group(1).strip() if m else ""
        return {
            "title": title[:200],
            "description": extract_meta("description")[:300],
            "image": extract_meta("image"),
        }
    except Exception:
        return {"title": "", "description": "", "image": ""}


# ---------------------------------------------------------------------------
# Streak, Post da Semana, Milestones, Reações
# ---------------------------------------------------------------------------

@router.get("/streak")
def obter_streak_router(usuario_id: int = Depends(require_user)):
    return obter_streak_usuario(usuario_id)


@router.get("/post-of-week")
def obter_post_da_semana_router(usuario_id: int = Depends(require_user)):
    post = obter_post_da_semana(usuario_id)
    return {"post": post}


@router.get("/milestones")
def obter_milestones_router(usuario_id: int = Depends(require_user)):
    return obter_milestones_usuario(usuario_id)


class ReacaoPayload(BaseModel):
    reaction: str


@router.post("/posts/{post_id}/react")
def reagir_post_router(
    post_id: int,
    payload: ReacaoPayload,
    usuario_id: int = Depends(require_user),
):
    reactions = alternar_reacao_post(usuario_id, post_id, payload.reaction)
    return {"reactions": reactions}


@router.get("/posts/{post_id}/reactions")
def obter_reacoes_post_router(
    post_id: int,
    usuario_id: int = Depends(require_user),
):
    reactions = obter_reacoes_post(post_id, usuario_id)
    return {"reactions": reactions}


