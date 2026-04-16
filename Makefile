.PHONY: test lint clean

PYTHON ?= python

# Roda todos os testes com pytest
test:
	$(PYTHON) -m pytest

# Validação básica sem depender de ferramentas extras
lint:
	$(PYTHON) -m compileall -q -x "backend[\\\\/](venv|__pycache__)" backend
	$(PYTHON) -m pytest --collect-only backend/tests -q

# Limpa caches do pytest e __pycache__ de forma portável
clean:
	$(PYTHON) -c "from pathlib import Path; import shutil; [shutil.rmtree(path, ignore_errors=True) for pattern in ('**/__pycache__', '**/.pytest_cache') for path in Path('.').glob(pattern)]"
