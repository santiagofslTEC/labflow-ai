"""Class folders (2026-10-30): create, list with counts, rename, delete, and move a notebook
in or out of one. Everything runs on the rolled back test session."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from tests.factories import make_notebook

NOTEBOOK: dict[str, Any] = {
    "title": "Cinética",
    "variables": [{"name": "Tiempo", "unit": "min", "required": True}],
}


def new_folder(authed: TestClient, name: str) -> dict[str, Any]:
    response = authed.post("/api/folders", json={"name": name})
    assert response.status_code == 201
    return response.json()


def test_create_and_list_by_name_with_counts(authed: TestClient, session: Session) -> None:
    quimica = new_folder(authed, "  Química orgánica ")
    fisica = new_folder(authed, "Física II")
    assert quimica["name"] == "Química orgánica" and quimica["notebook_count"] == 0

    nb = make_notebook(session)
    moved = authed.put(
        f"/api/experiments/{nb.experiment_id}/folder", json={"folder_id": fisica["id"]}
    )
    assert moved.status_code == 200 and moved.json()["folder_id"] == fisica["id"]

    listed = {f["id"]: f for f in authed.get("/api/folders").json()}
    assert listed[fisica["id"]]["notebook_count"] == 1
    assert listed[quimica["id"]]["notebook_count"] == 0
    names = [f["name"] for f in authed.get("/api/folders").json()]
    assert names.index("Física II") < names.index("Química orgánica")

    summary = next(n for n in authed.get("/api/experiments").json() if n["id"] == nb.experiment_id)
    assert summary["folder_id"] == fisica["id"]


def test_create_a_notebook_inside_a_folder(authed: TestClient) -> None:
    folder = new_folder(authed, "Bioquímica")
    created = authed.post("/api/experiments", json={**NOTEBOOK, "folder_id": folder["id"]})
    assert created.status_code == 201 and created.json()["folder_id"] == folder["id"]

    missing = authed.post("/api/experiments", json={**NOTEBOOK, "folder_id": 999_999_999})
    assert missing.status_code == 422 and missing.json()["code"] == "folder_not_found"
    assert authed.post("/api/experiments", json=NOTEBOOK).json()["folder_id"] is None


def test_take_a_notebook_out_and_reject_unknown_ids(authed: TestClient, session: Session) -> None:
    folder = new_folder(authed, "Química")
    nb = make_notebook(session)
    path = f"/api/experiments/{nb.experiment_id}/folder"
    authed.put(path, json={"folder_id": folder["id"]})
    assert authed.put(path, json={"folder_id": None}).json()["folder_id"] is None

    unknown_folder = authed.put(path, json={"folder_id": 999_999_999})
    assert unknown_folder.status_code == 422
    assert unknown_folder.json()["code"] == "folder_not_found"
    unknown_notebook = authed.put("/api/experiments/999999999/folder", json={"folder_id": None})
    assert unknown_notebook.status_code == 404


def test_rename_and_delete_keeps_the_notebooks(authed: TestClient, session: Session) -> None:
    folder = new_folder(authed, "Quimica")
    nb = make_notebook(session)
    authed.put(f"/api/experiments/{nb.experiment_id}/folder", json={"folder_id": folder["id"]})

    renamed = authed.patch(f"/api/folders/{folder['id']}", json={"name": "Química"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Química" and renamed.json()["notebook_count"] == 1

    assert authed.delete(f"/api/folders/{folder['id']}").status_code == 204
    detail = authed.get(f"/api/experiments/{nb.experiment_id}")
    assert detail.status_code == 200 and detail.json()["folder_id"] is None
    assert authed.delete(f"/api/folders/{folder['id']}").json()["code"] == "folder_not_found"
    assert authed.patch("/api/folders/0", json={"name": "x"}).status_code == 404


@pytest.mark.parametrize("name", ["", "   ", "x" * 81])
def test_rejects_a_bad_name(authed: TestClient, name: str) -> None:
    assert authed.post("/api/folders", json={"name": name}).status_code == 422


def test_folders_need_a_session(client: TestClient) -> None:
    assert client.get("/api/folders").status_code == 401
    assert client.post("/api/folders", json={"name": "x"}).status_code == 401
