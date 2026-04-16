# scripts/rebuild_rag.py
"""
Apaga todo o índice RAG e prepara para reindexar do zero
Funciona no Mac mesmo rodando da pasta scripts!
"""

import os
import sys

# Adiciona o diretório raiz do projeto ao Python path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# Agora pode importar do backend
from backend.services.rag_pipeline import INDEX_PATH, DOCS_PATH

print("HIGRA SIGS — LIMPANDO ÍNDICE RAG")

deleted = False

if os.path.exists(INDEX_PATH):
    os.remove(INDEX_PATH)
    print(f"✓ Apagado: {INDEX_PATH}")
    deleted = True

if os.path.exists(DOCS_PATH):
    os.remove(DOCS_PATH)
    print(f"✓ Apagado: {DOCS_PATH}")
    deleted = True

if not deleted:
    print("⚠️  Nenhum arquivo de índice encontrado — já estava limpo!")

print("\n" + "="*60)
print("   ÍNDICE RAG ZERADO COM SUCESSO!")
print("   Agora rode:")
print("   python scripts/index_upload.py")
print("   para reindexar todos os PDFs da pasta 'uploads'")
print("="*60 + "\n")