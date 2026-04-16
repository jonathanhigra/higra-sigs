"""
HIGRA SIGS — INDEXAÇÃO MULTI-FONTE (PDF + JSON + TXT)
RAG CANÔNICO — PRESERVA METADADOS
PDFs + JSON institucional estruturado + TXT livros/manuais
"""

import os
import sys
import re
import json
import gc
import warnings

warnings.filterwarnings(
    "ignore",
    message="expandable_segments not supported on this platform"
)

import torch
from torch.cuda import empty_cache
import fitz  # PyMuPDF

# ---------------------------------------------------------------------
# Paths e bootstrap
# ---------------------------------------------------------------------

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from backend.services.rag_pipeline import index_documents

UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, "backend", "uploads")
ALLOWED_CATEGORIES = {"produto", "historia", "pessoas"}

# ---------------------------------------------------------------------
# Utilidades de metadados (PDF)
# ---------------------------------------------------------------------

def extract_modelo(text: str) -> str:
    match = re.search(r'HCP[-\s]?(\d{3})|HCS[-\s]?(\d{3})|HCM[-\s]?(\d{3})', text, re.I)
    return match.group(0).upper().replace(" ", "") if match else "Desconhecido"


def extract_ano(filename: str) -> str:
    match = re.search(r'20\d{2}', filename)
    return match.group(0) if match else "Desconhecido"


def detect_subcategory(filename: str) -> str:
    """Detecta subcategoria do manual com base no nome do arquivo."""
    fn = filename.upper()
    if "ANFIBIA" in fn or "ANFÍBIA" in fn:
        return "bomba_anfibia"
    if "SUBMERSA" in fn:
        return "bomba_submersa"
    if "AERADOR" in fn:
        return "aerador"
    if "MISTURADOR" in fn:
        return "misturador"
    return "produto"

# ---------------------------------------------------------------------
# Chunking estruturado para PDFs
# ---------------------------------------------------------------------

def perfect_chunk(text: str, pdf_name: str, page_num: int):
    text = text.strip()
    if not text:
        return []

    paragraphs = [
        p.strip() for p in text.split("\n\n")
        if p.strip() and len(p) > 50
    ]

    chunks = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) < 1200:
            current += ("\n\n" + para if current else para)
        else:
            chunks.append(current)
            current = para

    if current:
        chunks.append(current)

    subcategory = detect_subcategory(pdf_name)
    documents = []
    for chunk in chunks:
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": pdf_name,
                    "page": page_num,
                    "modelo": extract_modelo(chunk),
                    "ano": extract_ano(pdf_name),
                    "type": "pdf_manual",
                    "category": subcategory
                }
            })

    return documents

# ---------------------------------------------------------------------
# Chunking para arquivos TXT (livros/manuais em texto corrido)
# ---------------------------------------------------------------------

SECTION_RE = re.compile(
    r'^([A-C])-(\d+(?:\.\d+)*)\s+(.+)',  # A-1.4.1 Título da Seção
    re.MULTILINE
)

NOISE_PATTERNS = [
    re.compile(r'^\d+$'),                              # linhas só com número de página
    re.compile(r'^Manual de Hidráulica$', re.I),       # header repetido do livro
    re.compile(r'^[\d,.\s]+$'),                        # linhas só numéricas (tabelas)
    re.compile(r'^Figura [A-C]-'),                     # legenda de figura sem contexto
    re.compile(r'^Tabela [A-C]-'),                     # legenda de tabela sem contexto
    re.compile(r'^Fonte: Bib'),                        # referência bibliográfica curta
]


def _is_noise_line(line: str) -> bool:
    """Detecta linhas de ruído OCR que não agregam valor ao RAG."""
    line = line.strip()
    if len(line) < 15:
        return True
    return any(p.match(line) for p in NOISE_PATTERNS)


def _detect_section(line: str):
    """Detecta cabeçalho de seção. Retorna (parte, capitulo, secao, titulo) ou None."""
    m = SECTION_RE.match(line.strip())
    if m:
        parte = m.group(1)
        secao = m.group(2)
        titulo = m.group(3).strip()
        capitulo = secao.split(".")[0]
        return parte, capitulo, secao, titulo
    return None


def chunk_txt_file(text: str, filename: str, chunk_size: int = 1200):
    """Chunking semântico com detecção de seções e filtragem de ruído OCR.

    - Detecta seções pelo padrão A-1.4.1, B-2.3 etc.
    - Agrupa parágrafos dentro da mesma seção
    - Filtra linhas de ruído (números de página, headers repetidos, tabelas numéricas puras)
    - Adiciona metadata rico (parte, capítulo, seção, título)
    """
    lines = text.split("\n")

    # 1. Agrupar linhas em parágrafos, detectando fronteiras de seção
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
            # Salvar seção anterior se tiver conteúdo
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

    # 2. Para cada seção, agrupar linhas em parágrafos e depois em chunks
    documents = []
    chunk_idx = 0

    for sec in sections:
        # Juntar linhas em parágrafos usando heurística
        paragraphs = []
        current_para = ""

        for line in sec["lines"]:
            # Linha curta ou parágrafo anterior termina em pontuação → quebra
            if current_para and (
                len(line) < 40
                or current_para.endswith((".", "!", "?", ":"))
                or line[0].isupper() and not current_para[-1].isalpha()
            ):
                if len(current_para) >= 40:
                    paragraphs.append(current_para)
                current_para = line
            else:
                current_para += (" " + line if current_para else line)

        if current_para and len(current_para) >= 40:
            paragraphs.append(current_para)

        if not paragraphs:
            continue

        # 3. Agrupar parágrafos em chunks respeitando chunk_size
        current_chunk = ""
        section_header = f"[{sec['secao']} {sec['titulo']}]\n" if sec['secao'] else ""

        for para in paragraphs:
            candidate = current_chunk + ("\n\n" + para if current_chunk else para)
            if len(candidate) <= chunk_size:
                current_chunk = candidate
            else:
                if current_chunk and len(current_chunk) >= 50:
                    documents.append({
                        "text": section_header + current_chunk if section_header else current_chunk,
                        "metadata": {
                            "source": filename,
                            "type": "txt_livro",
                            "category": "livro_referencia",
                            "parte": sec["parte"],
                            "capitulo": sec["capitulo"],
                            "secao": sec["secao"],
                            "titulo": sec["titulo"],
                            "chunk_index": chunk_idx,
                        }
                    })
                    chunk_idx += 1
                current_chunk = para

        # Flush remaining
        if current_chunk and len(current_chunk) >= 50:
            documents.append({
                "text": section_header + current_chunk if section_header else current_chunk,
                "metadata": {
                    "source": filename,
                    "type": "txt_livro",
                    "category": "livro_referencia",
                    "parte": sec["parte"],
                    "capitulo": sec["capitulo"],
                    "secao": sec["secao"],
                    "titulo": sec["titulo"],
                    "chunk_index": chunk_idx,
                }
            })
            chunk_idx += 1

    # Atualizar chunk_total
    total = len(documents)
    for doc in documents:
        doc["metadata"]["chunk_total"] = total

    return documents


# ---------------------------------------------------------------------
# Loader CORRETO para JSON RAG estruturado
# ---------------------------------------------------------------------

def load_rag_json(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    documents = []

    if isinstance(data, dict) and "documents" in data:
        for doc in data["documents"]:
            text = (doc.get("text") or "").strip()
            category = doc.get("category") or (doc.get("metadata") or {}).get("category")
            if len(text) < 50:
                continue
            if category not in ALLOWED_CATEGORIES:
                continue

            documents.append({
                "text": text,
                "metadata": {
                    **doc.get("metadata", {}),
                    "id": doc.get("id"),
                    "category": category,
                    "source_file": os.path.basename(path),
                    "type": "json_rag"
                }
            })

    return documents

# ---------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------

if __name__ == "__main__":

    print("HIGRA SIGS — INDEXAÇÃO MULTI-FONTE (PDF + JSON)")
    print("=" * 80)

    if not os.path.exists(UPLOAD_FOLDER):
        print("Pasta 'uploads' não encontrada.")
        sys.exit(1)

    files = os.listdir(UPLOAD_FOLDER)
    pdfs = [f for f in files if f.lower().endswith(".pdf")]
    jsons = [f for f in files if f.lower().endswith(".json")]
    txts = [f for f in files if f.lower().endswith(".txt")]

    if not pdfs and not jsons and not txts:
        print("Nenhum PDF, JSON ou TXT encontrado em 'uploads'")
        sys.exit(0)

    # -------------------------------
    # PDFs
    # -------------------------------
    for pdf in pdfs:
        path = os.path.join(UPLOAD_FOLDER, pdf)
        print(f"\nProcessando PDF: {pdf}")

        doc = fitz.open(path)
        documents = []

        for page_num in range(doc.page_count):
            page = doc.load_page(page_num)
            text = page.get_text("text")

            page_docs = perfect_chunk(text, pdf, page_num + 1)
            documents.extend(page_docs)

            print(f"   Página {page_num + 1}: {len(page_docs)} chunks")

            del page, text, page_docs
            gc.collect()
            empty_cache()

        if documents:
            index_documents(documents)
            print(f"   {len(documents)} documentos do {pdf} indexados")

        doc.close()

    # -------------------------------
    # JSON RAG
    # -------------------------------
    for js in jsons:
        path = os.path.join(UPLOAD_FOLDER, js)
        print(f"\nProcessando JSON RAG: {js}")

        documents = load_rag_json(path)

        if documents:
            index_documents(documents)
            print(f"   {len(documents)} documentos do {js} indexados")
        else:
            print(f"   Nenhum documento válido encontrado em {js}")

        gc.collect()
        empty_cache()

    # -------------------------------
    # TXT (livros / manuais texto)
    # -------------------------------
    for txt in txts:
        path = os.path.join(UPLOAD_FOLDER, txt)
        print(f"\nProcessando TXT: {txt}")

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        documents = chunk_txt_file(content, txt)
        print(f"   {len(documents)} chunks gerados")

        if documents:
            # Indexar em lotes de 200 para não estourar memória
            batch_size = 200
            for i in range(0, len(documents), batch_size):
                batch = documents[i:i + batch_size]
                index_documents(batch)
                print(f"   Lote {i // batch_size + 1}: {len(batch)} chunks indexados")
                gc.collect()
                empty_cache()

            print(f"   {len(documents)} documentos do {txt} indexados")

        gc.collect()
        empty_cache()

    print("\n" + "=" * 80)
    print("   INDEXAÇÃO CONCLUÍDA COM SUCESSO!")
    print("   PDFs + JSONs + TXTs RAG INDEXADOS!")
    print("   RAG PRONTO PARA CONSULTAS GOVERNADAS!")
    print("=" * 80)
