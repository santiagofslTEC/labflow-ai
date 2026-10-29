"""The planner, flags, replies, and card view (spec 0006, AC-3 to AC-12, AC-17, AC-21 to
AC-24). Pure, no database, no model: each test passes in the exact tool call it wants."""

from dataclasses import replace

import pytest

from app.ai.tools import (
    Confirmar,
    Corregir,
    Descartar,
    ElegirEnsayo,
    ExtractedValue,
    PedirAclaracion,
    ProponerMedicion,
    parse_tool_call,
)
from app.models.enums import Grounding, Source
from app.services.card_state import CardInfo, RememberedTrial, ValueInfo, VariableInfo
from app.services.flags import FlagReason, flags, interpreted
from app.services.proposal_view import proposal_view
from app.services.replies import Reason, reply_text
from app.services.turn_plan import (
    Confirm,
    Discard,
    LastQuestion,
    SetTarget,
    SetTrial,
    SetValue,
    StartProposal,
    TurnContext,
    plan_turn,
)

TEMP, DUR, REND = 1, 2, 3
VARIABLES = (
    VariableInfo(TEMP, "Temperatura", "°C", True, 0, 20.0, 100.0, ("temp",)),
    VariableInfo(DUR, "Duración", "min", True, 1, 0.0, 180.0),
    VariableInfo(REND, "Rendimiento", "%", True, 2, 0.0, 100.0),
)
SAVED = {3: 33}  # trial 3 is saved, id 33


def ctx(card: CardInfo | None = None) -> TurnContext:
    return TurnContext(1, VARIABLES, card, SAVED)


def ev(
    variable_id: int, number_text: str, value: float, unit_text: str | None = None
) -> ExtractedValue:
    return ExtractedValue(
        variable_id=variable_id, number_text=number_text, value=value, unit_text=unit_text
    )


def card6(*values: ValueInfo, number: int | None = 6, target: int | None = None) -> CardInfo:
    return CardInfo(id=10, trial_number=number, target_trial_id=target, values=values)


def model_value(variable_id: int, value: float, said: str, checked: bool = False) -> ValueInfo:
    return ValueInfo(variable_id, value, said, Grounding.MODEL, checked)


# --- AC-1, AC-21: the happy path ---


def test_full_sentence_starts_a_card_with_three_values() -> None:
    sentence = "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento"
    call = ProponerMedicion(
        trial_number=6,
        values=[
            ev(TEMP, "65", 65, "grados"),
            ev(DUR, "20", 20, "minutos"),
            ev(REND, "74", 74, "por ciento"),
        ],
    )
    plan = plan_turn(ctx(), call, sentence)
    assert plan.operations == (
        StartProposal(6),
        SetValue(TEMP, 65.0, "65 grados", Grounding.MODEL),
        SetValue(DUR, 20.0, "20 minutos", Grounding.MODEL),
        SetValue(REND, 74.0, "74 por ciento", Grounding.MODEL),
        Confirm(auto=True),
    )
    assert plan.reason == Reason.AUTO_SAVED  # clean: saved with no tap (AC-27)


# --- AC-3, AC-4, AC-5: parts and corrections ---


def test_missing_values_names_the_required_ones() -> None:
    plan = plan_turn(
        ctx(), ProponerMedicion(trial_number=6, values=[ev(TEMP, "65", 65)]), "Ensayo 6, 65 grados"
    )
    assert plan.reason == Reason.MISSING_VALUES
    assert plan.variable_ids == (DUR, REND)
    assert reply_text(Reason.MISSING_VALUES, ["Duración", "Rendimiento"]) == (
        "Me falta Duración y Rendimiento. ¿Cuánto fueron?"
    )


def test_a_part_adds_to_the_pending_card() -> None:
    card = card6(model_value(TEMP, 65, "65 grados"))
    plan = plan_turn(ctx(card), ProponerMedicion(values=[ev(REND, "74", 74)]), "rendimiento 74")
    assert plan.operations == (SetValue(REND, 74.0, "74", Grounding.MODEL),)
    assert plan.reason == Reason.MISSING_VALUES and plan.variable_ids == (DUR,)


def test_a_spoken_correction_replaces_the_value() -> None:
    card = card6(model_value(REND, 74, "74"))
    sentence = "No, el rendimiento es setenta y tres"
    plan = plan_turn(ctx(card), Corregir(values=[ev(REND, "setenta y tres", 73)]), sentence)
    assert plan.operations == (SetValue(REND, 73.0, "setenta y tres", Grounding.MODEL),)


# --- AC-6, AC-7, AC-8: trial rules ---


def test_no_trial_number_asks_for_it() -> None:
    plan = plan_turn(ctx(), ProponerMedicion(values=[ev(TEMP, "50", 50)]), "temperatura 50 grados")
    assert plan.operations[0] == StartProposal(None)
    assert plan.reason == Reason.MISSING_TRIAL


def test_a_numberless_card_takes_the_number() -> None:
    card = card6(model_value(TEMP, 50, "50"), number=None)
    plan = plan_turn(ctx(card), ProponerMedicion(trial_number=6), "ensayo 6")
    assert plan.operations == (SetTrial(6),)
    assert plan.reason == Reason.MISSING_VALUES


def test_a_saved_number_asks_correction_or_new() -> None:
    plan = plan_turn(
        ctx(),
        ProponerMedicion(trial_number=3, values=[ev(REND, "73", 73)]),
        "ensayo 3, rendimiento 73",
    )
    assert plan.reason == Reason.CHOOSE_TRIAL


def test_choosing_correction_sets_the_target() -> None:
    card = card6(model_value(REND, 73, "73"), number=3)
    plan = plan_turn(ctx(card), ElegirEnsayo(kind="correccion"), "es corrección")
    assert plan.operations == (SetTarget(33),)
    assert plan.reason == Reason.MISSING_VALUES  # a correction may update only some values


def test_choosing_new_clears_the_number_or_sets_it() -> None:
    card = card6(model_value(REND, 73, "73"), number=3)
    assert plan_turn(ctx(card), ElegirEnsayo(kind="nuevo"), "es otro ensayo").operations == (
        SetTrial(None),
    )
    assert plan_turn(
        ctx(card), ElegirEnsayo(kind="nuevo", trial_number=7), "es el ensayo 7"
    ).operations == (SetTrial(7),)


def test_another_trial_while_one_is_pending_asks_and_changes_nothing() -> None:
    card = card6(model_value(TEMP, 65, "65"))
    plan = plan_turn(
        ctx(card),
        ProponerMedicion(trial_number=7, values=[ev(TEMP, "60", 60)]),
        "Ensayo 7, 60 grados",
    )
    assert plan.operations == ()
    assert plan.reason == Reason.PENDING_OTHER_TRIAL


def test_a_trial_number_not_in_the_sentence_is_ignored() -> None:
    plan = plan_turn(
        ctx(), ProponerMedicion(trial_number=9, values=[ev(TEMP, "65", 65)]), "temperatura 65"
    )
    assert plan.operations[0] == StartProposal(None)


# --- AC-2, AC-13, AC-24: confirm and discard ---


def test_si_confirms_a_ready_card() -> None:
    card = card6(
        model_value(TEMP, 65, "65"), model_value(DUR, 20, "20"), model_value(REND, 74, "74")
    )
    assert plan_turn(ctx(card), Confirmar(), "sí, guárdalo").operations == (Confirm(),)


def test_si_with_numbers_is_not_a_confirm() -> None:
    card = card6(
        model_value(TEMP, 65, "65"), model_value(DUR, 20, "20"), model_value(REND, 74, "74")
    )
    plan = plan_turn(ctx(card), Confirmar(), "sí, ensayo 7")
    assert plan.operations == () and plan.reason == Reason.READY


def test_si_with_no_card_and_discard_with_no_card() -> None:
    assert plan_turn(ctx(), Confirmar(), "sí").reason == Reason.NO_PENDING
    assert plan_turn(ctx(), Descartar(), "descártalo").reason == Reason.NO_PENDING
    assert plan_turn(ctx(card6()), Descartar(), "descártalo").operations == (Discard(),)


def test_si_on_an_unchecked_flagged_card_asks_to_check() -> None:
    card = card6(
        model_value(TEMP, 500, "500"), model_value(DUR, 20, "20"), model_value(REND, 74, "74")
    )
    plan = plan_turn(ctx(card), Confirmar(), "sí, guárdalo")
    assert plan.operations == ()
    assert plan.reason == Reason.CHECK_VALUES and plan.variable_ids == (TEMP,)


# --- AC-9, AC-10, AC-11, AC-21: grounding, units, and variables ---


def test_hours_convert_and_keep_the_said_words() -> None:
    plan = plan_turn(
        ctx(card6()), ProponerMedicion(values=[ev(DUR, "2", 2, "horas")]), "duración 2 horas"
    )
    assert plan.operations == (SetValue(DUR, 120.0, "2 horas", Grounding.MODEL),)


def test_kelvin_converts() -> None:
    plan = plan_turn(
        ctx(card6()),
        ProponerMedicion(values=[ev(TEMP, "338,15", 338.15, "kelvin")]),
        "338,15 kelvin",
    )
    assert plan.operations == (SetValue(TEMP, 65.0, "338,15 kelvin", Grounding.MODEL),)


def test_a_wrong_kind_of_unit_asks() -> None:
    plan = plan_turn(
        ctx(card6()),
        ProponerMedicion(values=[ev(TEMP, "65", 65, "pascales")]),
        "temperatura 65 pascales",
    )
    assert plan.operations == ()
    assert plan.reason == Reason.UNKNOWN_UNIT and plan.variable_ids == (TEMP,)


def test_a_minutes_unit_on_a_temperature_asks() -> None:
    plan = plan_turn(
        ctx(card6()),
        ProponerMedicion(values=[ev(TEMP, "65", 65, "minutos")]),
        "temperatura 65 minutos",
    )
    assert plan.reason == Reason.UNKNOWN_UNIT


def test_an_invented_number_never_reaches_the_card() -> None:
    plan = plan_turn(ctx(card6()), ProponerMedicion(values=[ev(REND, "75", 75)]), "rendimiento 74")
    assert plan.operations == ()
    assert plan.reason == Reason.UNCLEAR_NUMBER and plan.variable_ids == (REND,)


def test_the_trial_number_is_never_a_value() -> None:
    plan = plan_turn(ctx(), ProponerMedicion(trial_number=6, values=[ev(TEMP, "6", 6)]), "ensayo 6")
    assert plan.operations == (StartProposal(6),)
    assert plan.reason == Reason.UNCLEAR_NUMBER


def test_code_fallback_accepts_a_paraphrase_and_flags_it() -> None:
    plan = plan_turn(
        ctx(card6()), ProponerMedicion(values=[ev(REND, "73", 73)]), "rendimiento setenta y tres"
    )
    assert plan.operations == (SetValue(REND, 73.0, "setenta y tres", Grounding.CODE),)


def test_two_values_for_one_variable_are_both_dropped_and_quoted() -> None:
    call = ProponerMedicion(values=[ev(TEMP, "60", 60), ev(TEMP, "50", 50)])
    plan = plan_turn(ctx(card6()), call, "temperatura 50 grados a 60")
    assert plan.operations == ()
    assert plan.reason == Reason.TWO_VALUES and plan.variable_ids == (TEMP,)
    assert plan.said == ("50 grados", "60")
    assert reply_text(Reason.TWO_VALUES, ["Temperatura"], said=plan.said) == (
        "Dijiste 50 grados y 60 para Temperatura. ¿Cuál guardo?"
    )


def test_two_values_with_one_not_in_the_sentence_is_ambiguous() -> None:
    call = ProponerMedicion(values=[ev(TEMP, "50", 50), ev(TEMP, "60", 60)])
    plan = plan_turn(ctx(card6()), call, "temperatura 50")
    assert plan.reason == Reason.AMBIGUOUS_VARIABLE and plan.variable_ids == (TEMP,)


# --- Short answers: code plans a reply to the question just asked ---


def asked(reason: Reason, sentence: str, *ids: int, turn_id: int = 40) -> LastQuestion:
    return LastQuestion(reason, ids, sentence, turn_id)


def after(question: LastQuestion, card: CardInfo | None = None) -> TurnContext:
    return replace(ctx(card), last_question=question)


@pytest.mark.parametrize("answer", ["5", "el 5", "es el ensayo 5", "Ensayo número 5."])
def test_a_bare_number_after_missing_trial_sets_the_trial(answer: str) -> None:
    card = card6(model_value(TEMP, 65, "65"), number=None)
    context = after(asked(Reason.MISSING_TRIAL, "temperatura 65"), card)
    plan = plan_turn(context, PedirAclaracion(reason="ambiguous_variable"), answer)
    assert plan.operations == (SetTrial(5),) and plan.reason == Reason.MISSING_VALUES


@pytest.mark.parametrize("answer", ["rendimiento 5", "5 y 6", "cinco coma dos", "0"])
def test_more_than_a_bare_whole_number_is_left_to_the_model(answer: str) -> None:
    card = card6(model_value(TEMP, 65, "65"), number=None)
    context = after(asked(Reason.MISSING_TRIAL, "temperatura 65"), card)
    plan = plan_turn(context, PedirAclaracion(reason="ambiguous_variable"), answer)
    assert SetTrial(5) not in plan.operations and plan.reason == Reason.AMBIGUOUS_VARIABLE


def test_a_bare_number_after_two_values_sets_that_variable() -> None:
    context = after(asked(Reason.TWO_VALUES, "temperatura 23 a 71", TEMP))
    plan = plan_turn(context, PedirAclaracion(reason="ambiguous_variable"), "71 grados")
    assert plan.operations == (
        StartProposal(None),
        SetValue(TEMP, 71.0, "71 grados", Grounding.MODEL),
    )


@pytest.mark.parametrize("answer", ["si", "Sí.", "sí, es esa", "correcto", "claro"])
def test_si_accepts_the_one_suggested_variable_from_the_earlier_sentence(answer: str) -> None:
    context = after(asked(Reason.AMBIGUOUS_VARIABLE, "ensayo 6, reflujo 71", TEMP), card6())
    plan = plan_turn(context, Confirmar(), answer)
    assert plan.operations == (SetValue(TEMP, 71.0, "71", Grounding.MODEL, turn_id=40),)


def test_si_skips_numbers_already_placed_from_that_sentence() -> None:
    placed = ValueInfo(REND, 74, "74", Grounding.MODEL, turn_id=40)
    context = after(asked(Reason.AMBIGUOUS_VARIABLE, "74 y reflujo 71", TEMP), card6(placed))
    plan = plan_turn(context, Confirmar(), "sí")
    assert plan.operations == (SetValue(TEMP, 71.0, "71", Grounding.MODEL, turn_id=40),)


@pytest.mark.parametrize(
    ("question", "answer"),
    [
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71", TEMP, DUR), "sí"),  # two candidates
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71 y 72", TEMP), "sí"),  # two numbers
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71", TEMP), "sí, guárdalo"),
        (asked(Reason.READY, "ensayo 6, 65", TEMP), "sí"),
    ],
)
def test_other_answers_go_to_the_model(question: LastQuestion, answer: str) -> None:
    plan = plan_turn(after(question, card6()), Confirmar(), answer)
    assert all(not isinstance(op, SetValue) for op in plan.operations)


def test_one_number_for_two_variables_drops_both() -> None:
    call = ProponerMedicion(values=[ev(TEMP, "50", 50), ev(REND, "50", 50)])
    plan = plan_turn(ctx(card6()), call, "50 grados")
    assert plan.operations == ()
    assert plan.reason == Reason.AMBIGUOUS_VARIABLE and set(plan.variable_ids) == {TEMP, REND}


def test_the_same_number_for_two_variables_said_twice_is_fine() -> None:
    call = ProponerMedicion(values=[ev(DUR, "20", 20), ev(REND, "20", 20)])
    plan = plan_turn(ctx(card6()), call, "duración 20, rendimiento 20")
    assert len(plan.operations) == 2


def test_a_number_with_no_variable_lists_the_candidates() -> None:
    plan = plan_turn(ctx(), ProponerMedicion(trial_number=6), "ensayo 6, cincuenta")
    assert plan.reason == Reason.AMBIGUOUS_VARIABLE
    assert plan.variable_ids == (TEMP, DUR, REND)


def test_a_variable_outside_the_experiment_is_dropped() -> None:
    plan = plan_turn(ctx(card6()), ProponerMedicion(values=[ev(99, "50", 50)]), "presión 50")
    assert plan.operations == () and plan.reason == Reason.AMBIGUOUS_VARIABLE


def test_a_unit_text_with_no_unit_word_after_the_number_asks() -> None:
    plan = plan_turn(
        ctx(card6()), ProponerMedicion(values=[ev(DUR, "2", 2, "horas")]), "2 de duración en horas"
    )
    assert plan.reason == Reason.UNKNOWN_UNIT


# --- AC-12: off topic and unknown tools ---


def test_unknown_tools_become_not_supported_yet() -> None:
    assert parse_tool_call("graficar", {"x": 1}) == PedirAclaracion(reason="not_supported_yet")
    assert plan_turn(
        ctx(), parse_tool_call("consultar_dato", {}), "¿cuál fue el mejor?"
    ).reason == (Reason.NOT_SUPPORTED_YET)


def test_off_topic_with_no_numbers() -> None:
    assert plan_turn(ctx(), ProponerMedicion(), "hola").reason == Reason.OFF_TOPIC


@pytest.mark.parametrize("reason", list(Reason))
def test_every_reason_has_a_template(reason: Reason) -> None:
    text = reply_text(reason, ["Temperatura"], 6, "°C")
    assert text and "{" not in text


# --- AC-21, AC-23: flags and said vs understood ---


def test_flags_in_order_and_light_values() -> None:
    temp = VARIABLES[0]
    assert flags(model_value(TEMP, 65, "65 grados"), temp) == ()
    assert flags(model_value(TEMP, 500, "500"), temp) == (FlagReason.OUT_OF_RANGE,)
    assert flags(model_value(TEMP, 500, "932 °F"), temp) == (
        FlagReason.OUT_OF_RANGE,
        FlagReason.CONVERTED,
    )
    assert flags(ValueInfo(TEMP, 65, "sesenta y cinco", Grounding.CODE), temp) == (
        FlagReason.CODE_MATCH,
    )
    assert flags(ValueInfo(TEMP, 500, None, None, True), temp) == (FlagReason.OUT_OF_RANGE,)


def test_minutes_said_in_minutes_is_not_converted() -> None:
    assert flags(model_value(DUR, 120, "120 minutos"), VARIABLES[1]) == ()


def test_interpreted_only_when_words_or_converted() -> None:
    assert interpreted("setenta y tres por ciento", VARIABLES[2])
    assert not interpreted("74 por ciento", VARIABLES[2])
    assert interpreted("2 horas", VARIABLES[1])
    assert not interpreted(None, VARIABLES[2])


def test_view_of_a_flagged_card() -> None:
    card = card6(
        model_value(TEMP, 65, "65 grados"),
        model_value(DUR, 120, "2 horas"),
        model_value(REND, 73, "setenta y tres"),
    )
    view = proposal_view(card, VARIABLES, SAVED, {}, "frase", Source.TEXT)
    assert view.flagged and not view.can_confirm
    assert view.question.reason == Reason.CHECK_VALUES
    assert view.question.text == "Antes de guardar, revisa Duración."
    assert [f.text for f in view.values[1].flags] == ["Convertí 2 horas a 120 min"]
    assert [v.interpreted for v in view.values] == [False, True, True]


def test_a_checked_flag_lets_it_confirm() -> None:
    card = card6(
        model_value(TEMP, 65, "65"),
        model_value(DUR, 120, "2 horas", checked=True),
        model_value(REND, 73, "73"),
    )
    view = proposal_view(card, VARIABLES, SAVED, {}, "frase", Source.TEXT)
    assert view.flagged and view.can_confirm and view.question.reason == Reason.READY


def test_a_correction_shows_previous_and_is_not_flagged() -> None:
    card = card6(model_value(REND, 500, "500"), number=3, target=33)
    view = proposal_view(card, VARIABLES, SAVED, {REND: 74.0}, "frase", Source.TEXT)
    assert not view.flagged
    assert view.values[2].previous == 74.0 and view.values[0].previous is None


def test_view_choose_trial_blocks_confirm() -> None:
    card = card6(model_value(REND, 73, "73"), number=3)
    view = proposal_view(card, VARIABLES, SAVED, {}, "frase", Source.TEXT)
    assert view.question.reason == Reason.CHOOSE_TRIAL and not view.can_confirm
    assert view.question.text == "El ensayo 3 ya existe. ¿Es una corrección o un ensayo nuevo?"


# --- AC-27, AC-31: clean readings save with no tap; the remembered trial ---

FULL = "Ensayo 6: temperatura 65, duración 20, rendimiento 74"


def full_call(rend_text: str = "74") -> ProponerMedicion:
    return ProponerMedicion(
        trial_number=6, values=[ev(TEMP, "65", 65), ev(DUR, "20", 20), ev(REND, rend_text, 74)]
    )


def test_a_code_side_match_is_not_clean() -> None:
    plan = plan_turn(ctx(), full_call(rend_text="setenta y cuatro"), FULL)
    assert Confirm(auto=True) not in plan.operations and plan.reason == Reason.CHECK_VALUES


def test_a_converted_unit_is_not_clean() -> None:
    call = ProponerMedicion(
        trial_number=6,
        values=[ev(TEMP, "65", 65), ev(DUR, "2", 2, "horas"), ev(REND, "74", 74)],
    )
    plan = plan_turn(ctx(), call, "Ensayo 6: temperatura 65, duración 2 horas, rendimiento 74")
    assert Confirm(auto=True) not in plan.operations


def test_a_saved_trial_number_is_not_clean() -> None:
    call = ProponerMedicion(
        trial_number=3, values=[ev(TEMP, "65", 65), ev(DUR, "20", 20), ev(REND, "74", 74)]
    )
    plan = plan_turn(ctx(), call, "Ensayo 3: temperatura 65, duración 20, rendimiento 74")
    assert plan.reason == Reason.CHOOSE_TRIAL


def remembering(*filled: int) -> TurnContext:
    return replace(ctx(), remembered=RememberedTrial(33, 3, frozenset(filled)))


def test_no_number_goes_to_the_remembered_trial_and_fills_an_empty_slot() -> None:
    plan = plan_turn(remembering(TEMP, DUR), ProponerMedicion(values=[ev(REND, "74", 74)]), "74")
    assert plan.operations == (
        StartProposal(3),
        SetTarget(33),
        SetValue(REND, 74.0, "74", Grounding.MODEL),
        Confirm(auto=True),
    )


def test_replacing_a_value_of_the_remembered_trial_waits_for_the_card() -> None:
    plan = plan_turn(
        remembering(TEMP, DUR, REND), ProponerMedicion(values=[ev(REND, "75", 75)]), "75"
    )
    assert plan.operations[:2] == (StartProposal(3), SetTarget(33))
    assert Confirm(auto=True) not in plan.operations
