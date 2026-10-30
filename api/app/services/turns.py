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
from dataclasses import dataclass, replace

from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session

from app.ai.provider import Decision, LLMProvider, ProviderFailure
from app.models import Proposal, Turn
from app.models.enums import Role, Source
from app.repositories import capture, proposals, turns
from app.services.card_state import VariableInfo
from app.services.proposal_view import ProposalView, Reply, SavedValue, question_of, reply_for
from app.services.replies import (
    SENTENCE_REASONS,
    Reason,
    saved_line,
    saved_still_pending,
    split_saved,
)
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
    SaveNow,
    SetTarget,
    SetTrial,
    SetValue,
    StartProposal,
    Supersede,
    TurnContext,
    TurnPlan,
    Unset,
    plan_before_model,
    plan_turn,
)
from app.services.undo_rules import match_undo

logger = logging.getLogger(__name__)


class SavedTrial(BaseModel):
    model_config = ConfigDict(frozen=True)

    trial_id: int
    trial_number: int
    created: bool
    proposal_id: int  # the save; `POST /api/proposals/{id}/undo` takes it back
    auto: bool = False  # saved with no tap; undo it until the next sentence (spec 0011, AC-10)
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


@dataclass(frozen=True, slots=True)
class Handled:
    """A turn's response, plus the card it started, so a newer voice request for the same
    turn can take that card back with its save (spec 0011, AC-13)."""

    response: TurnResponse
    started: int | None = None


def _always() -> bool:
    return True


type TurnError = ExperimentNotFound | LLMUnavailable | NotPending | TrialNotInExperiment

# The card's own question, read back from the database after the operations ran. An auto
# save that left a card (a slot filled in between, spec 0011 AC-12) asks that card's.
_CARD_REASONS = frozenset(
    {
        Reason.AUTO_SAVED,
        Reason.READY,
        Reason.MISSING_TRIAL,
        Reason.TRIAL_SELECTED,
        Reason.CHECK_VALUES,
        Reason.CONFIRM_CHANGE,
    }
)


@dataclass(frozen=True, slots=True)
class Executed:
    """`reason` None means "the pending card's own question"."""

    reason: Reason | None
    variable_ids: tuple[int, ...]
    saved: SavedTrial | None
    said: tuple[str, ...] = ()
    started: int | None = None  # the card this turn created


@dataclass(frozen=True, slots=True)
class _Saved:
    saved: SavedTrial | None
    started: int | None


def _save_now(
    session: Session, context: TurnContext, op: SaveNow, turn_id: int, holder: str
) -> _Saved:
    """The saved half of a split (spec 0011, AC-5, AC-12). A value whose slot was filled in
    between is not written: it moves onto the card, where "¿Cambio…?" asks. The waiting
    card always targets the trial the save wrote."""
    experiment_id = context.experiment_id
    values = tuple(replace(v, turn_id=turn_id) if v.turn_id is None else v for v in op.values)
    done = proposals.save_now(session, experiment_id, op.trial_number, values, holder, commit=False)
    pending = proposals.get_pending(session, experiment_id)
    started: int | None = None
    skipped = [v for v in values if v.variable_id in done.skipped]
    if skipped and pending is None:
        new = proposals.start_proposal(session, experiment_id, op.trial_number, commit=False)
        assert isinstance(new, Proposal)  # the number was valid for the save just above
        pending, started = new, new.id
    if pending is not None and pending.id is not None and pending.trial_number == op.trial_number:
        if pending.target_trial_id is None:
            proposals.set_trial(session, pending.id, None, done.trial_id, commit=False)
        for v in skipped:
            assert v.turn_id is not None
            proposals.set_value(
                session,
                pending.id,
                v.variable_id,
                v.value,
                v.turn_id,
                v.said_text,
                v.grounding,
                commit=False,
            )
    # A skipped value with another trial's card waiting (AC-9) is not kept: only one card
    # may wait, and the reply lists only what was saved.
    saved = (
        None
        if done.proposal_id is None
        else saved_trial(session, done.proposal_id, done.trial_id, done.created_trial, auto=True)
    )
    return _Saved(saved, started)


def execute(
    session: Session, context: TurnContext, plan: TurnPlan, turn_id: int, holder: str
) -> Executed | NotPending | TrialNotInExperiment:
    """Apply the operations in order as one transaction (spec 0011): each step only
    flushes and the turn commits at the end. A typed error partway rolls the whole turn
    back and stops the rest: some become a reply (the card asks), the others an HTTP error
    at the router."""
    experiment_id = context.experiment_id
    proposal_id = context.card.id if context.card else None
    saved: SavedTrial | None = None
    started: int | None = None
    for op in plan.operations:
        if isinstance(op, StartProposal):
            begun = proposals.start_proposal(session, experiment_id, op.trial_number, commit=False)
            if isinstance(begun, InvalidTrialNumber):
                return Executed(Reason.MISSING_TRIAL, (), None)
            if isinstance(begun, ExperimentNotFound):
                raise AssertionError("the experiment was checked when the turn was stored")
            proposal_id = started = begun.id
            continue
        if isinstance(op, SaveNow):
            done = _save_now(session, context, op, turn_id, holder)
            saved, started = done.saved, done.started or started
            continue
        if proposal_id is None:
            continue  # nothing to act on; the plan's reply still stands
        match op:
            case SetTrial(trial_number=n):
                result = proposals.set_trial(session, proposal_id, n, None, commit=False)
            case SetTarget(trial_id=trial_id):
                result = proposals.set_trial(session, proposal_id, None, trial_id, commit=False)
            case SetValue():
                result = proposals.set_value(
                    session,
                    proposal_id,
                    op.variable_id,
                    op.value,
                    op.turn_id if op.turn_id is not None else turn_id,
                    op.said_text,
                    op.grounding,
                    commit=False,
                )
            case Unset(variable_ids=ids):
                result = proposals.unset_values(session, proposal_id, ids, commit=False)
            case Supersede():
                result = proposals.supersede(session, proposal_id, commit=False)
            case Discard():
                result = proposals.discard(session, proposal_id, commit=False)
            case Confirm():
                confirmed = proposals.confirm(session, proposal_id, holder, commit=False)
                match confirmed:
                    case Confirmed(trial_id=trial_id, created_trial=created):
                        session.commit()
                        done = saved_trial(session, proposal_id, trial_id, created, auto=False)
                        return Executed(Reason.SAVED, (), done)
                    case MissingTrialNumber():
                        return Executed(Reason.MISSING_TRIAL, (), None)
                    case TrialExists() | EmptyProposal():
                        return Executed(None, (), None)  # the card asks again
                    case NotPending() | ProposalNotFound():
                        return NotPending()
        match result:
            case NotPending() | ProposalNotFound():
                return NotPending()
            case TrialNotInExperiment():
                return result
            case InvalidTrialNumber():
                return Executed(Reason.MISSING_TRIAL, (), None)
            case _:
                pass
    session.commit()
    return Executed(plan.reason, plan.variable_ids, saved, plan.said, started)


def saved_trial(
    session: Session, proposal_id: int, trial_id: int, created: bool, auto: bool
) -> SavedTrial:
    """What a save wrote, read back from the database."""
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
    """The reply text, from the database: `{n}` is the card's number, else the saved
    trial's. A turn that saved and still asks joins both (spec 0011, AC-5, AC-9)."""
    saved, reason = executed.saved, executed.reason
    n = view.trial_number if view is not None else saved.trial_number if saved else None
    from_card = view is not None and (reason is None or reason in _CARD_REASONS)
    if view is not None and from_card:
        question = view.question
    else:
        question = reply_for(
            reason or Reason.NO_PENDING, executed.variable_ids, variables, n, executed.said
        )
    if saved is None:
        return question
    if not saved.auto:
        return reply_for(Reason.SAVED, (), (), saved.trial_number)
    line = saved_line(saved.trial_number, [(v.value, v.unit) for v in saved.values])
    if view is None and reason not in SENTENCE_REASONS:
        return Reply(reason=Reason.AUTO_SAVED, text=line)
    if view is not None and view.trial_number != saved.trial_number:
        return Reply(reason=question.reason, text=saved_still_pending(line, question.text))
    if view is not None and from_card:
        return Reply(reason=question.reason, text=split_saved(line, question_of(view, False)))
    return Reply(reason=question.reason, text=split_saved(line, question.text))


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
    plan_for: Callable[[TurnContext], TurnPlan],
    turn_id: int,
    holder: str,
) -> Handled | NotPending | TrialNotInExperiment:
    # The stale check: if the card changed while the model was thinking (another tab, a
    # double submit), plan the same tool call once more against the fresh state.
    fresh = capture.pending_card(session, context.experiment_id)
    seen = context.card
    if (fresh and (fresh.id, fresh.updated_at)) != (seen and (seen.id, seen.updated_at)):
        reloaded = capture.load_context(session, context.experiment_id)
        if isinstance(reloaded, ExperimentNotFound):
            return NotPending()
        context = reloaded
    executed = execute(session, context, plan_for(context), turn_id, holder)
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
    response = TurnResponse(turn_id=turn_id, reply=reply, proposal=view, saved=executed.saved)
    return Handled(response, executed.started)


def _undo_turn(
    session: Session, experiment_id: int, text: str, source: Source
) -> Handled | ExperimentNotFound:
    """A spoken "deshacer" (spec 0007, AC-7; spec 0011, AC-10): take back the last auto
    save while no sentence came after it, even when the same turn left a card waiting;
    else discard a pending card. Runs before the user turn is stored, because an undo ends
    with the next sentence."""
    taken = proposals.take_back_last(session, experiment_id)
    reason = Reason.UNDONE if taken is not None else Reason.NOTHING_TO_UNDO
    if taken is None and (pending := proposals.get_pending(session, experiment_id)) is not None:
        assert pending.id is not None
        dropped = proposals.discard(session, pending.id)
        reason = Reason.DISCARDED if isinstance(dropped, Proposal) else Reason.NOTHING_TO_UNDO
    user = turns.add_turn(session, experiment_id, Role.USER, text, source)
    if isinstance(user, ExperimentNotFound):
        return user
    reply = reply_for(reason, (), (), taken.trial_number if taken else None)
    turns.add_turn(session, experiment_id, Role.ASSISTANT, reply.text, None, tool_name=reason)
    view = capture.view_of(session, experiment_id)
    return Handled(TurnResponse(turn_id=user.id, reply=reply, proposal=view, saved=None))


async def run_turn(
    session: Session,
    provider: LLMProvider | None,
    experiment_id: int,
    text: str,
    source: Source,
    holder: str,
    may_write: Callable[[], bool] = _always,
) -> Handled | TurnError | Superseded:
    """`may_write` is asked once, after the model and right before the plan is applied; a
    voice turn passes its run's gate so a superseded request writes nothing. A bare trial
    ("ensayo 4") is planned by code with no model call (spec 0011, AC-8)."""
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
    early = plan_before_model(context, text)
    outcome: Decision | ProviderFailure | None
    if early is not None:
        outcome = None
    elif provider is None:
        outcome = ProviderFailure("none", "no_key")
    else:
        outcome = await provider.decide(context, text)
    llm_ms = (time.perf_counter() - llm_started) * 1000

    def plan_for(fresh: TurnContext) -> TurnPlan:
        if isinstance(outcome, Decision):
            return plan_turn(fresh, outcome.call, text)
        return plan_before_model(fresh, text) or early or TurnPlan((), Reason.NO_PENDING)

    result: Handled | TurnError | Superseded
    if isinstance(outcome, ProviderFailure):
        result = LLMUnavailable()  # the user turn stays; no assistant turn
    elif not may_write():
        result = Superseded()  # the user turn stays as a record; nothing else is written
    else:
        db_started = time.perf_counter()
        result = await run_in_threadpool(_apply, session, context, plan_for, turn.id, holder)
        db_ms += (time.perf_counter() - db_started) * 1000

    response = result.response if isinstance(result, Handled) else None
    log = {
        "event": "turn",
        "experiment_id": experiment_id,
        "holder": holder,
        "source": source.value,
        "llm_provider": "code" if outcome is None else outcome.provider,
        "llm_ms": round(llm_ms),
        "fallback_reason": outcome.fallback_reason
        if isinstance(outcome, Decision)
        else outcome.reason
        if outcome is not None
        else None,
        "db_ms": round(db_ms),
        "total_ms": round((time.perf_counter() - started) * 1000),
        "reason": response.reply.reason
        if response is not None and response.reply
        else getattr(result, "code", None),
    }
    logger.info(json.dumps(log))
    return result


async def handle_utterance(
    session: Session,
    provider: LLMProvider | None,
    experiment_id: int,
    text: str,
    source: Source,
    holder: str,
    may_write: Callable[[], bool] = _always,
) -> TurnResponse | TurnError | Superseded:
    """`run_turn` for a caller that needs only the response."""
    result = await run_turn(session, provider, experiment_id, text, source, holder, may_write)
    return result.response if isinstance(result, Handled) else result
