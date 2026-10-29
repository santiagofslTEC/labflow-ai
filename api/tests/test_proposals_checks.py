"""Spec 0006's additions to the proposal lifecycle: said text, grounding, and checks
(AC-21, AC-24). Runs against the dev database inside a rolled back transaction."""

from sqlmodel import Session, select

from app.models import Measurement, Proposal, ProposalValue, Turn
from app.models.enums import Grounding, Role, Source
from app.repositories import proposals, turns
from app.services.results import Confirmed, VariableNotInExperiment
from tests.factories import make_notebook


def _turn(session: Session, experiment_id: int, text: str) -> int:
    turn = turns.add_turn(session, experiment_id, Role.USER, text, Source.TEXT)
    assert isinstance(turn, Turn) and turn.id is not None
    return turn.id


def _card(session: Session, experiment_id: int, number: int | None = 6) -> int:
    proposal = proposals.start_proposal(session, experiment_id, number)
    assert isinstance(proposal, Proposal) and proposal.id is not None
    return proposal.id


def test_a_sentence_value_starts_unchecked_and_a_hand_edit_is_checked(session: Session) -> None:
    nb = make_notebook(session)
    card = _card(session, nb.experiment_id)
    turn = _turn(session, nb.experiment_id, "duración 2 horas")
    said = proposals.set_value(session, card, nb.dur, 120, turn, "2 horas", Grounding.MODEL)
    assert isinstance(said, ProposalValue)
    assert (said.said_text, said.grounding, said.checked_at) == ("2 horas", "model", None)

    edit = _turn(session, nb.experiment_id, "Editado: Duración 100 min")
    typed = proposals.set_value(session, card, nb.dur, 100, edit)
    assert isinstance(typed, ProposalValue)
    assert typed.said_text is None and typed.grounding is None and typed.checked_at is not None


def test_check_value_marks_it_and_a_new_sentence_clears_it(session: Session) -> None:
    nb = make_notebook(session)
    card = _card(session, nb.experiment_id)
    turn = _turn(session, nb.experiment_id, "duración 2 horas")
    proposals.set_value(session, card, nb.dur, 120, turn, "2 horas", Grounding.MODEL)

    checked = proposals.check_value(session, card, nb.dur)
    assert isinstance(checked, ProposalValue) and checked.checked_at is not None
    assert isinstance(proposals.check_value(session, card, nb.temp), VariableNotInExperiment)

    again = _turn(session, nb.experiment_id, "duración 120 minutos")
    redo = proposals.set_value(session, card, nb.dur, 120, again, "120 minutos", Grounding.MODEL)
    assert isinstance(redo, ProposalValue) and redo.checked_at is None


def test_setting_or_clearing_the_target_clears_every_check(session: Session) -> None:
    nb = make_notebook(session)
    # Save trial 3 first so the card can target it.
    first = _card(session, nb.experiment_id, 3)
    t = _turn(session, nb.experiment_id, "ensayo 3, rendimiento 74")
    proposals.set_value(session, first, nb.rend, 74, t, "74", Grounding.MODEL)
    saved = proposals.confirm(session, first)
    assert isinstance(saved, Confirmed)

    card = _card(session, nb.experiment_id, 3)
    t2 = _turn(session, nb.experiment_id, "ensayo 3, rendimiento 500")
    proposals.set_value(session, card, nb.rend, 500, t2, "500", Grounding.MODEL)
    proposals.check_value(session, card, nb.rend)
    proposals.set_trial(session, card, None, saved.trial_id)
    row = session.exec(select(ProposalValue).where(ProposalValue.proposal_id == card)).one()
    session.refresh(row)
    assert row.checked_at is None


def test_confirm_copies_said_text(session: Session) -> None:
    nb = make_notebook(session)
    card = _card(session, nb.experiment_id)
    turn = _turn(session, nb.experiment_id, "rendimiento setenta y tres por ciento")
    proposals.set_value(
        session, card, nb.rend, 73, turn, "setenta y tres por ciento", Grounding.MODEL
    )
    result = proposals.confirm(session, card)
    assert isinstance(result, Confirmed)
    measurement = session.exec(
        select(Measurement).where(Measurement.trial_id == result.trial_id)
    ).one()
    assert measurement.said_text == "setenta y tres por ciento"
