# scripts/rebuild_and_index_rag.py
"""
Zera o indice RAG e reindexa todos os PDFs/JSONs da pasta uploads.
"""

import os
import sys
import runpy

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

print("HIGRA SIGS - REBUILD + INDEX RAG")
print("=" * 60)

runpy.run_path(os.path.join(PROJECT_ROOT, "scripts", "rebuild_rag.py"), run_name="__main__")
runpy.run_path(os.path.join(PROJECT_ROOT, "scripts", "index_upload.py"), run_name="__main__")
