"""One capture turn (spec 0006, The executor): store the user turn, read the context, ask the
model, check the card did not change meanwhile, apply the plan through the repositories,
store the assistant turn, and answer with the card read back from the database.

The model call is the only await; database work runs in the threadpool because the
repositories use sync sessions. `source` is a parameter so voice (spec 0007) can pass `voice`.
"""

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session

from app.ai.provider import Decision, LLMProvider, ProviderFailure
from app.models import Proposal, Turn
from app.models.enums import Role, Source
from app.repositories import capture, proposals, turns
from app.services.card_state import VariableInfo
from app.services.proposal_view import ProposalView, Reply, SavedValue, reply_for
from app.services.replies import Reason
from app.services.results import (
    Confirmed,
    EmptyProposal,
    ExperimentNotFound,
    InvalidTrialNumber,
    MissingTrialNumber,
    NotPending,
    ProposalNotFound,
    TrialExists,
    TrialNotInExperiment,
)
from app.services.turn_plan import (
    Confirm,
    Discard,
    SetTarget,
    SetTrial,
    SetValue,
    StartProposal,
    TurnContext,
    TurnPlan,
    plan_turn,
)
from app.services.undo_rules import match_undo

logger = logging.getLogger(__name__)


class SavedTrial(BaseModel):
    model_config = ConfigDict(frozen=True)

    trial_id: int
    trial_number: int
    created: bool
    proposal_id: int  # the card that saved it; `POST /api/proposals/{id}/undo` takes it back
    auto: bool = False  # saved with no tap; undo it until the next sentence (AC-27, AC-29)
    values: list[SavedValue] = []  # what the save wrote, in position order


class TurnResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    turn_id: int | None
    reply: Reply | None
    proposal: ProposalView | None
    saved: SavedTrial | None


@dataclass(frozen=True, slots=True)
class LLMUnavailable:
    """Both providers failed, or the deadline passed (AC-14)."""

    code: str = "llm_unavailable"


@dataclass(frozen=True, slots=True)
class Superseded:
    """A newer request took this voice turn before it wrote anything (spec 0007, AC-14)."""

    code: str = "superseded"


def _always() -> bool:
    return True


type TurnError = ExperimentNotFound | LLMUnavailable | NotPending | TrialNotInExperiment


@dataclass(frozen=True, slots=True)
class Executed:
    reason: Reason
    variable_ids: tuple[int, ...]
    saved: SavedTrial | None
    said: tuple[str, ...] = ()


def execute(
    session: Session, context: TurnContext, plan: TurnPlan, turn_id: int, holder: str
) -> Executed | NotPending | TrialNotInExperiment:
    """Apply the operations in order. A typed error partway stops the rest: some become a
    reply (the card asks), the others an HTTP error at the router."""
    proposal_id = context.card.id if context.card else None
    for op in plan.operations:
        if isinstance(op, StartProposal):
            started = proposals.start_proposal(session, context.experiment_id, op.trial_number)
            if isinstance(started, InvalidTrialNumber):
                return Executed(Reason.MISSING_TRIAL, (), None)
            if isinstance(started, ExperimentNotFound):
                raise AssertionError("the experiment was checked when the turn was stored")
            proposal_id = started.id
            continue
        if proposal_id is None:
            break  # nothing to act on; the plan's reply still stands
        match op:
            case SetTrial(trial_number=n):
                result = proposals.set_trial(session, proposal_id, n, None)
            case SetTarget(trial_id=trial_id):
                result = proposals.set_trial(session, proposal_id, None, trial_id)
            case SetValue():
                result = proposals.set_value(
                    session,
                    proposal_id,
                    op.variable_id,
                    op.value,
                    op.turn_id if op.turn_id is not None else turn_id,
                    op.said_text,
                    op.grounding,
                )
            case Confirm(auto=auto):
                confirmed = proposals.confirm(session, proposal_id, holder, auto)
                match confirmed:
                    case Confirmed(trial_id=trial_id, created_trial=created):
                        saved = saved_trial(session, proposal_id, trial_id, created, auto)
                        return Executed(Reason.AUTO_SAVED if auto else Reason.SAVED, (), saved)
                    case TrialExists():
                        return Executed(Reason.CHOOSE_TRIAL, (), None)
                    case MissingTrialNumber():
                        return Executed(Reason.MISSING_TRIAL, (), None)
                    case EmptyProposal():
                        return Executed(Reason.MISSING_VALUES, (), None)
                    case NotPending() | ProposalNotFound():
                        return NotPending()
            case Discard():
                result = proposals.discard(session, proposal_id)
        match result:
            case NotPending() | ProposalNotFound():
                return NotPending()
            case TrialNotInExperiment():
                return result
            case InvalidTrialNumber():
                return Executed(Reason.MISSING_TRIAL, (), None)
            case _:
                pass
    return Executed(plan.reason, plan.variable_ids, None, plan.said)


def saved_trial(
    session: Session, proposal_id: int, trial_id: int, created: bool, auto: bool
) -> SavedTrial:
    """What a confirm saved, read back from the database."""
    number = capture.trial_number_of(session, trial_id)
    return SavedTrial(
        trial_id=trial_id,
        trial_number=number,
        created=created,
        proposal_id=proposal_id,
        auto=auto,
        values=capture.saved_values(session, proposal_id),
    )


def reply_after(
    executed: Executed, view: ProposalView | None, variables: tuple[VariableInfo, ...]
) -> Reply:
    """The reply text; `{n}` is the saved trial's number, else the card's, from the database."""
    if executed.saved is not None:
        n: int | None = executed.saved.trial_number
    else:
        n = view.trial_number if view is not None else None
    return reply_for(executed.reason, executed.variable_ids, variables, n, executed.said)


def _store_user_turn(
    session: Session, experiment_id: int, text: str, source: Source
) -> tuple[Turn, TurnContext] | ExperimentNotFound:
    turn = turns.add_turn(session, experiment_id, Role.USER, text, source)
    if isinstance(turn, ExperimentNotFound):
        return turn
    context = capture.load_context(session, experiment_id)
    if isinstance(context, ExperimentNotFound):
        return context
    return turn, context


def _apply(
    session: Session,
    context: TurnContext,
    decision: Decision,
    utterance: str,
    turn_id: int,
    holder: str,
) -> TurnResponse | NotPending | TrialNotInExperiment:
    # The stale check: if the card changed while the model was thinking (another tab, a
    # double submit), plan the same tool call once more against the fresh state.
    fresh = capture.pending_card(session, context.experiment_id)
    seen = context.card
    if (fresh and (fresh.id, fresh.updated_at)) != (seen and (seen.id, seen.updated_at)):
        reloaded = capture.load_context(session, context.experiment_id)
        if isinstance(reloaded, ExperimentNotFound):
            return NotPending()
        context = reloaded
    plan = plan_turn(context, decision.call, utterance)
    executed = execute(session, context, plan, turn_id, holder)
    if not isinstance(executed, Executed):
        return executed
    view = capture.view_of(session, context.experiment_id)
    reply = reply_after(executed, view, context.variables)
    stored = turns.add_turn(
        session,
        context.experiment_id,
        Role.ASSISTANT,
        reply.text,
        None,
        tool_name=reply.reason,
        variable_ids=executed.variable_ids,
    )
    assert isinstance(stored, Turn)
    return TurnResponse(turn_id=turn_id, reply=reply, proposal=view, saved=executed.saved)


def _undo_turn(
    session: Session, experiment_id: int, text: str, source: Source
) -> TurnResponse | ExperimentNotFound:
    """A spoken "deshacer" (spec 0007, AC-7): discard a pending card, else take back the last
    auto save. Runs before the user turn is stored, because spec 0006's undo ends with the
    next sentence."""
    pending = proposals.get_pending(session, experiment_id)
    taken = None
    if pending is not None and pending.id is not None:
        dropped = proposals.discard(session, pending.id)
        reason = Reason.DISCARDED if isinstance(dropped, Proposal) else Reason.NOTHING_TO_UNDO
    else:
        taken = proposals.take_back_last(session, experiment_id)
        reason = Reason.UNDONE if taken is not None else Reason.NOTHING_TO_UNDO
    user = turns.add_turn(session, experiment_id, Role.USER, text, source)
    if isinstance(user, ExperimentNotFound):
        return user
    reply = reply_for(reason, (), (), taken.trial_number if taken else None)
    turns.add_turn(session, experiment_id, Role.ASSISTANT, reply.text, None, tool_name=reason)
    view = capture.view_of(session, experiment_id)
    return TurnResponse(turn_id=user.id, reply=reply, proposal=view, saved=None)


async def handle_utterance(
    session: Session,
    provider: LLMProvider | None,
    experiment_id: int,
    text: str,
    source: Source,
    holder: str,
    may_write: Callable[[], bool] = _always,
) -> TurnResponse | TurnError | Superseded:
    """`may_write` is asked once, after the model and right before the plan is applied; a
    voice turn passes its run's gate so a superseded request writes nothing."""
    if source == Source.VOICE and match_undo(text):
        if not may_write():
            return Superseded()
        return await run_in_threadpool(_undo_turn, session, experiment_id, text, source)
    started = time.perf_counter()
    stored = await run_in_threadpool(_store_user_turn, session, experiment_id, text, source)
    if isinstance(stored, ExperimentNotFound):
        return stored
    turn, context = stored
    assert turn.id is not None
    db_ms = (time.perf_counter() - started) * 1000

    llm_started = time.perf_counter()
    outcome = (
        ProviderFailure("none", "no_key")
        if provider is None
        else await provider.decide(context, text)
    )
    llm_ms = (time.perf_counter() - llm_started) * 1000

    result: TurnResponse | TurnError | Superseded
    if isinstance(outcome, ProviderFailure):
        result = LLMUnavailable()  # the user turn stays; no assistant turn
    elif not may_write():
        result = Superseded()  # the user turn stays as a record; nothing else is written
    else:
        db_started = time.perf_counter()
        result = await run_in_threadpool(_apply, session, context, outcome, text, turn.id, holder)
        db_ms += (time.perf_counter() - db_started) * 1000

    log = {
        "event": "turn",
        "experiment_id": experiment_id,
        "holder": holder,
        "source": source.value,
        "llm_provider": outcome.provider,
        "llm_ms": round(llm_ms),
        "fallback_reason": outcome.fallback_reason
        if isinstance(outcome, Decision)
        else outcome.reason,
        "db_ms": round(db_ms),
        "total_ms": round((time.perf_counter() - started) * 1000),
        "reason": result.reply.reason
        if isinstance(result, TurnResponse) and result.reply
        else getattr(result, "code", None),
    }
    logger.info(json.dumps(log))
    return result
