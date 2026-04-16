from __future__ import annotations
# backend/services/rag_pipeline.py
"""
RAG pipeline com indice FAISS, dedupe, chunking, MMR, BM25 hybrid e threshold.
"""

import os
import re
import json
import time
import torch
import faiss
import logging
import hashlib
import numpy as np
from collections import OrderedDict
from sentence_transformers import SentenceTransformer

try:
    from sentence_transformers import CrossEncoder
except ImportError:
    CrossEncoder = None  # type: ignore[assignment,misc]
    logging.getLogger("higra-sigs").warning("[RAG] CrossEncoder indisponível — reranking desativado")

try:
    from rank_bm25 import BM25Okapi
except ImportError:
    BM25Okapi = None  # type: ignore[assignment,misc]
    logging.getLogger("higra-sigs").warning("[RAG] rank_bm25 indisponível — busca BM25 desativada")

logger = logging.getLogger("higra-sigs")

# --------------------------------------------------
# DEVICE
# --------------------------------------------------
if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

# --------------------------------------------------
# CONFIG
# --------------------------------------------------
EMBED_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
EMBED_DIM = 384
E5_PREFIX_QUERY = "query: "
E5_PREFIX_PASSAGE = "passage: "
MIN_CHARS = 50
CHUNK_CHARS = int(os.getenv("RAG_CHUNK_CHARS", "800"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "120"))
DEFAULT_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.35"))
DEFAULT_FETCH_K = int(os.getenv("RAG_FETCH_K", "16"))
DEFAULT_MAX_K = int(os.getenv("RAG_MAX_K", "8"))
DEFAULT_MMR_LAMBDA = float(os.getenv("RAG_MMR_LAMBDA", "0.7"))
BM25_WEIGHT = float(os.getenv("RAG_BM25_WEIGHT", "0.3"))
RERANK_MODEL = os.getenv("RAG_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
RERANK_ENABLED = os.getenv("RAG_RERANK_ENABLED", "true").lower() == "true"
NEIGHBOR_CONTEXT = os.getenv("RAG_NEIGHBOR_CONTEXT", "true").lower() == "true"
MULTI_QUERY_ENABLED = os.getenv("RAG_MULTI_QUERY", "true").lower() == "true"
QUERY_CACHE_SIZE = int(os.getenv("RAG_QUERY_CACHE_SIZE", "128"))

_model = None
_reranker = None
_index = None
_bm25 = None
_bm25_corpus = []
_documents = []  # [{text, metadata}]
_doc_hashes = set()
_query_cache = OrderedDict()
_cache_hits = 0
_cache_misses = 0
_result_cache = OrderedDict()  # {cache_key: (contexto, fontes)}
RESULT_CACHE_SIZE = int(os.getenv("RAG_RESULT_CACHE_SIZE", "64"))
_result_cache_hits = 0
_search_count = 0
_search_total_ms = 0
_search_no_results = 0
_source_hit_count = {}  # {source: count}

# --------------------------------------------------
# PATHS
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

INDEX_PATH = os.path.join(DATA_DIR, "faiss_index.bin")
DOCS_PATH = os.path.join(DATA_DIR, "documents.json")
FEEDBACK_PATH = os.path.join(DATA_DIR, "rag_feedback.json")
SEARCH_LOG_PATH = os.path.join(DATA_DIR, "rag_search_log.jsonl")
SEARCH_LOG_ENABLED = os.getenv("RAG_SEARCH_LOG", "true").lower() == "true"
SEARCH_LOG_MAX_LINES = int(os.getenv("RAG_SEARCH_LOG_MAX", "5000"))

# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def _write_search_log(entry: dict):
    """Append a search log entry to the JSONL file."""
    try:
        with open(SEARCH_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
        # Rotate if too large
        try:
            with open(SEARCH_LOG_PATH, "r", encoding="utf-8") as f:
                lines = f.readlines()
            if len(lines) > SEARCH_LOG_MAX_LINES:
                with open(SEARCH_LOG_PATH, "w", encoding="utf-8") as f:
                    f.writelines(lines[-SEARCH_LOG_MAX_LINES:])
        except Exception:
            pass
    except Exception as e:
        logger.debug(f"[RAG] Search log write error: {e}")


def get_search_logs(limit: int = 100) -> list[dict]:
    """Read recent search log entries."""
    if not os.path.exists(SEARCH_LOG_PATH):
        return []
    try:
        with open(SEARCH_LOG_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
        entries = []
        for line in lines[-limit:]:
            try:
                entries.append(json.loads(line))
            except Exception:
                pass
        return list(reversed(entries))
    except Exception:
        return []


def _load_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBED_MODEL, device=DEVICE)
    return _model


def _load_reranker():
    """Load cross-encoder model for reranking (lazy)."""
    global _reranker
    if _reranker is None and RERANK_ENABLED and CrossEncoder is not None:
        try:
            _reranker = CrossEncoder(RERANK_MODEL, device=DEVICE)
            logger.info(f"[RAG] Reranker loaded: {RERANK_MODEL}")
        except Exception as e:
            logger.warning(f"[RAG] Could not load reranker: {e}")
    return _reranker


def _rerank(query: str, candidate_docs: list[dict], candidate_scores: dict) -> list[dict]:
    """Rerank candidates using cross-encoder. Returns sorted list of (idx, score) tuples."""
    reranker = _load_reranker()
    if reranker is None or not candidate_docs:
        return candidate_docs

    pairs = [(query, doc["text"]) for doc in candidate_docs]
    try:
        ce_scores = reranker.predict(pairs)
        # Normalize cross-encoder scores to 0-1
        ce_min = float(min(ce_scores))
        ce_max = float(max(ce_scores))
        ce_range = ce_max - ce_min if ce_max > ce_min else 1.0
        for i, doc in enumerate(candidate_docs):
            ce_norm = (float(ce_scores[i]) - ce_min) / ce_range
            # Blend: 60% cross-encoder + 40% original hybrid score
            orig = candidate_scores.get(doc["_idx"], 0.0)
            doc["_rerank_score"] = 0.6 * ce_norm + 0.4 * orig
        candidate_docs.sort(key=lambda d: d["_rerank_score"], reverse=True)
    except Exception as e:
        logger.warning(f"[RAG] Rerank failed: {e}")
    return candidate_docs


# --------------------------------------------------
# QUERY EXPANSION
# --------------------------------------------------
_SYNONYMS_PT = {
    "bomba": ["bomba centrifuga", "bomba hidraulica", "equipamento de bombeamento"],
    "cavitacao": ["cavitação", "npsh", "pressao de succao", "coluna de succao"],
    "npsh": ["npsh disponivel", "npshr", "npsha", "cavitação", "succao"],
    "perda de carga": ["perda de pressao", "queda de pressao", "hf", "atrito tubulacao"],
    "vazao": ["vazão", "caudal", "q", "fluxo volumetrico"],
    "pressao": ["pressão", "p", "carga de pressao", "altura manometrica"],
    "tubulacao": ["tubulação", "tubo", "duto", "canalização"],
    "rotor": ["impelidor", "impeller", "roda", "rotor da bomba"],
    "valvula": ["válvula", "registro", "gaveta", "esfera"],
    "aeracao": ["aeração", "aerador", "oxigenacao", "transferencia de oxigenio"],
    "turbina": ["turbina hidraulica", "geracao de energia", "pch"],
    "selecao": ["seleção", "seletor", "escolha de bomba", "dimensionamento"],
}


_EN_INDICATORS = frozenset({
    "the", "is", "are", "was", "were", "what", "how", "why", "when", "where",
    "which", "can", "could", "would", "should", "does", "do", "did", "has",
    "have", "had", "will", "this", "that", "these", "those", "with", "from",
    "about", "between", "through", "during", "before", "after", "above", "below",
})


def _is_likely_english(query: str) -> bool:
    """Detect if query is likely in English (heuristic: ≥40% EN indicator words)."""
    tokens = re.findall(r'[a-záàâãéèêíóòôõúçñ]+', query.lower())
    if len(tokens) < 3:
        return False
    en_count = sum(1 for t in tokens if t in _EN_INDICATORS)
    return en_count / len(tokens) >= 0.4


def _expand_query(query: str) -> str:
    """Expand query with PT-BR synonyms for better recall. Skips if query is in English."""
    if _is_likely_english(query):
        return query
    query_lower = query.lower()
    expansions = []
    for term, synonyms in _SYNONYMS_PT.items():
        if term in query_lower:
            for syn in synonyms[:2]:
                if syn.lower() not in query_lower:
                    expansions.append(syn)
    if expansions:
        return f"{query} ({' '.join(expansions)})"
    return query


_MULTI_QUERY_PATTERNS = [
    "o que é {q}",
    "como funciona {q}",
    "qual a relação entre {q}",
    "{q} aplicação prática",
    "definição de {q}",
]


def _generate_query_variations(query: str) -> list[str]:
    """Generate query reformulations for multi-query RAG.

    Uses simple template-based approach (no API call) to create
    2 extra perspectives of the same question.
    """
    if not MULTI_QUERY_ENABLED or len(query.split()) < 3:
        return [query]

    query_lower = query.lower().strip().rstrip("?. ")
    variations = [query]

    # Extract key terms (remove stopwords for core concept)
    tokens = re.findall(r'\w+', query_lower)
    key_terms = " ".join(t for t in tokens if t not in _STOPWORDS_PT and len(t) > 2)

    if not key_terms or key_terms == query_lower:
        return [query]

    # Pick 2 diverse reformulations based on query type
    is_question = any(query_lower.startswith(w) for w in ["como", "qual", "o que", "por que", "quando", "onde"])

    if is_question:
        variations.append(key_terms)  # keyword-only version
        variations.append(f"{key_terms} explicação técnica")
    else:
        variations.append(f"o que é {key_terms}")
        variations.append(f"{key_terms} em sistemas hidráulicos")

    return variations[:3]


_STOPWORDS_PT = frozenset({
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
    "e", "eh", "ela", "elas", "ele", "eles", "em", "entre", "era", "essa",
    "essas", "esse", "esses", "esta", "estas", "este", "estes", "eu", "foi",
    "for", "ha", "isso", "isto", "ja", "la", "lhe", "lhes", "lo", "mais",
    "mas", "me", "mesmo", "meu", "minha", "muito", "na", "nao", "nas", "nem",
    "no", "nos", "nós", "num", "numa", "o", "os", "ou", "para", "pela",
    "pelas", "pelo", "pelos", "por", "qual", "quando", "que", "quem", "sao",
    "se", "sem", "ser", "seu", "sua", "suas", "seus", "so", "sobre", "também",
    "te", "tem", "ter", "tinha", "um", "uma", "umas", "uns", "voce", "você",
})


def _tokenize_for_bm25(text: str) -> list[str]:
    """Tokenizer for BM25: lowercase, split, remove PT-BR stopwords."""
    tokens = re.findall(r'\w+', text.lower())
    return [t for t in tokens if t not in _STOPWORDS_PT and len(t) > 1]


def _rebuild_bm25():
    """Rebuild the BM25 index from current documents."""
    global _bm25, _bm25_corpus
    if not _documents or BM25Okapi is None:
        _bm25 = None
        _bm25_corpus = []
        return
    _bm25_corpus = [_tokenize_for_bm25(d.get("text", "")) for d in _documents]
    _bm25 = BM25Okapi(_bm25_corpus)


def _is_e5_model():
    return "e5" in EMBED_MODEL.lower()


def _get_query_embedding(query: str):
    if not query:
        return None
    if query in _query_cache:
        global _cache_hits
        _cache_hits += 1
        vec = _query_cache.pop(query)
        _query_cache[query] = vec
        return vec
    global _cache_misses
    _cache_misses += 1
    model = _load_model()
    q = E5_PREFIX_QUERY + query if _is_e5_model() else query
    vec = model.encode([q], normalize_embeddings=True).astype("float32")
    _query_cache[query] = vec
    if len(_query_cache) > QUERY_CACHE_SIZE:
        _query_cache.popitem(last=False)
    return vec


def _encode_passages(texts: list[str]):
    """Encode document passages with appropriate prefix."""
    model = _load_model()
    if _is_e5_model():
        texts = [E5_PREFIX_PASSAGE + t for t in texts]
    return model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=64,
        show_progress_bar=False
    ).astype("float32")


def _hash_doc(text, metadata):
    meta = json.dumps(metadata or {}, sort_keys=True, ensure_ascii=False, default=str)
    payload = f"{text}|||{meta}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


PARENT_CHUNK_CHARS = int(os.getenv("RAG_PARENT_CHUNK_CHARS", "2400"))


def _chunk_text_with_parents(text):
    """Two-level chunking: small chunks for search, parent chunks for context.

    Returns list of (child_text, parent_text) tuples.
    """
    text = (text or "").strip()
    if len(text) <= CHUNK_CHARS:
        return [(text, text)]

    # First pass: create parent chunks (larger)
    parents = _chunk_text_raw(text, PARENT_CHUNK_CHARS)
    # Second pass: split each parent into child chunks (smaller)
    results = []
    for parent in parents:
        children = _chunk_text_raw(parent, CHUNK_CHARS)
        for child in children:
            results.append((child, parent))
    return results


_NOISE_PATTERNS = [
    re.compile(r'^(\d+\s*$)', re.MULTILINE),                              # só número (página)
    re.compile(r'^(página|page|pág\.?)\s*\d+', re.IGNORECASE),            # "Página 12"
    re.compile(r'^(índice|sumário|table of contents|conteúdo)\s*$', re.IGNORECASE),
    re.compile(r'^(fig\.?|figura|tabela|table)\s*\d+', re.IGNORECASE),    # legenda solta
    re.compile(r'^\s*[-–—_.·]{4,}\s*$'),                                  # linhas decorativas
    re.compile(r'^©|copyright|todos os direitos|all rights reserved', re.IGNORECASE),
    re.compile(r'^\s*(rev\.?\s*\d+|revisão\s*\d+)\s*$', re.IGNORECASE),   # "REV 05" solto
]

# Razão mínima de palavras reais vs total de tokens (filtra chunks com excesso de números/códigos)
_MIN_WORD_RATIO = 0.3


def _is_noisy_chunk(text: str) -> bool:
    """Detecta chunks com conteúdo ruidoso (índices, rodapés, cabeçalhos repetidos)."""
    stripped = text.strip()
    if not stripped:
        return True
    # Padrões de ruído
    for pat in _NOISE_PATTERNS:
        if pat.match(stripped):
            return True
    # Chunk com muitas linhas curtas (índice/sumário)
    lines = [l.strip() for l in stripped.split("\n") if l.strip()]
    if len(lines) >= 5:
        short_lines = sum(1 for l in lines if len(l) < 40)
        if short_lines / len(lines) > 0.8:
            # Quase todas as linhas são curtas — provavelmente índice
            has_dots = sum(1 for l in lines if "...." in l or "…" in l)
            has_numbers = sum(1 for l in lines if re.search(r'\d+\s*$', l))
            if has_dots > len(lines) * 0.3 or has_numbers > len(lines) * 0.5:
                return True
    # Razão de palavras reais vs tokens
    tokens = re.findall(r'\S+', stripped)
    if tokens:
        words = [t for t in tokens if re.match(r'[a-záàâãéèêíóòôõúçñ]{2,}', t, re.IGNORECASE)]
        if len(words) / len(tokens) < _MIN_WORD_RATIO:
            return True
    return False


def _chunk_text(text):
    """Chunking semântico: respeita fronteiras de frase e parágrafo."""
    return [child for child, _ in _chunk_text_with_parents(text)]


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences preserving paragraph structure."""
    # Split by paragraph first
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    if not paragraphs or len(paragraphs) <= 2:
        return [s.strip() for s in re.split(r'(?<=[.!?;:])\s+', text) if s.strip()]
    return paragraphs


def _get_sentence_overlap(sentences: list[str], max_overlap: int) -> list[str]:
    """Get trailing sentences that fit within max_overlap chars (sentence-aware overlap)."""
    overlap_sents = []
    total = 0
    for sent in reversed(sentences):
        if total + len(sent) + 1 > max_overlap:
            break
        overlap_sents.insert(0, sent)
        total += len(sent) + 1
    return overlap_sents


def _chunk_text_raw(text, max_chars=None):
    """Raw chunking at a given size with sentence-aware overlap."""
    if max_chars is None:
        max_chars = CHUNK_CHARS
    text = (text or "").strip()
    if len(text) <= max_chars:
        return [text]

    sentences = _split_sentences(text)
    if not sentences:
        return [text]

    chunks = []
    current_sents = []
    current_len = 0

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        sent_len = len(sent)

        # If adding this sentence stays under limit, append
        if current_len + sent_len + 2 <= max_chars:
            current_sents.append(sent)
            current_len += sent_len + 2
        else:
            # Flush current chunk
            if current_sents:
                chunk_text = "\n\n".join(current_sents)
                if len(chunk_text) >= MIN_CHARS:
                    chunks.append(chunk_text)
                # Sentence-aware overlap: carry trailing sentences into next chunk
                overlap_sents = _get_sentence_overlap(current_sents, CHUNK_OVERLAP)
                current_sents = list(overlap_sents)
                current_len = sum(len(s) + 2 for s in current_sents)

            # If single sentence is too long, split by character
            if sent_len > max_chars:
                step = max(1, max_chars - CHUNK_OVERLAP)
                for start in range(0, sent_len, step):
                    part = sent[start:start + max_chars].strip()
                    if part and len(part) >= MIN_CHARS:
                        chunks.append(part)
                    if start + max_chars >= sent_len:
                        break
                current_sents = []
                current_len = 0
            else:
                current_sents.append(sent)
                current_len += sent_len + 2

    if current_sents:
        chunk_text = "\n\n".join(current_sents)
        if len(chunk_text) >= MIN_CHARS:
            chunks.append(chunk_text)

    return chunks if chunks else [text]


def _build_empty_index():
    global _index, _documents, _doc_hashes, _bm25, _bm25_corpus
    _index = faiss.IndexFlatIP(EMBED_DIM)
    _documents = []
    _doc_hashes = set()
    _bm25 = None
    _bm25_corpus = []
    _query_cache.clear()
    _result_cache.clear()
    global _cache_hits, _cache_misses
    _cache_hits = 0
    _cache_misses = 0


def _rebuild_index():
    global _index, _documents, _doc_hashes

    if not _documents:
        _build_empty_index()
        return

    filtered = [d for d in _documents if len(d.get("text", "")) >= MIN_CHARS]
    _documents = filtered
    _doc_hashes = set(_hash_doc(d.get("text", ""), d.get("metadata", {})) for d in _documents)

    if not _documents:
        _build_empty_index()
        return

    texts = [d["text"] for d in _documents]
    vectors = _encode_passages(texts)

    _index = faiss.IndexFlatIP(vectors.shape[1])
    _index.add(vectors)

    _save_to_disk()
    _rebuild_bm25()
    logger.info(f"[RAG] Rebuilt index with {len(_documents)} documents")


def _rebuild_index_from_vectors(keep_indices: list[int]):
    """Rebuild FAISS index keeping only specified doc indices — no re-encoding."""
    global _index, _documents, _doc_hashes

    if not keep_indices:
        _build_empty_index()
        _save_to_disk()
        return

    old_index = _index
    vectors = np.array(
        [old_index.reconstruct(int(i)) for i in keep_indices],
        dtype="float32"
    )

    _documents = [_documents[i] for i in keep_indices]
    _doc_hashes = set(_hash_doc(d.get("text", ""), d.get("metadata", {})) for d in _documents)

    _index = faiss.IndexFlatIP(EMBED_DIM)
    _index.add(vectors)

    _save_to_disk()
    _rebuild_bm25()
    logger.info(f"[RAG] Rebuilt index (vector copy) with {len(_documents)} documents")


def _save_to_disk():
    """Persist index and documents to disk."""
    try:
        if _index is not None:
            faiss.write_index(_index, INDEX_PATH)
            logger.info(f"[RAG] FAISS salvo: {_index.ntotal} vetores -> {INDEX_PATH}")

        # Salvar documents.json com escrita atômica (temp + rename)
        tmp_path = DOCS_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(_documents, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, DOCS_PATH)

        # Log de diagnóstico
        sources = {}
        for d in _documents:
            s = d.get("metadata", {}).get("source", "?")
            sources[s] = sources.get(s, 0) + 1
        file_size = os.path.getsize(DOCS_PATH)
        logger.info(f"[RAG] documents.json salvo: {len(_documents)} chunks, {file_size} bytes, fontes: {sources}")
    except Exception as e:
        logger.error(f"[RAG] ERRO ao salvar no disco: {e}")
        raise


def _load_index():
    global _index, _documents, _doc_hashes

    if os.path.exists(INDEX_PATH) and os.path.exists(DOCS_PATH):
        _index = faiss.read_index(INDEX_PATH)
        with open(DOCS_PATH, "r", encoding="utf-8") as f:
            _documents = json.load(f)
        _doc_hashes = set(_hash_doc(d.get("text", ""), d.get("metadata", {})) for d in _documents)

        # Log de diagnóstico: quais fontes estão no index ao carregar
        sources = {}
        for d in _documents:
            s = d.get("metadata", {}).get("source", "?")
            sources[s] = sources.get(s, 0) + 1
        logger.info(f"[RAG] Index carregado: {len(_documents)} chunks, {_index.ntotal} vetores, fontes: {sources}")

        if _index.ntotal != len(_documents):
            logger.warning("[RAG] Index/documents mismatch, rebuilding index")
            _rebuild_index()
        else:
            _rebuild_bm25()
    else:
        logger.info(f"[RAG] Nenhum index encontrado em {INDEX_PATH}, criando vazio")
        _build_empty_index()


_load_index()

# --------------------------------------------------
# INDEXING
# --------------------------------------------------

def index_documents(items):
    """
    Accepts:
    - list[str]
    - list[{text, metadata}]
    """
    global _documents, _doc_hashes, _index

    if not items:
        return

    normalized = []
    for item in items:
        if isinstance(item, str):
            normalized.append({"text": item.strip(), "metadata": {}})
        elif isinstance(item, dict) and "text" in item:
            normalized.append({"text": (item.get("text") or "").strip(), "metadata": item.get("metadata", {})})

    if not normalized:
        return

    documents = []
    for doc in normalized:
        text = doc.get("text", "").strip()
        if not text:
            continue
        chunk_pairs = _chunk_text_with_parents(text)
        for idx, (child, parent) in enumerate(chunk_pairs):
            if len(child) < MIN_CHARS or _is_noisy_chunk(child):
                continue
            metadata = dict(doc.get("metadata", {}) or {})
            metadata.setdefault("chunk_index", idx)
            metadata.setdefault("chunk_total", len(chunk_pairs))
            # Store parent text if different from child (for recursive retrieval)
            if parent != child and len(parent) > len(child):
                metadata["parent_text"] = parent
            doc_hash = _hash_doc(child, metadata)
            if doc_hash in _doc_hashes:
                continue
            documents.append({"text": child, "metadata": metadata})
            _doc_hashes.add(doc_hash)

    if not documents:
        return

    texts = [d["text"] for d in documents]
    vectors = _encode_passages(texts)

    if _index is None or _index.ntotal == 0:
        _index = faiss.IndexFlatIP(vectors.shape[1])

    _index.add(vectors)
    _documents.extend(documents)

    _save_to_disk()
    _rebuild_bm25()
    _result_cache.clear()
    logger.info(f"[RAG] Indexed {len(documents)} documents")


# --------------------------------------------------
# SEARCH
# --------------------------------------------------

def _mmr_select(candidate_indices, candidate_scores, k, mmr_lambda):
    if not candidate_indices:
        return []

    candidate_indices = [int(i) for i in candidate_indices]

    selected = []
    selected_set = set()

    # Preload candidate vectors
    candidate_vecs = {}
    for idx in candidate_indices:
        candidate_vecs[idx] = _index.reconstruct(int(idx))

    # Start with best score
    best_idx = candidate_indices[0]
    selected.append(best_idx)
    selected_set.add(best_idx)

    while len(selected) < k and len(selected) < len(candidate_indices):
        best = None
        best_score = -1e9

        for idx in candidate_indices:
            if idx in selected_set:
                continue
            sim_to_query = float(candidate_scores[idx])
            max_sim_to_selected = 0.0
            for sidx in selected:
                max_sim_to_selected = max(
                    max_sim_to_selected,
                    float(np.dot(candidate_vecs[idx], candidate_vecs[sidx]))
                )
            mmr_score = mmr_lambda * sim_to_query - (1.0 - mmr_lambda) * max_sim_to_selected
            if mmr_score > best_score:
                best_score = mmr_score
                best = idx

        if best is None:
            break

        selected.append(best)
        selected_set.add(best)

    return selected


CONTEXT_COMPRESS_ENABLED = os.getenv("RAG_CONTEXT_COMPRESS", "true").lower() == "true"
CONTEXT_MAX_CHARS = int(os.getenv("RAG_CONTEXT_MAX_CHARS", "1200"))


def _compress_context(text: str, query: str) -> str:
    """Extract the most relevant sentences from a chunk to save LLM tokens.

    Only compresses if text exceeds CONTEXT_MAX_CHARS.
    Scores sentences by keyword overlap with the query.
    """
    if not CONTEXT_COMPRESS_ENABLED or len(text) <= CONTEXT_MAX_CHARS:
        return text

    # Split into sentences
    sentences = re.split(r'(?<=[.!?;:\n])\s+', text)
    if len(sentences) <= 3:
        return text

    # Score each sentence by keyword overlap with query
    query_tokens = set(_tokenize_for_bm25(query))
    scored = []
    for i, sent in enumerate(sentences):
        sent = sent.strip()
        if not sent:
            continue
        sent_tokens = set(_tokenize_for_bm25(sent))
        overlap = len(query_tokens & sent_tokens)
        # Bonus for position: first and last sentences are often important
        position_bonus = 0.5 if i == 0 or i == len(sentences) - 1 else 0
        scored.append((i, sent, overlap + position_bonus))

    # Sort by relevance, keep top sentences that fit within budget
    scored.sort(key=lambda x: x[2], reverse=True)
    selected = []
    total_len = 0
    for i, sent, score in scored:
        if total_len + len(sent) + 2 > CONTEXT_MAX_CHARS:
            break
        selected.append((i, sent))
        total_len += len(sent) + 2

    # Re-order by original position for coherence
    selected.sort(key=lambda x: x[0])
    compressed = " ".join(s for _, s in selected)

    if len(compressed) < len(text) * 0.9:
        return compressed + " [...]"
    return text


def _get_neighbor_context(idx: int, max_chars: int = 300) -> str:
    """Get abbreviated context from neighboring chunks of the same source."""
    if not NEIGHBOR_CONTEXT or idx < 0 or idx >= len(_documents):
        return ""
    doc = _documents[idx]
    source = doc.get("metadata", {}).get("source", "")
    if not source:
        return ""

    parts = []
    # Check previous chunk (same source)
    if idx > 0:
        prev = _documents[idx - 1]
        if prev.get("metadata", {}).get("source") == source:
            prev_text = prev.get("text", "").strip()
            if prev_text:
                snippet = prev_text[-max_chars:].strip()
                if len(prev_text) > max_chars:
                    snippet = "..." + snippet
                parts.append(f"[Contexto anterior] {snippet}")
    # Check next chunk (same source)
    if idx < len(_documents) - 1:
        nxt = _documents[idx + 1]
        if nxt.get("metadata", {}).get("source") == source:
            nxt_text = nxt.get("text", "").strip()
            if nxt_text:
                snippet = nxt_text[:max_chars].strip()
                if len(nxt_text) > max_chars:
                    snippet = snippet + "..."
                parts.append(f"[Contexto seguinte] {snippet}")
    return "\n".join(parts)


def _calibrate_confidence(score: float, has_rerank: bool) -> int:
    """Convert raw hybrid score to calibrated confidence percentage (0-100).

    Maps score ranges to meaningful confidence levels:
    - 0.80+ → 90-100% (excellent match)
    - 0.60-0.80 → 70-89% (good match)
    - 0.40-0.60 → 45-69% (moderate match)
    - 0.20-0.40 → 20-44% (weak match)
    - <0.20 → 5-19% (very weak)
    """
    if score >= 0.80:
        pct = 90 + (score - 0.80) / 0.20 * 10
    elif score >= 0.60:
        pct = 70 + (score - 0.60) / 0.20 * 19
    elif score >= 0.40:
        pct = 45 + (score - 0.40) / 0.20 * 24
    elif score >= 0.20:
        pct = 20 + (score - 0.20) / 0.20 * 24
    else:
        pct = max(5, score / 0.20 * 19)
    # Reranked results get a small confidence boost
    if has_rerank:
        pct = min(100, pct + 3)
    return min(100, max(0, int(round(pct))))


FALLBACK_ENABLED = os.getenv("RAG_FALLBACK_ENABLED", "true").lower() == "true"


def buscar_contexto_relevante_com_fontes(query: str, k: int = 3, min_score: float = DEFAULT_MIN_SCORE,
                                         fetch_k: int | None = None, mmr_lambda: float | None = DEFAULT_MMR_LAMBDA,
                                         metadata_filter: dict | None = None):
    if _index is None or _index.ntotal == 0 or not query:
        return "", []

    # Result cache: avoid full reprocessing for repeated queries
    global _result_cache_hits
    filter_key = json.dumps(metadata_filter, sort_keys=True) if metadata_filter else ""
    cache_key = f"{query}|{k}|{filter_key}"
    if cache_key in _result_cache:
        _result_cache_hits += 1
        result = _result_cache.pop(cache_key)
        _result_cache[cache_key] = result  # Move to end (LRU)
        return result

    # Dynamic K: request up to DEFAULT_MAX_K but only return those above threshold
    k = min(k, DEFAULT_MAX_K)
    start_ts = time.perf_counter()
    fetch_k = fetch_k or max(DEFAULT_FETCH_K, k * 4)

    # Multi-query: generate variations for broader recall
    query_variations = _generate_query_variations(query)

    # Search with each query variation and merge via reciprocal rank fusion
    rrf_scores = {}  # {idx: accumulated_rrf_score}
    RRF_K = 60  # RRF constant

    t0 = time.perf_counter()
    for q_var in query_variations:
        expanded = _expand_query(q_var)
        q_vec = _get_query_embedding(expanded)
        if q_vec is None:
            continue
        D_var, I_var = _index.search(q_vec, fetch_k)
        for rank, (score, idx) in enumerate(zip(D_var[0], I_var[0])):
            idx_int = int(idx)
            if idx_int < 0 or idx_int >= len(_documents):
                continue
            if float(score) < min_score * 0.5:  # loose pre-filter
                continue
            rrf_scores[idx_int] = rrf_scores.get(idx_int, 0) + 1.0 / (RRF_K + rank + 1)
    t1 = time.perf_counter()
    t2 = t1  # search included in multi-query loop

    # BM25 scores for hybrid fusion (use primary expanded query)
    expanded_query = _expand_query(query)
    bm25_scores = {}
    if _bm25 is not None and BM25_WEIGHT > 0:
        query_tokens = _tokenize_for_bm25(expanded_query)
        raw_bm25 = _bm25.get_scores(query_tokens)
        # Normalize BM25 scores to 0-1 range
        bm25_max = raw_bm25.max() if raw_bm25.max() > 0 else 1.0
        for i, s in enumerate(raw_bm25):
            if s > 0:
                bm25_scores[i] = float(s / bm25_max)

    candidates = []
    score_map = {}
    below_threshold = []  # For fallback: best candidates that didn't pass threshold

    # Normalize RRF scores to 0-1
    rrf_max = max(rrf_scores.values()) if rrf_scores else 1.0
    for idx_int, rrf_raw in rrf_scores.items():
        # Hybrid: RRF (multi-query semantic) + BM25
        rrf_norm = rrf_raw / rrf_max if rrf_max > 0 else 0
        bm25_score = bm25_scores.get(idx_int, 0.0)
        hybrid_score = (1 - BM25_WEIGHT) * rrf_norm + BM25_WEIGHT * bm25_score
        doc = _documents[idx_int]
        # Apply feedback boost
        src = doc.get("metadata", {}).get("source", "")
        hybrid_score += get_source_boost(src)
        if metadata_filter:
            meta = doc.get("metadata", {})
            if any(meta.get(kf) != vf for kf, vf in metadata_filter.items()):
                continue
        if hybrid_score < min_score:
            below_threshold.append((idx_int, hybrid_score))
            continue
        candidates.append(idx_int)
        score_map[idx_int] = hybrid_score

    # Add top BM25-only candidates that FAISS may have missed
    if _bm25 is not None and BM25_WEIGHT > 0:
        existing = set(candidates)
        bm25_top = sorted(bm25_scores.items(), key=lambda x: x[1], reverse=True)[:fetch_k]
        for idx_int, bm25_s in bm25_top:
            if idx_int in existing or idx_int >= len(_documents):
                continue
            if bm25_s < 0.5:  # only add strong BM25 matches
                continue
            doc = _documents[idx_int]
            if metadata_filter:
                meta = doc.get("metadata", {})
                if any(meta.get(kf) != vf for kf, vf in metadata_filter.items()):
                    continue
            candidates.append(idx_int)
            score_map[idx_int] = BM25_WEIGHT * bm25_s

    # Fallback: if no candidates pass threshold, return top-1 below threshold with low-confidence flag
    is_fallback = False
    if not candidates and FALLBACK_ENABLED and below_threshold:
        below_threshold.sort(key=lambda x: x[1], reverse=True)
        best_idx, best_score = below_threshold[0]
        if best_score >= min_score * 0.4:  # only fallback if not completely irrelevant
            candidates.append(best_idx)
            score_map[best_idx] = best_score
            is_fallback = True
            logger.info(f"[RAG] Fallback: returning top-1 below threshold (score={best_score:.3f})")

    if not candidates:
        return "", []

    candidates.sort(key=lambda i: score_map[i], reverse=True)

    if mmr_lambda is None:
        selected = candidates[:k]
    else:
        t3 = time.perf_counter()
        selected = _mmr_select(candidates, score_map, k, mmr_lambda)
        t4 = time.perf_counter()

    # Cross-encoder reranking
    used_rerank = False
    if RERANK_ENABLED and len(selected) > 1:
        rerank_docs = []
        for idx in selected:
            doc = dict(_documents[idx])
            doc["_idx"] = idx
            rerank_docs.append(doc)
        rerank_docs = _rerank(query, rerank_docs, score_map)
        selected = [d["_idx"] for d in rerank_docs]
        # Update scores from reranker
        for d in rerank_docs:
            if "_rerank_score" in d:
                score_map[d["_idx"]] = d["_rerank_score"]
        used_rerank = True

    blocos = []
    fontes = []
    seen = set()
    for idx in selected:
        doc = _documents[idx]
        # Recursive retrieval: prefer parent_text for richer context
        meta = doc.get("metadata", {}) or {}
        texto_raw = meta.get("parent_text", doc.get("text", "")).strip()
        if not texto_raw or texto_raw in seen:
            continue
        seen.add(texto_raw)
        texto = _compress_context(texto_raw, query)
        fonte = meta.get("source") or meta.get("source_file") or "desconhecida"
        raw_score = score_map.get(idx, 0.0)
        confidence = _calibrate_confidence(raw_score, used_rerank)
        fonte_info = {
            "id": idx,
            "score": raw_score,
            "confidence": confidence,
            "source": fonte,
            "category": meta.get("category"),
            "page": meta.get("page"),
        }
        if is_fallback:
            fonte_info["low_confidence"] = True
        if meta.get("display_name"):
            fonte_info["display_name"] = meta["display_name"]
        fontes.append(fonte_info)
        label_fonte = meta.get("display_name") or (fonte if fonte != "desconhecida" else "")
        label_pagina = f" | Página {meta.get('page')}" if meta.get("page") else ""
        label_conf = f" | Confiança: {confidence}%"
        header = f"[Fonte: {label_fonte}{label_pagina}{label_conf}]" if label_fonte else ""
        if is_fallback and header:
            header = header.rstrip("]") + " | ⚠ Baixa confiança]"
        neighbor = _get_neighbor_context(idx)
        block = f"{header}\n{texto}" if header else texto
        if neighbor:
            block += f"\n{neighbor}"
        blocos.append(block)

    elapsed_ms = int((time.perf_counter() - start_ts) * 1000)
    encode_ms = int((t1 - t0) * 1000)
    search_ms = int((t2 - t1) * 1000)
    mmr_ms = int((t4 - t3) * 1000) if mmr_lambda is not None else 0
    logger.info(
        f"[RAG] selected={len(fontes)} elapsed_ms={elapsed_ms} encode_ms={encode_ms} "
        f"search_ms={search_ms} mmr_ms={mmr_ms} fallback={is_fallback} sources={fontes}"
    )

    # Structured search log (JSONL)
    if SEARCH_LOG_ENABLED:
        _write_search_log({
            "ts": time.time(),
            "query": query,
            "query_variations": len(query_variations),
            "results": len(fontes),
            "elapsed_ms": elapsed_ms,
            "top_score": round(fontes[0]["score"], 3) if fontes else 0,
            "top_confidence": fontes[0].get("confidence", 0) if fontes else 0,
            "fallback": is_fallback,
            "sources": [f.get("source", "") for f in fontes],
            "filter": metadata_filter,
        })

    # Analytics tracking
    global _search_count, _search_total_ms, _search_no_results
    _search_count += 1
    _search_total_ms += elapsed_ms
    if not fontes:
        _search_no_results += 1
    for f in fontes:
        src = f.get("source", "")
        if src:
            _source_hit_count[src] = _source_hit_count.get(src, 0) + 1

    result = ("\n\n".join(blocos), fontes)

    # Store in result cache
    _result_cache[cache_key] = result
    if len(_result_cache) > RESULT_CACHE_SIZE:
        _result_cache.popitem(last=False)

    return result


def buscar_contexto_relevante(query: str, k: int = 3, min_score: float = DEFAULT_MIN_SCORE,
                              fetch_k: int | None = None, mmr_lambda: float | None = DEFAULT_MMR_LAMBDA,
                              metadata_filter: dict | None = None) -> str:
    contexto, _ = buscar_contexto_relevante_com_fontes(
        query,
        k=k,
        min_score=min_score,
        fetch_k=fetch_k,
        mmr_lambda=mmr_lambda,
        metadata_filter=metadata_filter
    )
    return contexto


# --------------------------------------------------
# CATEGORY SEARCH
# --------------------------------------------------

def buscar_contexto_por_categoria(category: str) -> str:
    if not _documents:
        return ""

    textos = []
    for doc in _documents:
        meta = doc.get("metadata", {})
        if meta.get("category") == category:
            texto = doc.get("text", "").strip()
            if texto:
                textos.append(texto)

    logger.info(
        f"[RAG] Category search '{category}' returned {len(textos)} documents"
    )

    return "\n\n".join(textos)


# --------------------------------------------------
# ADMIN / STATS
# --------------------------------------------------

def get_index_stats():
    total = _index.ntotal if _index is not None else 0
    docs = len(_documents)
    hits = _cache_hits
    misses = _cache_misses
    total_q = hits + misses
    return {
        "documents": docs,
        "index_total": total,
        "mismatch": total != docs,
        "cache_hits": hits,
        "cache_misses": misses,
        "cache_hit_rate": (hits / total_q) if total_q else 0.0
    }


def get_analytics():
    """Return RAG usage analytics."""
    avg_ms = (_search_total_ms / _search_count) if _search_count else 0
    top_sources = sorted(_source_hit_count.items(), key=lambda x: x[1], reverse=True)[:10]
    return {
        "search_count": _search_count,
        "search_avg_ms": round(avg_ms, 1),
        "search_no_results": _search_no_results,
        "no_result_rate": round((_search_no_results / _search_count * 100) if _search_count else 0, 1),
        "result_cache_hits": _result_cache_hits,
        "result_cache_size": len(_result_cache),
        "top_sources": [{"source": s, "hits": c} for s, c in top_sources],
        "feedback_boosts": dict(sorted(_source_boosts.items(), key=lambda x: x[1], reverse=True)[:10]),
        **get_index_stats(),
    }


def deduplicate_index(threshold: float = 0.95):
    """Remove semantically duplicate chunks (cosine similarity > threshold).

    Returns count of removed duplicates.
    """
    global _index, _documents, _doc_hashes
    if _index is None or _index.ntotal < 2:
        return 0

    n = _index.ntotal
    keep = set(range(n))
    removed = 0

    # Compare each vector against all others
    for i in range(n):
        if i not in keep:
            continue
        vec_i = _index.reconstruct(i).reshape(1, -1)
        D, I = _index.search(vec_i, min(20, n))
        for score, j in zip(D[0], I[0]):
            j = int(j)
            if j <= i or j not in keep:
                continue
            if float(score) >= threshold:
                # Same source? Remove the shorter chunk
                src_i = _documents[i].get("metadata", {}).get("source", "")
                src_j = _documents[j].get("metadata", {}).get("source", "")
                if src_i == src_j:
                    keep.discard(j)
                    removed += 1

    if removed > 0:
        keep_list = sorted(keep)
        _rebuild_index_from_vectors(keep_list)
        logger.info(f"[RAG] Deduplication: removed {removed} near-duplicate chunks")
    return removed


def validate_index() -> bool:
    stats = get_index_stats()
    return not stats["mismatch"]


def rebuild_index():
    _rebuild_index()
    return get_index_stats()


def list_sources():
    """Lista todas as fontes (source) indexadas com contagem de chunks."""
    sources = {}
    for doc in _documents:
        meta = doc.get("metadata", {})
        src = meta.get("source", "desconhecido")
        doc_type = meta.get("type", "desconhecido")
        category = meta.get("category", "")
        display_name = meta.get("display_name", "")
        if src not in sources:
            sources[src] = {"source": src, "type": doc_type, "category": category, "chunks": 0}
            if display_name:
                sources[src]["display_name"] = display_name
        sources[src]["chunks"] += 1
    return sorted(sources.values(), key=lambda x: x.get("display_name") or x["source"])


def update_source_display_name(source_name: str, display_name: str):
    """Atualiza o display_name de todos os chunks de uma fonte (sem re-encoding)."""
    updated = 0
    for doc in _documents:
        if doc.get("metadata", {}).get("source") == source_name:
            if display_name:
                doc["metadata"]["display_name"] = display_name
            else:
                doc["metadata"].pop("display_name", None)
            updated += 1
    if updated > 0:
        _save_to_disk()
        _rebuild_bm25()
        _result_cache.clear()
        logger.info(f"[RAG] Updated display_name for {updated} chunks of '{source_name}' -> '{display_name}'")
    return {"updated": updated}


def remove_source(source_name: str):
    """Remove todos os chunks de uma fonte e reconstroi o índice (sem re-encoding)."""
    global _documents

    # Log das fontes antes da remoção
    sources_before = {}
    for d in _documents:
        s = d.get("metadata", {}).get("source", "?")
        sources_before[s] = sources_before.get(s, 0) + 1
    logger.info(f"[RAG] remove_source('{source_name}') | antes: {sources_before}")

    import unicodedata
    norm = lambda s: unicodedata.normalize("NFC", (s or "").strip())
    target = norm(source_name)

    keep_indices = [
        i for i, d in enumerate(_documents)
        if norm(d.get("metadata", {}).get("source", "")) != target
    ]
    removed = len(_documents) - len(keep_indices)
    if removed > 0:
        _rebuild_index_from_vectors(keep_indices)
        _result_cache.clear()
        _query_cache.clear()
        logger.info(f"[RAG] Removed {removed} chunks, restam {len(_documents)} chunks")
    else:
        logger.warning(f"[RAG] Nenhum chunk encontrado com source='{source_name}'")

    # Verificar persistência: reler do disco para confirmar
    try:
        with open(DOCS_PATH, "r", encoding="utf-8") as f:
            disk_docs = json.load(f)
        disk_sources = {}
        for d in disk_docs:
            s = d.get("metadata", {}).get("source", "?")
            disk_sources[s] = disk_sources.get(s, 0) + 1
        logger.info(f"[RAG] Verificação disco: {len(disk_docs)} chunks, fontes: {disk_sources}")
    except Exception as e:
        logger.warning(f"[RAG] Erro ao verificar disco: {e}")

    return {"removed": removed, "stats": get_index_stats()}


# --------------------------------------------------
# FEEDBACK TRACKING
# --------------------------------------------------
_source_boosts = {}  # {source: boost_score}


FEEDBACK_HALF_LIFE_DAYS = float(os.getenv("RAG_FEEDBACK_HALF_LIFE", "30"))


def _load_feedback():
    """Load feedback data and compute source boosts with exponential time decay."""
    global _source_boosts
    if not os.path.exists(FEEDBACK_PATH):
        return
    try:
        with open(FEEDBACK_PATH, "r", encoding="utf-8") as f:
            entries = json.load(f)
        boosts = {}
        now = time.time()
        decay_lambda = 0.693 / (FEEDBACK_HALF_LIFE_DAYS * 86400)  # ln(2) / half_life_seconds
        for entry in entries:
            age_seconds = now - entry.get("ts", now)
            weight = 2.718 ** (-decay_lambda * max(0, age_seconds))  # e^(-λt)
            for src in entry.get("sources", []):
                if entry.get("type") == "like":
                    boosts[src] = boosts.get(src, 0) + 1.0 * weight
                elif entry.get("type") == "dislike":
                    boosts[src] = boosts.get(src, 0) - 0.5 * weight
        _source_boosts = boosts
        logger.info(f"[RAG] Loaded feedback boosts for {len(boosts)} sources (half-life={FEEDBACK_HALF_LIFE_DAYS}d)")
    except Exception as e:
        logger.warning(f"[RAG] Could not load feedback: {e}")


def record_feedback(feedback_type: str, sources: list[str], query: str = ""):
    """Record user feedback (like/dislike) for source relevance tracking."""
    entry = {
        "type": feedback_type,
        "sources": sources,
        "query": query,
        "ts": time.time(),
    }
    try:
        entries = []
        if os.path.exists(FEEDBACK_PATH):
            with open(FEEDBACK_PATH, "r", encoding="utf-8") as f:
                entries = json.load(f)
        entries.append(entry)
        # Keep last 1000 entries
        entries = entries[-1000:]
        with open(FEEDBACK_PATH, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        _load_feedback()
        _result_cache.clear()  # Invalidar cache — boosts mudaram
        logger.info(f"[RAG] Recorded {feedback_type} feedback for sources: {sources}")
    except Exception as e:
        logger.warning(f"[RAG] Could not save feedback: {e}")
    return {"status": "ok"}


def get_source_boost(source: str) -> float:
    """Get boost factor for a source based on feedback history."""
    boost = _source_boosts.get(source, 0)
    # Clamp to small range: -0.05 to +0.1
    return max(-0.05, min(0.1, boost * 0.02))


_load_feedback()


def export_index() -> str:
    """Export index + documents as a zip file. Returns path to zip."""
    import zipfile
    import tempfile
    export_path = os.path.join(DATA_DIR, "rag_export.zip")
    with zipfile.ZipFile(export_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if os.path.exists(INDEX_PATH):
            zf.write(INDEX_PATH, "faiss_index.bin")
        if os.path.exists(DOCS_PATH):
            zf.write(DOCS_PATH, "documents.json")
        if os.path.exists(FEEDBACK_PATH):
            zf.write(FEEDBACK_PATH, "rag_feedback.json")
    logger.info(f"[RAG] Exported index to {export_path}")
    return export_path


def import_index(zip_path: str):
    """Import index + documents from a zip file."""
    import zipfile
    global _index, _documents, _doc_hashes
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(DATA_DIR)
    _load_index()
    logger.info(f"[RAG] Imported index: {len(_documents)} documents")
    return get_index_stats()


def warmup():
    """Pre-load all models and warm caches on startup."""
    t0 = time.perf_counter()
    _load_model()
    logger.info("[RAG] Warmup: embedding model loaded")

    # Load reranker eagerly (normally lazy)
    if RERANK_ENABLED:
        _load_reranker()
        logger.info("[RAG] Warmup: reranker loaded")

    # Warm the embedding cache with a test query
    if _index is not None and _index.ntotal > 0:
        _get_query_embedding("warmup bomba hidraulica perda de carga")
        # Run a full test search to warm all code paths
        try:
            buscar_contexto_relevante("teste warmup sistema hidraulico", k=2)
            logger.info("[RAG] Warmup: test search completed")
        except Exception:
            pass

    elapsed = int((time.perf_counter() - t0) * 1000)
    logger.info(f"[RAG] Warmup completo em {elapsed}ms — index={_index.ntotal if _index else 0} docs")


# Alias de compatibilidade
index_document = index_documents
