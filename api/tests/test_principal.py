"""Reading a Supabase access token (spec 0014, AC-5). Pure: a local key signs them."""

import time
from uuid import uuid4

import pytest

from app.core.principal import Account, CodeHolder, holder_of, owner_of, read_account
from tests.accounts import ISSUER, key_for, mint


def test_a_good_token_names_the_account() -> None:
    user = uuid4()
    account = read_account(mint(user, "Ana@Example.com"), key_for, ISSUER)
    assert account == Account(user, "ana@example.com", "ana@example.com", "email")


def test_google_names_and_provider_come_from_the_metadata() -> None:
    token = mint(app_metadata={"provider": "google"}, user_metadata={"full_name": " Ana Ruiz "})
    account = read_account(token, key_for, ISSUER)
    assert account is not None
    assert (account.name, account.provider) == ("Ana Ruiz", "google")


@pytest.mark.parametrize(
    "token",
    [
        mint(signed_by_other=True),
        mint(iss="https://otro.supabase.co/auth/v1"),
        mint(aud="anon"),
        mint(exp=int(time.time()) - 10),
        mint(is_anonymous=True),
        mint(email=""),
        mint(sub="no-es-un-uuid"),
        "no.es.un.token",
    ],
    ids=["other key", "issuer", "audience", "expired", "anonymous", "no email", "bad sub", "junk"],
)
def test_anything_else_is_refused(token: str) -> None:
    assert read_account(token, key_for, ISSUER) is None


def test_an_unreachable_key_set_is_a_refusal_not_a_crash() -> None:
    def broken(_token: str) -> object:
        import jwt

        raise jwt.PyJWKClientError("sin red")

    assert read_account(mint(), broken, ISSUER) is None


def test_holder_and_owner() -> None:
    user = uuid4()
    account = Account(user, "ana@example.com", "Ana", "google")
    assert (holder_of(account), owner_of(account)) == ("ana@example.com", user)
    assert (holder_of(CodeHolder("dev")), owner_of(CodeHolder("dev"))) == ("dev", None)
