"""A notebook from its instructions (spec 0005, AC-19 to AC-35): the context, the stored
protocol, and the capture prompt section."""

import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, func, select

from app.ai.deps import get_provider
from app.ai.prompt import system_prompt
from app.ai.provider import ProviderFailure
from app.ai.providers.fake import FakeProvider
from app.ai.tools import ProponerCuaderno, ProposedVariable
from app.main import app
from app.models import Experiment, Protocol, ProtocolPage
from app.repositories.capture import load_context
from app.repositories.experiments import create_experiment, get_experiment
from app.services.card_state import VariableInfo
from app.services.experiment_rules import NewExperiment, NewVariable
from app.services.instructions import NewProtocol, clean_filename, extract_pages
from app.services.results import (
    DuplicateVariableName,
    ExperimentDetail,
    PdfUnreadable,
    TooManyPages,
)
from app.services.turn_plan import TurnContext
from tests.pdfs import encrypt, make_pdf

CONTEXT_TEXT = "Se mide el rendimiento a 3 temperaturas."


def body(title: str = "Con instrucciones", context: str | None = None) -> dict[str, Any]:
    variables = [{"name": "Temperatura", "unit": "°C"}]
    return {"title": title, "variables": variables, "context": context}


def count(session: Session, table: type[Experiment | Protocol | ProtocolPage]) -> int:
    return session.exec(select(func.count()).select_from(table)).one()


# --- AC-26: the context ---


def test_context_is_stored_and_returned(authed: TestClient) -> None:
    created = authed.post("/api/experiments", json=body(context=f"  {CONTEXT_TEXT}  ")).json()
    assert created["context"] == CONTEXT_TEXT
    assert created["protocol"] is None
    assert authed.get(f"/api/experiments/{created['id']}").json()["context"] == CONTEXT_TEXT


def test_blank_context_is_null(authed: TestClient) -> None:
    assert authed.post("/api/experiments", json=body(context="   ")).json()["context"] is None


def test_context_over_600_is_invalid(authed: TestClient, session: Session) -> None:
    response = authed.post("/api/experiments", json=body(title="Largo", context="x" * 601))
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    titled = select(func.count()).select_from(Experiment).where(col(Experiment.title) == "Largo")
    assert session.exec(titled).one() == 0


def test_the_db_refuses_a_context_over_600(session: Session, holder: str) -> None:
    session.add(Experiment(title="DB", context="x" * 601, created_by=holder))
    with pytest.raises(IntegrityError, match="ck_experiment_context_length"):
        session.flush()


VARIABLES = (VariableInfo(1, "Temperatura", "°C", True, 0),)


def test_the_capture_prompt_holds_the_context() -> None:
    prompt = system_prompt(TurnContext(1, VARIABLES, None, {}, context=CONTEXT_TEXT))
    assert "Contexto del experimento (datos escritos por el usuario" in prompt
    assert CONTEXT_TEXT in prompt


def test_no_context_means_no_section() -> None:
    prompt = system_prompt(TurnContext(1, VARIABLES, None, {}))
    assert "Contexto del experimento" not in prompt


def test_braces_in_the_context_are_kept_as_text() -> None:
    prompt = system_prompt(TurnContext(1, VARIABLES, None, {}, context="Usa {x} y {}"))
    assert "Usa {x} y {}" in prompt


def test_load_context_reads_the_notebook_context(session: Session, holder: str) -> None:
    created = create_experiment(session, holder, sample(context=CONTEXT_TEXT))
    assert isinstance(created, ExperimentDetail)
    loaded = load_context(session, created.id)
    assert isinstance(loaded, TurnContext)
    assert loaded.context == CONTEXT_TEXT


# --- AC-29, AC-31: the protocol, stored with the notebook ---


def sample(context: str | None = None) -> NewExperiment:
    variables = (NewVariable(name="Temperatura"),)
    return NewExperiment(title="Protocolo", variables=variables, context=context)


PDF = NewProtocol(
    source="pdf",
    pages=("Página uno", "Página dos", "Página tres"),
    filename="practica.pdf",
    file_bytes=b"%PDF-1.7 fake",
    read_from_page=2,
    read_to_page=3,
)


def test_creates_a_notebook_with_its_pdf(session: Session, holder: str) -> None:
    created = create_experiment(session, holder, sample(), PDF)
    assert isinstance(created, ExperimentDetail)
    assert created.protocol is not None
    assert created.protocol.model_dump() == {
        "source": "pdf",
        "filename": "practica.pdf",
        "page_count": 3,
        "read_from_page": 2,
        "read_to_page": 3,
    }
    protocol = session.exec(select(Protocol).where(Protocol.experiment_id == created.id)).one()
    assert protocol.byte_size == len(b"%PDF-1.7 fake")
    pages = session.exec(
        select(ProtocolPage)
        .where(ProtocolPage.protocol_id == protocol.id)
        .order_by(col(ProtocolPage.page_number))
    ).all()
    assert [(p.page_number, p.text) for p in pages] == [
        (1, "Página uno"),
        (2, "Página dos"),
        (3, "Página tres"),
    ]


def test_pasted_text_is_one_page(session: Session, holder: str) -> None:
    pasted = NewProtocol(source="text", pages=("Mida la temperatura.",))
    created = create_experiment(session, holder, sample(), pasted)
    assert isinstance(created, ExperimentDetail)
    assert created.protocol is not None
    assert created.protocol.source == "text"
    assert created.protocol.filename is None
    assert created.protocol.page_count == 1


def test_a_failed_create_stores_no_protocol(session: Session, holder: str) -> None:
    before = (count(session, Experiment), count(session, Protocol), count(session, ProtocolPage))
    body = NewExperiment(
        title="Respaldo", variables=(NewVariable(name="Masa"), NewVariable(name="MASA"))
    )
    assert create_experiment(session, holder, body, PDF) == DuplicateVariableName(name=None)
    after = (count(session, Experiment), count(session, Protocol), count(session, ProtocolPage))
    assert after == before


def test_get_experiment_never_loads_the_file(session: Session, holder: str) -> None:
    created = create_experiment(session, holder, sample(), PDF)
    assert isinstance(created, ExperimentDetail)
    session.expunge_all()
    opened = get_experiment(session, created.id)
    assert isinstance(opened, ExperimentDetail)
    assert not any(isinstance(row, Protocol) for row in session.identity_map.values())


@pytest.mark.parametrize(
    ("columns", "constraint"),
    [
        ("'pdf', NULL, NULL, NULL, 1, NULL, NULL", "ck_protocol_pdf_file"),
        ("'text', NULL, NULL, NULL, 1, 1, 1", "ck_protocol_text_range"),
        ("'pdf', 'a.pdf', '\\x25'::bytea, 1, 3, 3, 2", "ck_protocol_read_range"),
        ("'pdf', 'a.pdf', '\\x25'::bytea, 1, 81, NULL, NULL", "ck_protocol_page_count"),
        ("'web', NULL, NULL, NULL, 1, NULL, NULL", "ck_protocol_source"),
    ],
    ids=["pdf without file", "text with range", "range reversed", "81 pages", "bad source"],
)
def test_the_db_checks_the_protocol(
    session: Session, holder: str, columns: str, constraint: str
) -> None:
    created = create_experiment(session, holder, sample())
    assert isinstance(created, ExperimentDetail)
    insert = text(
        "INSERT INTO protocol (experiment_id, source, filename, file_bytes, byte_size, "
        f"page_count, read_from_page, read_to_page) VALUES (:id, {columns})"
    )
    with pytest.raises(IntegrityError, match=constraint):
        session.connection().execute(insert, {"id": created.id})


def test_one_protocol_per_notebook(session: Session, holder: str) -> None:
    created = create_experiment(session, holder, sample(), PDF)
    assert isinstance(created, ExperimentDetail)
    session.add(Protocol(experiment_id=created.id, source="text", page_count=1))
    with pytest.raises(IntegrityError, match="uq_protocol_experiment_id"):
        session.flush()


# --- AC-21 to AC-34: the routes, for pasted text ---

HANDOUT = (
    "Práctica 3: Rendimiento y temperatura\n"
    "Mida la temperatura (entre 40 y 80 °C) y el rendimiento en %. Haga 5 ensayos."
)
READ = "/api/experiments/instructions/read"
CREATE = "/api/experiments/with-instructions"


@pytest.fixture
def fake_reader() -> Iterator[None]:
    """The fake reads by rules; its answer is built from the text, never a model."""
    app.dependency_overrides[get_provider] = FakeProvider
    yield
    app.dependency_overrides.pop(get_provider, None)


def scripted(*steps: ProponerCuaderno | ProviderFailure) -> None:
    provider = FakeProvider(setup_script=steps)
    app.dependency_overrides[get_provider] = lambda: provider


def stored_counts(session: Session) -> tuple[int, int, int]:
    return count(session, Experiment), count(session, Protocol), count(session, ProtocolPage)


@pytest.mark.parametrize("path", [READ, CREATE])
def test_the_new_routes_need_a_session(client: TestClient, path: str) -> None:
    response = client.post(path, data={"text": HANDOUT})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_reading_pasted_text_proposes_a_notebook(
    authed: TestClient, session: Session, fake_reader: None, caplog: pytest.LogCaptureFixture
) -> None:
    before = stored_counts(session)
    with caplog.at_level(logging.INFO):
        response = authed.post(READ, data={"text": HANDOUT})
    assert response.status_code == 200
    proposal = response.json()
    assert proposal["kind"] == "proposal"
    assert proposal["title"] == "Práctica 3: Rendimiento y temperatura"
    assert (proposal["page_count"], proposal["read_from_page"]) == (1, None)
    temperatura = next(v for v in proposal["variables"] if v["name"] == "Temperatura")
    assert temperatura | {"name": None} == {
        "name": None,
        "unit": "°C",
        "min_value": 40,
        "max_value": 80,
        "required": True,
        "range_quote": "entre 40 y 80 °C",
        "range_page": None,
    }
    assert stored_counts(session) == before  # AC-32: the read stores nothing
    line = next(r for r in caplog.records if r.message == "instructions read")
    assert line.__dict__["provider"] == "fake"
    assert line.__dict__["source"] == "text"
    assert HANDOUT not in str(line.__dict__)  # never the instructions text


def test_an_invented_range_never_reaches_the_form(authed: TestClient) -> None:
    invented = ProposedVariable(
        name="Temperatura", unit="°C", min_value=40, max_value=90, range_quote="entre 40 y 80 °C"
    )
    scripted(ProponerCuaderno(title="P", variables=[invented]))
    proposal = authed.post(READ, data={"text": HANDOUT}).json()
    assert proposal["variables"][0]["min_value"] is None
    assert proposal["variables"][0]["range_quote"] is None


def test_both_providers_failing_is_reading_failed(authed: TestClient, session: Session) -> None:
    before = stored_counts(session)
    scripted(ProviderFailure("fallback", "deadline"))
    response = authed.post(READ, data={"text": HANDOUT})
    assert response.status_code == 503
    assert response.json() == {
        "code": "reading_failed",
        "message": "No pudimos leer las instrucciones. Llena el formulario o intenta de nuevo.",
    }
    assert stored_counts(session) == before


def test_a_second_read_for_the_same_holder_waits(authed: TestClient, holder: str) -> None:
    reads = app.state.instruction_reads
    reads.holders.add(holder)
    try:
        scripted(ProponerCuaderno(title="P"))
        response = authed.post(READ, data={"text": HANDOUT})
    finally:
        reads.holders.discard(holder)
    assert response.status_code == 409
    assert response.json()["code"] == "reading_in_progress"


def test_the_read_frees_its_slot(authed: TestClient, holder: str, fake_reader: None) -> None:
    authed.post(READ, data={"text": HANDOUT})
    assert holder not in app.state.instruction_reads.holders


@pytest.mark.parametrize(
    ("data", "code", "message"),
    [
        ({}, "instructions_missing", "Sube un PDF o pega las instrucciones."),
        ({"text": "corto"}, "instructions_too_short", "Pega un poco más de las instrucciones."),
        (
            {"text": "x" * 100_001},
            "text_too_long",
            "Pega solo la parte de tu práctica (máximo 100 000 caracteres).",
        ),
        ({"text": HANDOUT, "from_page": 1, "to_page": 1}, "invalid_page_range", None),
        ({"text": HANDOUT, "from_page": 1}, "invalid_page_range", "Elige páginas entre 1 y 1."),
        ({"text": "corto", "from_page": 1}, "invalid_page_range", None),  # the range first
    ],
    ids=["nothing", "short", "long", "range on text", "half a range", "order"],
)
def test_bad_text_is_refused_before_the_model(
    authed: TestClient, data: dict[str, Any], code: str, message: str | None
) -> None:
    scripted()  # an empty script: any model call would raise
    response = authed.post(READ, data=data)
    assert response.status_code == 422
    assert response.json()["code"] == code
    if message is not None:
        assert response.json()["message"] == message


def create_body(context: str | None = None) -> str:
    variables = [{"name": "Temperatura"}]
    return json.dumps({"title": "Desde texto", "variables": variables, "context": context})


def test_creates_a_notebook_with_pasted_instructions(authed: TestClient, session: Session) -> None:
    response = authed.post(
        CREATE,
        data={"body": create_body(context=CONTEXT_TEXT), "instructions_text": f"  {HANDOUT}  "},
    )
    assert response.status_code == 201
    created = response.json()
    assert created["context"] == CONTEXT_TEXT
    assert created["protocol"] == {
        "source": "text",
        "filename": None,
        "page_count": 1,
        "read_from_page": None,
        "read_to_page": None,
    }
    assert authed.get(f"/api/experiments/{created['id']}").json() == created
    protocol = session.exec(select(Protocol).where(Protocol.experiment_id == created["id"])).one()
    page = session.exec(select(ProtocolPage).where(ProtocolPage.protocol_id == protocol.id)).one()
    assert page.text == HANDOUT  # trimmed, stored as page 1


def test_a_multipart_create_is_atomic(authed: TestClient, session: Session) -> None:
    before = stored_counts(session)
    duplicate = json.dumps(
        {"title": "Dup", "variables": [{"name": "Temperatura"}, {"name": "temperatura"}]}
    )
    response = authed.post(CREATE, data={"body": duplicate, "instructions_text": HANDOUT})
    assert response.status_code == 422
    assert response.json()["code"] == "duplicate_variable_name"
    assert stored_counts(session) == before


@pytest.mark.parametrize(
    ("data", "code"),
    [
        ({"body": "{not json", "instructions_text": HANDOUT}, "invalid_request"),
        ({"instructions_text": HANDOUT}, "invalid_request"),
        ({"body": create_body()}, "instructions_missing"),
        ({"body": create_body(), "instructions_text": "corto"}, "instructions_too_short"),
        (
            {"body": create_body(), "instructions_text": HANDOUT, "read_from_page": 1},
            "invalid_page_range",
        ),
        ({"body": create_body(context="x" * 601), "instructions_text": HANDOUT}, "invalid_request"),
    ],
    ids=["bad json", "no body", "no instructions", "short", "range on text", "long context"],
)
def test_a_bad_multipart_create_stores_nothing(
    authed: TestClient, session: Session, data: dict[str, Any], code: str
) -> None:
    before = stored_counts(session)
    response = authed.post(CREATE, data=data)
    assert response.status_code == 422
    assert response.json()["code"] == code
    assert stored_counts(session) == before


# --- AC-20, AC-22, AC-29, AC-30: PDFs ---

PAGE = "Mida la temperatura (entre 40 y 80 °C) y el rendimiento en %. " * 3


def pdf_file(data: bytes, name: str = "guia.pdf") -> dict[str, tuple[str, bytes, str]]:
    return {"file": (name, data, "application/pdf")}


def test_extract_pages_reads_text_and_keeps_empty_pages() -> None:
    pages = extract_pages(make_pdf(["Práctica 4\nMida la temperatura.", ""]))
    assert isinstance(pages, tuple)
    assert pages[0].startswith("Práctica 4\nMida la temperatura.")
    assert pages[1] == ""


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (b"\x89PNG\r\n\x1a\n not a pdf", PdfUnreadable()),
        (b"%PDF-1.4 damaged", PdfUnreadable()),
        (encrypt(make_pdf([PAGE]), "secreta"), PdfUnreadable()),
        (make_pdf(["x"] * 81), TooManyPages(page_count=81)),
    ],
    ids=["png renamed", "damaged", "real password", "81 pages"],
)
def test_extract_pages_refuses(data: bytes, expected: object) -> None:
    assert extract_pages(data) == expected


def test_an_empty_password_opens() -> None:
    pages = extract_pages(encrypt(make_pdf([PAGE]), ""))
    assert isinstance(pages, tuple) and "entre 40 y 80" in pages[0]


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("C:\\Users\\ana\\guía.pdf", "guía.pdf"),
        ("../../etc/práctica.pdf", "práctica.pdf"),
        ("  \x07  ", "instrucciones.pdf"),
        (None, "instrucciones.pdf"),
        ("a" * 300, "a" * 255),
    ],
)
def test_clean_filename(name: str | None, expected: str) -> None:
    assert clean_filename(name) == expected


def test_reading_a_pdf_gives_the_page_of_each_quote(authed: TestClient, fake_reader: None) -> None:
    data = make_pdf(["Introducción a la práctica, sin rangos. " * 3, PAGE])
    response = authed.post(READ, files=pdf_file(data))
    assert response.status_code == 200
    proposal = response.json()
    assert proposal["page_count"] == 2
    temperatura = next(v for v in proposal["variables"] if v["name"] == "Temperatura")
    assert temperatura["range_page"] == 2


def long_pdf() -> bytes:
    # 70 pages of 2600 characters each: about 180 000 in all, over the 100 000 cap.
    line = "Paso del procedimiento con muchas palabras para alargar la página. "
    filler = "\n".join([line] * 39)
    pages = [filler] * 70
    pages[13] = PAGE + "\n" + "\n".join([line] * 30)
    return make_pdf(pages)


def test_a_long_pdf_asks_for_pages_before_any_model_call(authed: TestClient) -> None:
    scripted()  # an empty script: a model call would raise
    response = authed.post(READ, files=pdf_file(long_pdf()))
    assert response.status_code == 200
    asked = response.json()
    assert asked["kind"] == "needs_pages"
    assert asked["page_count"] == 70
    assert asked["char_count"] > 100_000
    assert asked["max_chars"] == 100_000


def test_a_page_range_is_read_with_real_page_numbers(authed: TestClient, fake_reader: None) -> None:
    response = authed.post(READ, files=pdf_file(long_pdf()), data={"from_page": 12, "to_page": 18})
    proposal = response.json()
    assert (proposal["read_from_page"], proposal["read_to_page"]) == (12, 18)
    temperatura = next(v for v in proposal["variables"] if v["name"] == "Temperatura")
    assert temperatura["range_page"] == 14


def test_pages_still_too_long_are_refused(authed: TestClient) -> None:
    scripted()
    response = authed.post(READ, files=pdf_file(long_pdf()), data={"from_page": 1, "to_page": 70})
    assert response.status_code == 422
    assert response.json() == {
        "code": "pages_too_long",
        "message": "Esas páginas tienen demasiado texto. Elige menos páginas.",
    }


@pytest.mark.parametrize(
    ("files", "data", "status", "code"),
    [
        (pdf_file(b"%PDF-" + b"0" * 10_485_756), {}, 413, "file_too_large"),
        (pdf_file(b"\x89PNG not a pdf", "foto.pdf"), {}, 422, "pdf_unreadable"),
        (pdf_file(make_pdf(["x"] * 81)), {}, 422, "too_many_pages"),
        (pdf_file(make_pdf(["", ""])), {}, 422, "no_text_in_pdf"),
        (pdf_file(make_pdf([PAGE])), {"from_page": 1, "to_page": 2}, 422, "invalid_page_range"),
        (pdf_file(make_pdf([PAGE])), {"text": HANDOUT}, 422, "instructions_missing"),
        (pdf_file(make_pdf(["", PAGE])), {"from_page": 1, "to_page": 1}, 422, "no_text_in_pdf"),
    ],
    ids=["10 MB + 1", "png", "81 pages", "scanned", "range past the end", "both", "empty range"],
)
def test_bad_pdfs_are_refused_and_store_nothing(
    authed: TestClient,
    session: Session,
    files: dict[str, tuple[str, bytes, str]],
    data: dict[str, Any],
    status: int,
    code: str,
) -> None:
    scripted()
    before = stored_counts(session)
    response = authed.post(READ, files=files, data=data)
    assert response.status_code == status
    assert response.json()["code"] == code
    assert stored_counts(session) == before


def test_too_many_pages_names_the_count(authed: TestClient) -> None:
    response = authed.post(READ, files=pdf_file(make_pdf(["x"] * 81)))
    assert response.json()["message"] == "El PDF tiene 81 páginas; el máximo es 80."


def test_creates_a_notebook_with_its_pdf_through_the_route(
    authed: TestClient, session: Session
) -> None:
    data = make_pdf(["Portada. " * 20, PAGE])
    response = authed.post(
        CREATE,
        files=pdf_file(data, "C:\\curso\\práctica 4.pdf"),
        data={"body": create_body(), "read_from_page": 2, "read_to_page": 2},
    )
    assert response.status_code == 201
    created = response.json()
    assert created["protocol"] == {
        "source": "pdf",
        "filename": "práctica 4.pdf",
        "page_count": 2,
        "read_from_page": 2,
        "read_to_page": 2,
    }
    protocol = session.exec(select(Protocol).where(Protocol.experiment_id == created["id"])).one()
    assert protocol.file_bytes == data
    assert protocol.byte_size == len(data)
    pages = session.exec(select(ProtocolPage).where(ProtocolPage.protocol_id == protocol.id)).all()
    assert len(pages) == 2  # every page, not only the range that was read


def test_a_create_with_a_bad_pdf_stores_nothing(authed: TestClient, session: Session) -> None:
    before = stored_counts(session)
    response = authed.post(CREATE, files=pdf_file(make_pdf(["", ""])), data={"body": create_body()})
    assert response.status_code == 422
    assert response.json()["code"] == "no_text_in_pdf"
    assert stored_counts(session) == before
