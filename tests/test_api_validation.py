from __future__ import annotations

import pytest

from backend.app import app


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_rejects_non_json_payload(client):
    response = client.post("/api/simulation/step", data="not-json")
    assert response.status_code == 400


def test_rejects_missing_nodes(client):
    response = client.post("/api/simulation/step", json={"links": []})
    data = response.get_json()

    assert response.status_code == 400
    assert "Missing required field: nodes" in data["details"]


def test_rejects_invalid_node_structure(client):
    response = client.post(
        "/api/simulation/step",
        json={
            "nodes": ["invalid-node"],
            "links": [],
        },
    )

    data = response.get_json()
    assert response.status_code == 400
    assert any("nodes[0]" in err for err in data["details"])


def test_rejects_link_with_unknown_node(client):
    response = client.post(
        "/api/simulation/step",
        json={
            "nodes": [{"id": "n1", "type": "supplier"}],
            "links": [
                {"id": "l1", "from": "n1", "to": "missing"}
            ],
        },
    )

    data = response.get_json()
    assert response.status_code == 400
    assert any("unknown node id" in err for err in data["details"])


def test_accepts_minimal_valid_payload(client):
    response = client.post(
        "/api/simulation/step",
        json={
            "nodes": [],
            "links": [],
        },
    )

    assert response.status_code == 200
