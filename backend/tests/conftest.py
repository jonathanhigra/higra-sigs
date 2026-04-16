import importlib

import pytest
from fastapi.testclient import TestClient


def load_main_app(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "n8n")
    monkeypatch.setenv("RAG_WARMUP_BLOCKING", "0")
    main = importlib.import_module("backend.main")
    monkeypatch.setattr(main, "_database_available", lambda: False)
    monkeypatch.setattr(main, "_run_rag_warmup_safe", lambda: None)
    return main


@pytest.fixture
def main_module(monkeypatch):
    return load_main_app(monkeypatch)


@pytest.fixture
def client(main_module):
    with TestClient(main_module.app) as test_client:
        yield test_client
    main_module.app.dependency_overrides.clear()


@pytest.fixture
def allow_route_auth(main_module):
    def _allow(path: str, method: str = "POST"):
        route = next(
            r for r in main_module.app.routes
            if getattr(r, "path", None) == path and method.upper() in getattr(r, "methods", set())
        )
        for dep in route.dependant.dependencies:
            main_module.app.dependency_overrides[dep.call] = lambda: 1

    return _allow
