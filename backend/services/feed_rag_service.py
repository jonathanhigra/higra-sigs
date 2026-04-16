# -*- coding: utf-8 -*-
"""
Serviço de indexação de artigos do feed no RAG.
Permite que a IA se alimente do conteúdo técnico publicado pelos usuários.
"""

import logging

logger = logging.getLogger(__name__)

FEED_SOURCE_PREFIX = "feed_post"
_RAG_IMPORT_WARNED = False


def _get_rag_module():
    global _RAG_IMPORT_WARNED
    try:
        from backend.services import rag_pipeline
        return rag_pipeline
    except Exception as e:
        if not _RAG_IMPORT_WARNED:
            logger.warning("[FEED-RAG] Stack RAG indisponivel: %s", e)
            _RAG_IMPORT_WARNED = True
        return None


def indexar_post_no_rag(post_id: int, title: str, content: str, usuario_id: int, category: str = "artigo_comunidade"):
    """Indexa um post ou artigo do feed no FAISS para uso pelo RAG."""
    rag = _get_rag_module()
    if rag is None:
        return

    min_chars = 80 if category == "artigo_comunidade" else 50
    if not content or len(content.strip()) < min_chars:
        logger.info(f"[FEED-RAG] Post {post_id} muito curto, ignorando indexação")
        return

    texto = f"{title}\n\n{content}" if title else content
    metadata = {
        "source": f"{FEED_SOURCE_PREFIX}:{post_id}",
        "category": category,
        "post_id": post_id,
        "user_id": usuario_id,
        "title": title or "",
    }

    rag.index_documents([{"text": texto, "metadata": metadata}])
    logger.info(f"[FEED-RAG] Post {post_id} indexado no RAG | chars={len(texto)}")


def remover_post_do_rag(post_id: int):
    """Remove chunks de um post do índice RAG e reconstrói o FAISS."""
    rag = _get_rag_module()
    if rag is None:
        return

    documents = rag._documents
    source_key = f"{FEED_SOURCE_PREFIX}:{post_id}"
    antes = len(documents)
    removed = [i for i, d in enumerate(documents) if d.get("metadata", {}).get("source") == source_key]

    if not removed:
        logger.info(f"[FEED-RAG] Post {post_id} não encontrado no RAG")
        return

    for i in sorted(removed, reverse=True):
        documents.pop(i)

    rag._rebuild_index()
    logger.info(f"[FEED-RAG] Post {post_id} removido do RAG | chunks={len(removed)} | antes={antes} depois={len(documents)}")


def buscar_artigos_comunidade(query: str, k: int = 3, min_score: float = 0.30):
    """Busca artigos da comunidade no RAG, filtrando por categoria."""
    rag = _get_rag_module()
    if rag is None:
        return "", []

    contexto, fontes = rag.buscar_contexto_relevante_com_fontes(
        query, k=k, min_score=min_score,
        metadata_filter={"category": "artigo_comunidade"},
    )
    return contexto, fontes
