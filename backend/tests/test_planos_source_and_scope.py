from backend.routes.planos_acao import planos as planos_module
from backend.routes.planos_acao import plano_features as plano_features_module


class StubCursor:
    def __init__(self, fetchone_values=None, rowcount=1):
        self.fetchone_values = list(fetchone_values or [])
        self.executed = []
        self.rowcount = rowcount

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


def test_get_plano_respects_requested_source(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{id}", method="GET")
    cursor = StubCursor([
        {"id": 7, "titulo": "Auditoria legado", "_source": "RQ80", "sth_cad_filial_id": 2},
    ])
    conn = StubConnection(cursor)
    monkeypatch.setattr(planos_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        planos_module,
        "get_user_scope",
        lambda _user_id: {"bypass": True, "empresa_ids": [], "filial_ids": [], "processo_ids": []},
    )

    response = client.get("/api/planos-acao/7?source=RQ80")

    assert response.status_code == 200
    assert response.json()["_source"] == "RQ80"
    assert "FROM public.beg_rq80 r" in cursor.executed[0][0]


def test_get_plano_blocks_records_outside_scope(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{id}", method="GET")
    cursor = StubCursor([
        {"id": 9, "titulo": "Plano filial errada", "_source": "GAC", "sth_cad_filial_id": 99},
    ])
    conn = StubConnection(cursor)
    monkeypatch.setattr(planos_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        planos_module,
        "get_user_scope",
        lambda _user_id: {"bypass": False, "empresa_ids": [1], "filial_ids": [2], "processo_ids": []},
    )

    response = client.get("/api/planos-acao/9?source=GAC")

    assert response.status_code == 403
    assert response.json()["detail"] == "Sem acesso a este registro"


def test_create_plano_autofills_user_scope_and_form_fields(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/")
    cursor = StubCursor([{"id": 11, "titulo": "Novo plano"}])
    conn = StubConnection(cursor)
    monkeypatch.setattr(planos_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        planos_module,
        "get_user_tipo",
        lambda _user_id: {"sth_cad_empresa_id": 3, "sth_cad_filial_id": 4, "beg_processo_id": 5},
    )
    monkeypatch.setattr(planos_module, "notify_plano_atribuido", lambda *args, **kwargs: None)

    response = client.post(
        "/api/planos-acao/",
        json={
            "titulo": "Novo plano",
            "descricao": "Escopo automatico",
            "metodo": "Checklist semanal",
            "local": "Linha 1",
            "custo": "120.50",
            "tempo_execucao": "4.5",
            "dt_reagendamento": "2026-04-15",
            "justificativa_reagendamento": "Aguardar fornecedor",
            "aval_implementacao": "Planejado",
            "motivo_cancelamento": "Nao aplicavel",
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == 11
    insert_params = cursor.executed[-1][1]
    assert insert_params[7] == "Checklist semanal"
    assert insert_params[8] == "Linha 1"
    assert str(insert_params[9]) == "120.50"
    assert str(insert_params[11]) == "4.5"
    assert insert_params[12].isoformat() == "2026-04-15"
    assert insert_params[13] == "Aguardar fornecedor"
    assert insert_params[14] == "Planejado"
    assert insert_params[15] == "Nao aplicavel"
    assert insert_params[16] == 5
    assert insert_params[17] == 3
    assert insert_params[18] == 4
    assert conn.committed is True


def test_update_plano_routes_rq80_updates_legacy_contract_fields(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{id}", method="PUT")
    cursor = StubCursor([
        {"id": 12, "titulo": "Plano legado", "_source": "RQ80", "status": "IMPLEMENTADO"},
    ])
    conn = StubConnection(cursor)
    monkeypatch.setattr(planos_module, "get_db_connection", lambda: conn)

    response = client.put(
        "/api/planos-acao/12?source=RQ80",
        json={
            "titulo": "Plano legado",
            "descricao": "Reforcar auditoria interna",
            "metodo": "Treinamento presencial",
            "local": "Sala 2",
            "custo": "300.00",
            "tempo_execucao": "6",
            "aval_implementacao": "Implementacao validada",
            "dt_reagendamento": "2026-05-10",
            "justificativa_reagendamento": "Ajuste de agenda",
            "status": "CONCLUIDO",
        },
    )

    assert response.status_code == 200
    assert "UPDATE public.beg_rq80 SET" in cursor.executed[0][0]
    assert cursor.executed[0][1][1] == "Reforcar auditoria interna"
    assert cursor.executed[0][1][2] == "Treinamento presencial"
    assert cursor.executed[0][1][3] == "Sala 2"
    assert str(cursor.executed[0][1][4]) == "300.00"
    assert str(cursor.executed[0][1][6]) == "6"
    assert cursor.executed[0][1][7] == "Implementacao validada"
    assert cursor.executed[0][1][9].isoformat() == "2026-05-10"
    assert cursor.executed[0][1][10] == "Ajuste de agenda"
    assert cursor.executed[0][1][12] == "S"
    assert conn.committed is True


def test_delete_plano_routes_source_specific_tables(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{id}", method="DELETE")
    cursor = StubCursor(rowcount=1)
    conn = StubConnection(cursor)
    monkeypatch.setattr(planos_module, "get_db_connection", lambda: conn)

    response = client.delete("/api/planos-acao/21?source=GAC")

    assert response.status_code == 204
    assert "DELETE FROM public.hgr_gac_reg_tar_link" in cursor.executed[0][0]
    assert "DELETE FROM public.hgr_gac_reg_tar WHERE id = %s" in cursor.executed[1][0]
    assert conn.committed is True


def test_list_planos_supports_search_status_and_scope_filters(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/", method="GET")
    cursor = StubCursor([{"total": 0}])
    conn = StubConnection(cursor)
    monkeypatch.setattr(planos_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(
        planos_module,
        "get_user_scope",
        lambda _user_id: {"bypass": False, "empresa_ids": [1], "filial_ids": [4], "processo_ids": [7]},
    )

    response = client.get("/api/planos-acao/?status=VENCIDA&por=P&filial_id=4&search=auditoria")

    assert response.status_code == 200
    count_sql, count_params = cursor.executed[0]
    assert "CURRENT_DATE" in count_sql
    assert "ILIKE %s" in count_sql
    assert "planos.beg_processo_id IN (%s)" in count_sql
    assert "planos.sth_cad_filial_id = %s" in count_sql
    assert count_params[0] == "VENCIDA"
    assert "auditoria" in count_params[2]


def test_tarefas_feature_blocks_rq80_source(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{plano_id}/tarefas", method="GET")
    monkeypatch.setattr(plano_features_module, "_ensure_tables", lambda: None)

    response = client.get("/api/planos-acao/7/tarefas?source=RQ80")

    assert response.status_code == 400
    assert response.json()["detail"] == "Tarefas vinculadas estao disponiveis apenas para planos GAC"


def test_equipe_feature_blocks_gac_source(client, allow_route_auth, monkeypatch):
    allow_route_auth("/api/planos-acao/{plano_id}/equipe", method="GET")
    monkeypatch.setattr(plano_features_module, "_ensure_tables", lambda: None)

    response = client.get("/api/planos-acao/7/equipe?source=GAC")

    assert response.status_code == 400
    assert response.json()["detail"] == "Equipe e evidencias estao disponiveis apenas para planos RQ80"
