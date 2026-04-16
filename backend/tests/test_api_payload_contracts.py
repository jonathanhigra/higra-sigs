from backend.routes.fabricacao import checklists as checklists_module
from backend.routes.planos_acao import plano_features as plano_features_module
from backend.routes.projetos import projetos as projetos_module
from backend.routes.qualidade import rq03 as rq03_module
from backend.routes.tarefas import tarefas as tarefas_module


class StubCursor:
    def __init__(self, fetchone_values=None):
        self.fetchone_values = list(fetchone_values or [])
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        if self.fetchone_values:
            return self.fetchone_values.pop(0)
        return None

    def fetchall(self):
        return []

    def close(self):
        return None


class StubConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False
        self.rolled_back = False

    def cursor(self, *args, **kwargs):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        return None


def test_create_tarefa_contract_accepts_valid_payload(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/tarefas/")
    cursor = StubCursor([{"id": 10, "titulo": "Nova tarefa"}])
    conn = StubConnection(cursor)
    monkeypatch.setattr(tarefas_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        tarefas_module,
        "get_user_tipo",
        lambda _user_id: {"sth_cad_empresa_id": 1, "sth_cad_filial_id": 2},
    )
    monkeypatch.setattr(tarefas_module, "notify_tarefa_atribuida", lambda *args, **kwargs: None)

    response = client.post("/api/tarefas/", json={"titulo": "Nova tarefa", "prioridade": "media"})

    assert response.status_code == 201
    assert response.json()["id"] == 10
    insert_params = cursor.executed[-1][1]
    assert insert_params[0] == "Nova tarefa"
    assert insert_params[5] == "MEDIA"
    assert insert_params[11] == 1
    assert insert_params[12] == 2
    assert conn.committed is True


def test_create_projeto_contract_accepts_valid_payload(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/projetos/")
    cursor = StubCursor([{"id": 21, "titulo": "Projeto piloto", "objetivo": "Padronizar"}])
    conn = StubConnection(cursor)
    monkeypatch.setattr(projetos_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        projetos_module,
        "get_user_tipo",
        lambda _user_id: {"sth_cad_empresa_id": 3, "sth_cad_filial_id": 4},
    )

    response = client.post(
        "/api/projetos/",
        json={"titulo": "Projeto piloto", "objetivo": "Padronizar", "prioridade": "alta"},
    )

    assert response.status_code == 201
    assert response.json()["id"] == 21
    insert_params = cursor.executed[-1][1]
    assert insert_params[0] == "Projeto piloto"
    assert insert_params[3] == "Padronizar"
    assert insert_params[5] == "ALTA"
    assert insert_params[12] == 3
    assert insert_params[13] == 4
    assert conn.committed is True


def test_create_rq03_contract_accepts_valid_payload(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/qualidade/rq03/")
    cursor = StubCursor([
        {"prox": 7},
        {"id": 7, "codigo": "7", "descricao": "Nao conformidade"},
    ])
    conn = StubConnection(cursor)
    monkeypatch.setattr(rq03_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        rq03_module,
        "get_user_tipo",
        lambda _user_id: {"sth_cad_empresa_id": 5, "sth_cad_filial_id": 6},
    )
    monkeypatch.setattr(rq03_module, "notify_rnc_aberta", lambda *args, **kwargs: None)

    response = client.post(
        "/api/qualidade/rq03/",
        json={"descricao": "Nao conformidade", "tipo": "s", "prioridade": "baixa"},
    )

    assert response.status_code == 201
    assert response.json()["id"] == 7
    insert_params = cursor.executed[-1][1]
    assert insert_params[0] == "7"
    assert insert_params[2] == "Nao conformidade"
    assert insert_params[4] == "BAIXA"
    assert insert_params[5] == "S"
    assert insert_params[8] == 5
    assert insert_params[9] == 6
    assert conn.committed is True


def test_create_checklist_contract_accepts_valid_payload(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/fabricacao/")
    cursor = StubCursor([{"id": 30, "pv": "PV-001"}])
    conn = StubConnection(cursor)
    monkeypatch.setattr(checklists_module, "get_db_connection", lambda: conn)

    response = client.post("/api/fabricacao/", json={"pv": "PV-001", "cliente": "Higra"})

    assert response.status_code == 201
    assert response.json()["id"] == 30
    insert_params = cursor.executed[-1][1]
    assert insert_params[0] == "PV-001"
    assert insert_params[2] == "Higra"
    assert conn.committed is True


def test_create_tarefa_contract_rejects_invalid_payload(client, allow_route_auth):
    allow_route_auth("/api/tarefas/")

    response = client.post("/api/tarefas/", json={"titulo": ""})

    assert response.status_code == 422


def test_create_projeto_contract_rejects_invalid_payload(client, allow_route_auth):
    allow_route_auth("/api/projetos/")

    response = client.post("/api/projetos/", json={"titulo": ""})

    assert response.status_code == 422


def test_create_rq03_contract_rejects_invalid_payload(client, allow_route_auth):
    allow_route_auth("/api/qualidade/rq03/")

    response = client.post("/api/qualidade/rq03/", json={"descricao": ""})

    assert response.status_code == 422


def test_create_checklist_contract_rejects_invalid_payload(client, allow_route_auth):
    allow_route_auth("/api/fabricacao/")

    response = client.post("/api/fabricacao/", json={"pv": ""})

    assert response.status_code == 422


def test_create_plano_contract_rejects_display_only_payload_fields(client, allow_route_auth):
    allow_route_auth("/api/planos-acao/")

    response = client.post(
        "/api/planos-acao/",
        json={"titulo": "Plano auditado", "filial_nome": "Higra", "num_mestre": 12},
    )

    assert response.status_code == 422


def test_update_plano_contract_rejects_display_only_payload_fields(client, allow_route_auth):
    allow_route_auth("/api/planos-acao/{id}", method="PUT")

    response = client.put(
        "/api/planos-acao/12?source=GAC",
        json={"titulo": "Plano auditado", "sequencia": 1},
    )

    assert response.status_code == 422


def test_vincular_tarefa_contract_rejects_missing_task_id(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{plano_id}/tarefas/vincular")
    monkeypatch.setattr(plano_features_module, "_ensure_tables", lambda: None)

    response = client.post("/api/planos-acao/9/tarefas/vincular?source=GAC", json={})

    assert response.status_code == 422


def test_criar_evidencia_contract_rejects_blank_description(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{plano_id}/evidencias")
    monkeypatch.setattr(plano_features_module, "_ensure_tables", lambda: None)

    response = client.post("/api/planos-acao/9/evidencias?source=RQ80", json={"observacoes": ""})

    assert response.status_code == 422
