"""Text capture and the confirm card (spec 0006, API surface). Every route sits behind the
access session. Only `/utterances` awaits the model; the buttons are plain `def` routes that
store no turn (except the hand edit's "Editado" turn) and reply from the templates."""

import math
import unicodedata
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session

from app.ai.deps import ProviderDep
from app.core.db import SessionDep
from app.core.errors import ApiError, ApiErrorBody
from app.core.gate import HolderDep
from app.models import Proposal, ProposalValue, Turn, Variable
from app.models.enums import ProposalStatus, Role, Source
from app.repositories import capture, proposals, turns
from app.services.card_state import unchecked_ids
from app.services.proposal_view import ProposalView, reply_for
from app.services.replies import Reason
from app.services.results import (
    Confirmed,
    EmptyProposal,
    ExperimentNotFound,
    InvalidTrialNumber,
    MissingTrialNumber,
    NotAutoSaved,
    NotPending,
    ProposalNotFound,
    TrialExists,
    TrialNotInExperiment,
    UndoExpired,
    VariableNotInExperiment,
)
from app.services.turns import LLMUnavailable, TurnResponse, handle_utterance, saved_trial

router = APIRouter(tags=["capture"])

TEXT_MAX = 500
_ID_MAX = 2**63 - 1

_MESSAGES = {
    "experiment_not_found": "Este cuaderno no existe.",
    "proposal_not_found": "Esta tarjeta ya no existe.",
    "variable_not_in_experiment": "Esa variable no es de este cuaderno.",
    "trial_not_in_experiment": "Ese ensayo no es de este cuaderno.",
    "not_pending": "Esta tarjeta ya se guardó o se descartó.",
    "invalid_text": f"Escribe entre 1 y {TEXT_MAX} caracteres.",
    "invalid_value": "El valor tiene que ser un número.",
    "invalid_trial_number": "El número de ensayo tiene que ser mayor que cero.",
    "llm_unavailable": "No pude procesarlo. Intenta de nuevo o edita la tarjeta.",
    "missing_trial_number": "Falta el número de ensayo.",
    "empty_proposal": "La tarjeta no tiene valores.",
    "trial_exists": "Ese ensayo ya existe. Elige si es una corrección o un ensayo nuevo.",
    "unchecked_values": "Antes de guardar, revisa los valores marcados.",
    "undo_expired": "Ya no se puede deshacer; corrige el ensayo dictándolo de nuevo.",
    "not_auto_saved": "Solo se puede deshacer un ensayo que LabFlow guardó solo.",
}
_STATUS = {
    "experiment_not_found": 404,
    "proposal_not_found": 404,
    "variable_not_in_experiment": 404,
    "trial_not_in_experiment": 404,
    "not_pending": 409,
    "trial_exists": 409,
    "unchecked_values": 409,
    "undo_expired": 409,
    "not_auto_saved": 409,
    "invalid_text": 422,
    "invalid_value": 422,
    "invalid_trial_number": 422,
    "missing_trial_number": 422,
    "empty_proposal": 422,
    "llm_unavailable": 503,
}


def _fail(code: str) -> ApiError:
    return ApiError(_STATUS[code], code, _MESSAGES[code])


def _errors(*codes: int) -> dict[int | str, dict[str, object]]:
    described = {
        401: "No valid access session",
        404: "Not found",
        409: "The card cannot take this action",
        422: "Invalid input",
        503: "The AI could not process the sentence",
    }
    return {code: {"model": ApiErrorBody, "description": described[code]} for code in codes}


class UtteranceIn(BaseModel):
    model_config = ConfigDict(frozen=True)

    text: str


class ValueIn(BaseModel):
    model_config = ConfigDict(frozen=True)

    value: float  # in the variable's unit


class TrialChoiceIn(BaseModel):
    model_config = ConfigDict(frozen=True)

    kind: Literal["correction", "new"]
    trial_number: int | None = None


# --- helpers -------------------------------------------------------------------------


def _pending(session: Session, proposal_id: int) -> Proposal:
    proposal = session.get(Proposal, proposal_id) if 1 <= proposal_id <= _ID_MAX else None
    if proposal is None:
        raise _fail("proposal_not_found")
    session.refresh(proposal)
    if proposal.status != ProposalStatus.PENDING:
        raise _fail("not_pending")
    return proposal


def _variable(session: Session, proposal: Proposal, variable_id: int) -> Variable:
    variable = session.get(Variable, variable_id) if 1 <= variable_id <= _ID_MAX else None
    if variable is None or variable.experiment_id != proposal.experiment_id:
        raise _fail("variable_not_in_experiment")
    return variable


def _card_response(session: Session, experiment_id: int, turn_id: int | None) -> TurnResponse:
    """The card read back from the database, with its question as the reply (AC-17)."""
    view = capture.view_of(session, experiment_id)
    return TurnResponse(
        turn_id=turn_id, reply=None if view is None else view.question, proposal=view, saved=None
    )


def _raise_for(result: object) -> None:
    match result:
        case ProposalNotFound() | NotPending() | VariableNotInExperiment():
            raise _fail(result.code)
        case TrialNotInExperiment() | InvalidTrialNumber():
            raise _fail(result.code)
        case _:
            pass


def _edit_text(variable: Variable, value: float) -> str:
    unit = f" {variable.unit}" if variable.unit else ""
    return f"Editado: {variable.name} {value:g}{unit}"


# --- routes --------------------------------------------------------------------------


@router.post("/api/experiments/{experiment_id}/utterances", responses=_errors(401, 404, 422, 503))
async def post_utterance(
    experiment_id: int,
    body: UtteranceIn,
    session: SessionDep,
    provider: ProviderDep,
    holder: HolderDep,
) -> TurnResponse:
    # NFC so every accent is one character: the number reader slices the text by index.
    text = unicodedata.normalize("NFC", body.text).strip()
    if not 1 <= len(text) <= TEXT_MAX:
        raise _fail("invalid_text")
    if not 1 <= experiment_id <= _ID_MAX:
        raise _fail("experiment_not_found")
    result = await handle_utterance(session, provider, experiment_id, text, Source.TEXT, holder)
    match result:
        case TurnResponse():
            return result
        case LLMUnavailable() | ExperimentNotFound() | NotPending() | TrialNotInExperiment():
            raise _fail(result.code)


@router.get("/api/experiments/{experiment_id}/proposal", responses=_errors(401, 404))
def get_proposal(experiment_id: int, session: SessionDep) -> ProposalView | None:
    if not 1 <= experiment_id <= _ID_MAX or not capture.experiment_exists(session, experiment_id):
        raise _fail("experiment_not_found")
    return capture.view_of(session, experiment_id)


@router.put(
    "/api/proposals/{proposal_id}/values/{variable_id}", responses=_errors(401, 404, 409, 422)
)
def put_value(
    proposal_id: int, variable_id: int, body: ValueIn, session: SessionDep
) -> TurnResponse:
    """A hand edit (AC-4): no AI. Checked before the "Editado" turn is stored, so a
    rejected edit leaves no turn behind. It counts as checked (AC-23)."""
    proposal = _pending(session, proposal_id)
    variable = _variable(session, proposal, variable_id)
    if not math.isfinite(body.value):
        raise _fail("invalid_value")
    turn = turns.add_turn(
        session, proposal.experiment_id, Role.USER, _edit_text(variable, body.value), Source.TEXT
    )
    assert isinstance(turn, Turn) and turn.id is not None
    result = proposals.set_value(session, proposal_id, variable_id, body.value, turn.id)
    if not isinstance(result, ProposalValue):
        _raise_for(result)
        raise _fail("invalid_value")
    return _card_response(session, proposal.experiment_id, turn.id)


@router.post("/api/proposals/{proposal_id}/trial", responses=_errors(401, 404, 409, 422))
def post_trial(proposal_id: int, body: TrialChoiceIn, session: SessionDep) -> TurnResponse:
    """Answer `choose_trial` (AC-7): a correction of the saved trial, or a new trial."""
    proposal = _pending(session, proposal_id)
    if body.kind == "correction":
        number = proposal.trial_number
        trial_id = (
            capture.trial_numbers(session, proposal.experiment_id).get(number)
            if number is not None
            else None
        )
        if trial_id is None:
            raise _fail("trial_not_in_experiment")
        result = proposals.set_trial(session, proposal_id, None, trial_id)
    else:
        result = proposals.set_trial(session, proposal_id, body.trial_number, None)
    _raise_for(result)
    return _card_response(session, proposal.experiment_id, None)


@router.post(
    "/api/proposals/{proposal_id}/values/{variable_id}/check", responses=_errors(401, 404, 409)
)
def post_check(proposal_id: int, variable_id: int, session: SessionDep) -> TurnResponse:
    """Check a flagged value (AC-24). Stores no turn."""
    proposal = _pending(session, proposal_id)
    _variable(session, proposal, variable_id)
    _raise_for(proposals.check_value(session, proposal_id, variable_id))
    return _card_response(session, proposal.experiment_id, None)


@router.post("/api/proposals/{proposal_id}/confirm", responses=_errors(401, 404, 409, 422))
def post_confirm(proposal_id: int, session: SessionDep, holder: HolderDep) -> TurnResponse:
    """Save the card (AC-2). Flagged values must be checked first (AC-24), whatever the
    path; a repeat confirm returns the same trial (spec 0002)."""
    proposal = session.get(Proposal, proposal_id) if 1 <= proposal_id <= _ID_MAX else None
    if proposal is None:
        raise _fail("proposal_not_found")
    session.refresh(proposal)
    experiment_id = proposal.experiment_id
    if proposal.status == ProposalStatus.PENDING:
        card = capture.card_info(session, proposal)
        if unchecked_ids(card, capture.variables_of(session, experiment_id)):
            raise _fail("unchecked_values")
    result = proposals.confirm(session, proposal_id, holder)
    match result:
        case Confirmed(trial_id=trial_id, created_trial=created):
            saved = saved_trial(session, proposal_id, trial_id, created, auto=False)
            return TurnResponse(
                turn_id=None,
                reply=reply_for(Reason.SAVED, (), (), saved.trial_number),
                proposal=capture.view_of(session, experiment_id),
                saved=saved,
            )
        case ProposalNotFound() | NotPending() | TrialExists():
            raise _fail(result.code)
        case EmptyProposal() | MissingTrialNumber():
            raise _fail(result.code)


@router.post("/api/proposals/{proposal_id}/undo", responses=_errors(401, 404, 409))
def post_undo(proposal_id: int, session: SessionDep) -> TurnResponse:
    """Take back a save LabFlow made with no tap (AC-29): the same card comes back pending,
    and a "Deshecho" turn records it. Only until the next sentence."""
    if not 1 <= proposal_id <= _ID_MAX:
        raise _fail("proposal_not_found")
    result = proposals.undo_auto_save(session, proposal_id)
    match result:
        case ProposalNotFound() | NotAutoSaved() | UndoExpired():
            raise _fail(result.code)
        case Proposal():
            pass
    turn = turns.add_turn(
        session,
        result.experiment_id,
        Role.USER,
        f"Deshecho: ensayo {result.trial_number}",
        Source.TEXT,
    )
    assert isinstance(turn, Turn) and turn.id is not None
    return _card_response(session, result.experiment_id, turn.id)


@router.post("/api/proposals/{proposal_id}/discard", responses=_errors(401, 404, 409))
def post_discard(proposal_id: int, session: SessionDep) -> TurnResponse:
    """Drop the card; nothing is saved (AC-13)."""
    proposal = _pending(session, proposal_id)
    _raise_for(proposals.discard(session, proposal_id))
    return TurnResponse(
        turn_id=None,
        reply=reply_for(Reason.DISCARDED, (), (), None),
        proposal=capture.view_of(session, proposal.experiment_id),
        saved=None,
    )
