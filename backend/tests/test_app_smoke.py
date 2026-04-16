def test_openapi_smoke(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    payload = response.json()
    assert payload["info"]["title"] == "HIGRA Sigs API"
    assert "/auth/me" in payload["paths"]
    assert "/api/tarefas/" in payload["paths"]


def test_docs_page_is_available(client):
    response = client.get("/docs")

    assert response.status_code == 200
    assert "swagger" in response.text.lower()
