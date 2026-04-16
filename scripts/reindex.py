"""
HIGRA SIGS — RE-INDEXAÇÃO COMPLETA
Re-codifica todos os documentos existentes com o modelo de embedding atual.
Útil após trocar o modelo (ex: MiniLM → multilingual-e5-small).

Uso:
    python scripts/reindex.py
    python scripts/reindex.py --dry-run   # apenas mostra o que faria
"""

import os
import sys
import json
import argparse
import gc

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from backend.services.rag_pipeline import (
    _documents, _rebuild_index, _build_empty_index, _save_to_disk,
    _load_model, EMBED_MODEL, DATA_DIR, DOCS_PATH, INDEX_PATH,
)


def main():
    parser = argparse.ArgumentParser(description="Re-indexar documentos RAG com modelo atual")
    parser.add_argument("--dry-run", action="store_true", help="Apenas mostra estatísticas sem re-indexar")
    parser.add_argument("--backup", action="store_true", default=True, help="Criar backup antes (padrão: sim)")
    args = parser.parse_args()

    print(f"HIGRA SIGS — RE-INDEXAÇÃO")
    print(f"Modelo: {EMBED_MODEL}")
    print(f"Documentos carregados: {len(_documents)}")
    print("=" * 60)

    if not _documents:
        print("Nenhum documento para re-indexar.")
        return

    # Estatísticas
    sources = {}
    for doc in _documents:
        src = doc.get("metadata", {}).get("source", "desconhecido")
        sources[src] = sources.get(src, 0) + 1

    print(f"\nFontes ({len(sources)}):")
    for src, count in sorted(sources.items()):
        print(f"  {src}: {count} chunks")

    if args.dry_run:
        print("\n[DRY RUN] Nenhuma alteração feita.")
        return

    # Backup
    if args.backup:
        import shutil
        if os.path.exists(INDEX_PATH):
            backup_idx = INDEX_PATH + ".bak"
            shutil.copy2(INDEX_PATH, backup_idx)
            print(f"\nBackup: {backup_idx}")
        if os.path.exists(DOCS_PATH):
            backup_docs = DOCS_PATH + ".bak"
            shutil.copy2(DOCS_PATH, backup_docs)
            print(f"Backup: {backup_docs}")

    # Forçar carregamento do modelo
    print(f"\nCarregando modelo {EMBED_MODEL}...")
    _load_model()

    # Re-indexar (re-encode todos os vetores)
    print("Re-codificando todos os documentos...")
    _rebuild_index()

    gc.collect()
    print(f"\nRe-indexação concluída! {len(_documents)} documentos re-codificados.")
    print("=" * 60)


if __name__ == "__main__":
    main()
