# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Rotas para upload e indexação de documentos técnicos.
Permite que PDFs e arquivos de texto sejam adicionados ao RAG da IA HIGRA Expert.
"""

import os
import re
import shutil
import asyncio
from functools import partial
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from typing import Optional
from backend.auth.utils import require_user
from backend.auth.utils import verificar_admin, verificar_fundador
import fitz
from backend.services.rag_pipeline import (
    index_documents, rebuild_index, get_index_stats, get_analytics,
    list_sources, remove_source, update_source_display_name,
    record_feedback, deduplicate_index, export_index, import_index,
    get_search_logs,
)
from backend.services.text_chunker import chunk_text_semantic
from backend.core.config import logger

router = APIRouter(prefix="/upload", tags=["Documentos"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")


def _require_admin(usuario_id: int):
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")


def _run_in_thread(fn, *args, **kwargs):
    """Run a sync function in the default executor to avoid blocking the event loop."""
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(None, partial(fn, *args, **kwargs))


# ==========================================================
_AUTO_CATEGORY_RULES = [
    (r"submers[ao]", "bomba_submersa"),
    (r"anf[ií]bi[ao]", "bomba_anfibia"),
    (r"aerador|aera[çc][aã]o", "aerador"),
    (r"turbina|gera[çc][aã]o.*energia|pch", "turbina"),
    (r"perda.*carga|tubula[çc]", "perda_carga"),
    (r"npsh|cavita[çc]", "npsh"),
    (r"manual\s*t[eé]cnico", "pdf_manual"),
    (r"cat[aá]logo", "catalogo"),
]


def _auto_categorize(filename: str) -> str | None:
    """Detecta categoria automaticamente pelo nome do arquivo."""
    name = filename.lower()
    for pattern, cat in _AUTO_CATEGORY_RULES:
        if re.search(pattern, name):
            return cat
    return None


# Upload e indexação de documento (admin only)
# ==========================================================
@router.post("/documento")
async def upload_documento(
    file: UploadFile = File(...),
    category: Optional[str] = Form(default=None),
    display_name: Optional[str] = Form(default=None),
    usuario_id: int = Depends(require_user),
):
    _require_admin(usuario_id)

    try:
        if not file.filename.lower().endswith((".pdf", ".txt", ".docx", ".csv", ".xlsx")):
            raise HTTPException(status_code=400, detail="Somente arquivos .pdf, .txt, .docx, .csv ou .xlsx são suportados.")

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        temp_path = os.path.join(UPLOAD_DIR, file.filename)

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"Arquivo recebido e salvo em {temp_path}")

        base_metadata = {
            "source": file.filename,
            "type": "upload",
        }
        if display_name and display_name.strip():
            base_metadata["display_name"] = display_name.strip()
        resolved_category = category or _auto_categorize(file.filename)
        if resolved_category:
            base_metadata["category"] = resolved_category

        items = []
        fname = file.filename.lower()
        if fname.endswith(".pdf"):
            doc = fitz.open(temp_path)
            # Detectar tamanho de fonte predominante para identificar headings
            all_sizes = []
            for page in doc:
                blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", [])
                for block in blocks:
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            if span.get("text", "").strip():
                                all_sizes.append(span.get("size", 12))
            body_size = max(set(all_sizes), key=all_sizes.count) if all_sizes else 12
            heading_threshold = body_size * 1.15  # 15% maior que corpo = heading

            # Extrair texto com marcadores de seção
            for page_num, page in enumerate(doc, start=1):
                blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", [])
                page_parts = []
                for block in blocks:
                    block_text = ""
                    is_heading = False
                    for line in block.get("lines", []):
                        line_text = ""
                        for span in line.get("spans", []):
                            txt = span.get("text", "")
                            sz = span.get("size", 12)
                            if txt.strip() and sz >= heading_threshold:
                                is_heading = True
                            line_text += txt
                        block_text += line_text
                    block_text = block_text.strip()
                    if not block_text:
                        continue
                    if is_heading and page_parts:
                        # Heading encontrado: flush seção anterior como item
                        section_text = "\n".join(page_parts).strip()
                        if section_text and len(section_text) >= 50:
                            items.append({
                                "text": section_text,
                                "metadata": {**base_metadata, "page": page_num},
                            })
                        page_parts = [f"## {block_text}"]
                    else:
                        page_parts.append(block_text)
                # Flush última seção da página
                if page_parts:
                    section_text = "\n".join(page_parts).strip()
                    if section_text and len(section_text) >= 50:
                        items.append({
                            "text": section_text,
                            "metadata": {**base_metadata, "page": page_num},
                        })
            doc.close()
        elif fname.endswith(".docx"):
            from docx import Document as DocxDocument
            docx_doc = DocxDocument(temp_path)
            paragraphs = [p.text.strip() for p in docx_doc.paragraphs if p.text.strip()]
            text = "\n\n".join(paragraphs)
            if text and len(text) > 2000:
                items = chunk_text_semantic(text, file.filename, base_metadata)
            elif text:
                items = [{"text": text, "metadata": base_metadata}]
        elif fname.endswith(".csv") or fname.endswith(".xlsx"):
            import pandas as pd
            if fname.endswith(".csv"):
                df = pd.read_csv(temp_path, encoding="utf-8", on_bad_lines="skip")
            else:
                df = pd.read_excel(temp_path)
            # Convert each row to a text representation
            if df.empty:
                raise HTTPException(status_code=400, detail="Arquivo sem dados legíveis.")
            cols = list(df.columns)
            for row_idx, row in df.iterrows():
                row_parts = [f"{col}: {row[col]}" for col in cols if pd.notna(row[col]) and str(row[col]).strip()]
                row_text = " | ".join(row_parts)
                if row_text and len(row_text) >= 30:
                    items.append({
                        "text": row_text,
                        "metadata": {**base_metadata, "row": int(row_idx) + 1},
                    })
            # Group small rows into larger chunks for better embedding quality
            if items and all(len(it["text"]) < 200 for it in items):
                grouped = []
                batch = []
                batch_len = 0
                for it in items:
                    batch.append(it["text"])
                    batch_len += len(it["text"])
                    if batch_len >= 600:
                        grouped.append({"text": "\n".join(batch), "metadata": base_metadata})
                        batch = []
                        batch_len = 0
                if batch:
                    grouped.append({"text": "\n".join(batch), "metadata": base_metadata})
                items = grouped
        else:
            with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read().strip()
            if text and len(text) > 2000:
                items = chunk_text_semantic(text, file.filename, base_metadata)
            elif text:
                items = [{"text": text, "metadata": base_metadata}]

        if not items:
            raise HTTPException(status_code=400, detail="Arquivo sem texto legível.")

        logger.info(f"[UPLOAD] Indexando {len(items)} chunks de '{file.filename}'...")

        # Run encoding/indexing in thread to avoid blocking event loop
        await _run_in_thread(index_documents, items)

        stats = get_index_stats()
        logger.info(f"[UPLOAD] Indexação concluída: {file.filename} | stats={stats}")

        return {
            "status": "success",
            "mensagem": f"Documento '{file.filename}' indexado com sucesso ({len(items)} chunks).",
            "stats": stats,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao processar upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao indexar documento: {e}")


# ==========================================================
# Listar fontes indexadas (admin only)
# ==========================================================
@router.get("/sources")
async def listar_fontes(usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    return {"sources": list_sources(), "stats": get_index_stats()}


# ==========================================================
# Renomear fonte (admin only)
# ==========================================================
@router.patch("/sources/{source_name:path}")
async def renomear_fonte(
    source_name: str,
    display_name: str = Form(...),
    usuario_id: int = Depends(require_user),
):
    _require_admin(usuario_id)
    result = update_source_display_name(source_name, display_name.strip())
    if result["updated"] == 0:
        raise HTTPException(status_code=404, detail=f"Fonte '{source_name}' não encontrada.")
    return {"status": "success", "mensagem": "Nome atualizado.", **result}


# ==========================================================
# Remover fonte do índice (admin only)
# ==========================================================
@router.delete("/sources/{source_name:path}")
async def deletar_fonte(source_name: str, usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    # Run in thread to avoid blocking event loop during vector reconstruction
    result = await _run_in_thread(remove_source, source_name)
    if result["removed"] == 0:
        raise HTTPException(status_code=404, detail=f"Fonte '{source_name}' não encontrada.")

    # Remover arquivo físico da pasta uploads (busca normalizada)
    import unicodedata
    norm = lambda s: unicodedata.normalize("NFC", s)
    target = norm(source_name)
    removed_file = False
    if os.path.isdir(UPLOAD_DIR):
        for fname in os.listdir(UPLOAD_DIR):
            if norm(fname) == target:
                fpath = os.path.join(UPLOAD_DIR, fname)
                try:
                    os.remove(fpath)
                    logger.info(f"Arquivo removido do disco: {fpath}")
                    removed_file = True
                except Exception as e:
                    logger.warning(f"Não foi possível remover arquivo do disco: {e}")
                break
    if not removed_file:
        logger.info(f"Arquivo não encontrado no disco: {source_name}")

    return {"status": "success", "mensagem": f"Fonte '{source_name}' removida.", **result}


# ==========================================================
# Rebuild completo (admin only)
# ==========================================================
@router.post("/rebuild")
async def rebuild_rag_index(usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    stats = await _run_in_thread(rebuild_index)
    return {"status": "ok", "stats": stats}


# ==========================================================
# Deduplicação semântica (admin only)
# ==========================================================
@router.post("/deduplicate")
async def deduplicate_rag(usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    removed = await _run_in_thread(deduplicate_index)
    return {"status": "ok", "removed": removed, "stats": get_index_stats()}


# ==========================================================
# Exportar índice RAG (admin only)
# ==========================================================
@router.get("/export")
async def export_rag_index(usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    zip_path = export_index()
    return FileResponse(zip_path, filename="rag_export.zip", media_type="application/zip")


# ==========================================================
# Importar índice RAG (admin only)
# ==========================================================
@router.post("/import")
async def import_rag_index(
    file: UploadFile = File(...),
    usuario_id: int = Depends(require_user),
):
    _require_admin(usuario_id)
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Somente arquivos .zip são aceitos.")
    temp_path = os.path.join(UPLOAD_DIR, "rag_import.zip")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    stats = await _run_in_thread(import_index, temp_path)
    os.remove(temp_path)
    return {"status": "ok", "stats": stats}


# ==========================================================
# Feedback de relevância (qualquer usuário autenticado)
# ==========================================================
@router.post("/feedback")
async def enviar_feedback(
    feedback_type: str = Form(...),
    sources: str = Form(""),
    query: str = Form(""),
    usuario_id: int = Depends(require_user),
):
    src_list = [s.strip() for s in sources.split(",") if s.strip()]
    result = record_feedback(feedback_type, src_list, query)
    return result


# ==========================================================
# Aprendizado por like — indexa resposta validada no RAG
# ==========================================================
@router.post("/learn")
async def learn_from_feedback(
    text: str = Form(...),
    query: str = Form(""),
    usuario_id: int = Depends(require_user),
):
    """Indexa uma resposta aprovada (like) como conhecimento validado no RAG.
    Restrito a fundadores — somente quem domina o assunto deve validar conhecimento."""
    if not verificar_fundador(usuario_id):
        return {"status": "skipped", "reason": "apenas fundadores podem validar conhecimento"}

    content = (text or "").strip()
    if not content or len(content) < 50:
        return {"status": "skipped", "reason": "texto muito curto para indexar"}

    metadata = {
        "source": "chat_validated",
        "origin": "user_like",
        "usuario_id": usuario_id,
    }
    if query:
        metadata["original_query"] = query.strip()

    await _run_in_thread(index_documents, [{"text": content, "metadata": metadata}])
    logger.info(f"[RAG LEARN] Resposta indexada via like (user={usuario_id}, len={len(content)})")
    return {"status": "ok", "indexed_chars": len(content)}


# ==========================================================
# Analytics RAG (admin only)
# ==========================================================
@router.get("/analytics")
async def rag_analytics(usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    return get_analytics()


# ==========================================================
# Search logs (admin only)
# ==========================================================
@router.get("/search-logs")
async def rag_search_logs(limit: int = 100, usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    return {"logs": get_search_logs(limit=min(limit, 500))}


# ==========================================================
# Status do índice
# ==========================================================
@router.get("/status")
async def rag_status(usuario_id: int = Depends(require_user)):
    return {"status": "ok", "stats": get_index_stats()}
