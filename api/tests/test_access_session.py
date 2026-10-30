"""GET and DELETE /api/access: who is signed in, and signing out."""

from fastapi.testclient import TestClient

from app.core.access import SESSION_COOKIE, sign_session
from app.core.settings import get_settings


def test_read_access_needs_a_session(client: TestClient) -> None:
    response = client.get("/api/access")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_read_access_names_the_holder(client: TestClient, holder: str) -> None:
    client.cookies.set(SESSION_COOKIE, sign_session(get_settings().session_secret, holder))
    response = client.get("/api/access")
    assert response.status_code == 200
    assert response.json() == {
        "holder": holder,
        "kind": "code",
        "name": holder,
        "email": None,
        "provider": None,
    }


def test_revoke_access_clears_the_cookie(client: TestClient, holder: str) -> None:
    client.cookies.set(SESSION_COOKIE, sign_session(get_settings().session_secret, holder))
    response = client.delete("/api/access")
    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{SESSION_COOKIE}=")
    assert "Max-Age=0" in set_cookie
    assert "HttpOnly" in set_cookie
