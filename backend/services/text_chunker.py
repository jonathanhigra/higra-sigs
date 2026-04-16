# -*- coding: utf-8 -*-
"""
Chunking semântico para textos técnicos (livros, manuais).
Detecta seções, filtra ruído de OCR, gera metadata rico.
"""

import re

SECTION_RE = re.compile(
    r'^([A-C])-(\d+(?:\.\d+)*)\s+(.+)',
    re.MULTILINE
)

NOISE_PATTERNS = [
    re.compile(r'^\d+$'),
    re.compile(r'^Manual de Hidráulica$', re.I),
    re.compile(r'^[\d,.\s]+$'),
    re.compile(r'^Figura [A-C]-'),
    re.compile(r'^Tabela [A-C]-'),
    re.compile(r'^Fonte: Bib'),
]


def _is_noise_line(line: str) -> bool:
    line = line.strip()
    if len(line) < 15:
        return True
    return any(p.match(line) for p in NOISE_PATTERNS)


def _detect_section(line: str):
    m = SECTION_RE.match(line.strip())
    if m:
        parte = m.group(1)
        secao = m.group(2)
        titulo = m.group(3).strip()
        capitulo = secao.split(".")[0]
        return parte, capitulo, secao, titulo
    return None


def chunk_text_semantic(text: str, filename: str, base_metadata: dict = None, chunk_size: int = 1200):
    """Chunking semântico com detecção de seções e filtragem de ruído OCR.

    Retorna lista de dicts {text, metadata} prontos para index_documents().
    """
    base_metadata = base_metadata or {}
    lines = text.split("\n")

    sections = []
    current_section = {"parte": "", "capitulo": "", "secao": "", "titulo": "", "lines": []}

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if _is_noise_line(stripped):
            continue

        sec = _detect_section(stripped)
        if sec:
            if current_section["lines"]:
                sections.append(current_section)
            parte, cap, secao, titulo = sec
            current_section = {
                "parte": parte, "capitulo": cap,
                "secao": f"{parte}-{secao}", "titulo": titulo,
                "lines": [],
            }
        else:
            current_section["lines"].append(stripped)

    if current_section["lines"]:
        sections.append(current_section)

    # If no sections detected, fall back to paragraph-based chunking
    if len(sections) <= 1 and not sections[0]["secao"] if sections else True:
        return _chunk_by_paragraphs(text, filename, base_metadata, chunk_size)

    documents = []
    chunk_idx = 0

    for sec in sections:
        paragraphs = _lines_to_paragraphs(sec["lines"])
        if not paragraphs:
            continue

        current_chunk = ""
        section_header = f"[{sec['secao']} {sec['titulo']}]\n" if sec['secao'] else ""

        for para in paragraphs:
            candidate = current_chunk + ("\n\n" + para if current_chunk else para)
            if len(candidate) <= chunk_size:
                current_chunk = candidate
            else:
                if current_chunk and len(current_chunk) >= 50:
                    meta = {
                        **base_metadata,
                        "type": base_metadata.get("type", "txt_livro"),
                        "category": base_metadata.get("category", "livro_referencia"),
                        "parte": sec["parte"],
                        "capitulo": sec["capitulo"],
                        "secao": sec["secao"],
                        "titulo": sec["titulo"],
                        "chunk_index": chunk_idx,
                    }
                    documents.append({
                        "text": section_header + current_chunk if section_header else current_chunk,
                        "metadata": meta,
                    })
                    chunk_idx += 1
                current_chunk = para

        if current_chunk and len(current_chunk) >= 50:
            meta = {
                **base_metadata,
                "type": base_metadata.get("type", "txt_livro"),
                "category": base_metadata.get("category", "livro_referencia"),
                "parte": sec["parte"],
                "capitulo": sec["capitulo"],
                "secao": sec["secao"],
                "titulo": sec["titulo"],
                "chunk_index": chunk_idx,
            }
            documents.append({
                "text": section_header + current_chunk if section_header else current_chunk,
                "metadata": meta,
            })
            chunk_idx += 1

    total = len(documents)
    for doc in documents:
        doc["metadata"]["chunk_total"] = total

    return documents


def _lines_to_paragraphs(lines: list[str]) -> list[str]:
    """Agrupa linhas em parágrafos usando heurística."""
    paragraphs = []
    current = ""

    for line in lines:
        if current and (
            len(line) < 40
            or current.endswith((".", "!", "?", ":"))
        ):
            if len(current) >= 40:
                paragraphs.append(current)
            current = line
        else:
            current += (" " + line if current else line)

    if current and len(current) >= 40:
        paragraphs.append(current)

    return paragraphs


def _chunk_by_paragraphs(text: str, filename: str, base_metadata: dict, chunk_size: int = 1200):
    """Fallback: chunking por parágrafos quando não há seções detectáveis."""
    lines = [l.strip() for l in text.split("\n") if l.strip() and not _is_noise_line(l.strip())]
    paragraphs = _lines_to_paragraphs(lines)

    documents = []
    current = ""
    chunk_idx = 0

    for para in paragraphs:
        if current and len(current) + len(para) + 2 <= chunk_size:
            current += "\n\n" + para
        else:
            if current and len(current) >= 50:
                documents.append({
                    "text": current,
                    "metadata": {
                        **base_metadata,
                        "chunk_index": chunk_idx,
                    }
                })
                chunk_idx += 1
            current = para

    if current and len(current) >= 50:
        documents.append({
            "text": current,
            "metadata": {
                **base_metadata,
                "chunk_index": chunk_idx,
            }
        })
        chunk_idx += 1

    total = len(documents)
    for doc in documents:
        doc["metadata"]["chunk_total"] = total

    return documents
