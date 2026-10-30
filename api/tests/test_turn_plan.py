"""The planner, flags, replies, and card view (spec 0006, AC-3 to AC-12, AC-17, AC-21 to
AC-24; spec 0011, partial readings). Pure, no database, no model: each test passes in the
exact tool call it wants."""

from dataclasses import replace

import pytest

from app.ai.prompt import system_prompt
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
from app.services.replies import (
    Change,
    Reason,
    change_question,
    reply_text,
    saved_line,
    saved_still_pending,
    split_saved,
)
from app.services.turn_plan import (
    Confirm,
    Discard,
    LastQuestion,
    SaveNow,
    SetTarget,
    SetTrial,
    SetValue,
    StartProposal,
    Supersede,
    TurnContext,
    Unset,
    bare_trial,
    plan_before_model,
    plan_turn,
)

TEMP, DUR, REND = 1, 2, 3
VARIABLES = (
    VariableInfo(TEMP, "Temperatura", "°C", True, 0, 20.0, 100.0, ("temp",)),
    VariableInfo(DUR, "Duración", "min", True, 1, 0.0, 180.0),
    VariableInfo(REND, "Rendimiento", "%", True, 2, 0.0, 100.0),
)
SAVED = {3: 33}  # trial 3 is saved, id 33
SLOTS = {3: {TEMP: 50.0, REND: 74.0}}  # what trial 3 holds; Duración is empty


def ctx(card: CardInfo | None = None) -> TurnContext:
    return TurnContext(1, VARIABLES, card, SAVED, saved=SLOTS)


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
        SaveNow(
            6,
            (vi(TEMP, 65, "65 grados"), vi(DUR, 20, "20 minutos"), vi(REND, 74, "74 por ciento")),
        ),
    )
    assert plan.reason == Reason.AUTO_SAVED  # clean: saved with no tap, no card (0011 AC-12)


# --- AC-3, AC-4, AC-5: parts and corrections ---


def test_missing_values_names_the_required_ones() -> None:
    """Spec 0011, AC-1, AC-2: one value saves; required variables never ask."""
    plan = plan_turn(
        ctx(), ProponerMedicion(trial_number=6, values=[ev(TEMP, "65", 65)]), "Ensayo 6, 65 grados"
    )
    assert plan.operations == (SaveNow(6, (vi(TEMP, 65, "65 grados"),)),)
    assert plan.reason == Reason.AUTO_SAVED and plan.variable_ids == ()


def test_a_part_adds_to_the_pending_card() -> None:
    """A clean value saves at once; the flagged one keeps waiting on its card (AC-6)."""
    card = card6(model_value(TEMP, 500, "500"))
    plan = plan_turn(ctx(card), ProponerMedicion(values=[ev(REND, "74", 74)]), "rendimiento 74")
    assert plan.operations == (SaveNow(6, (vi(REND, 74, "74"),)),)
    assert plan.reason == Reason.CHECK_VALUES and plan.variable_ids == (TEMP,)


def test_a_spoken_correction_replaces_the_value() -> None:
    card = card6(model_value(REND, 500, "500"))
    sentence = "No, el rendimiento es setenta y tres"
    plan = plan_turn(ctx(card), Corregir(values=[ev(REND, "setenta y tres", 73)]), sentence)
    assert plan.operations == (
        Unset((REND,)),
        Supersede(),
        SaveNow(6, (vi(REND, 73, "setenta y tres"),)),
    )


# --- AC-6, AC-7, AC-8: trial rules ---


def test_no_trial_number_asks_for_it() -> None:
    plan = plan_turn(ctx(), ProponerMedicion(values=[ev(TEMP, "50", 50)]), "temperatura 50 grados")
    assert plan.operations[0] == StartProposal(None)
    assert plan.reason == Reason.MISSING_TRIAL


def test_a_numberless_card_takes_the_number() -> None:
    card = card6(model_value(TEMP, 50, "50"), number=None)
    plan = plan_turn(ctx(card), ProponerMedicion(trial_number=6), "ensayo 6")
    assert plan.operations == (SetTrial(6), Unset((TEMP,)), Supersede(), SaveNow(6, (card.values)))
    assert plan.reason == Reason.AUTO_SAVED


def test_a_saved_number_asks_correction_or_new() -> None:
    """Spec 0011, AC-3, AC-4: an empty slot of a saved trial fills at once; a filled slot
    asks "¿Cambio…?" on a card that targets the trial."""
    add = plan_turn(
        ctx(),
        ProponerMedicion(trial_number=3, values=[ev(DUR, "20", 20)]),
        "ensayo 3, duración 20",
    )
    assert add.operations == (SaveNow(3, (vi(DUR, 20, "20"),)),)
    change = plan_turn(
        ctx(),
        ProponerMedicion(trial_number=3, values=[ev(REND, "73", 73)]),
        "ensayo 3, rendimiento 73",
    )
    assert change.operations == (
        StartProposal(3),
        SetTarget(33),
        SetValue(REND, 73.0, "73", Grounding.MODEL),
    )
    assert change.reason == Reason.CONFIRM_CHANGE and change.variable_ids == (REND,)


def test_choosing_correction_sets_the_target() -> None:
    card = card6(model_value(REND, 73, "73"), number=3)
    plan = plan_turn(ctx(card), ElegirEnsayo(kind="correccion"), "es corrección")
    assert plan.operations == (SetTarget(33),)
    assert plan.reason == Reason.CONFIRM_CHANGE  # 73 would replace the saved 74


def test_choosing_new_clears_the_number_or_sets_it() -> None:
    card = card6(model_value(REND, 73, "73"), number=3)
    assert plan_turn(ctx(card), ElegirEnsayo(kind="nuevo"), "es otro ensayo").operations == (
        SetTrial(None),
    )
    assert plan_turn(
        ctx(card), ElegirEnsayo(kind="nuevo", trial_number=7), "es el ensayo 7"
    ).operations == (SetTrial(7), Unset((REND,)), Supersede(), SaveNow(7, card.values))


def test_another_trial_while_one_is_pending_asks_and_changes_nothing() -> None:
    """Spec 0011, AC-9: a clean sentence for another trial saves on its own and the
    waiting card stays; one that needs a question changes nothing."""
    card = card6(model_value(TEMP, 500, "500"))
    clean = plan_turn(
        ctx(card),
        ProponerMedicion(trial_number=7, values=[ev(TEMP, "60", 60)]),
        "Ensayo 7, 60 grados",
    )
    assert clean.operations == (SaveNow(7, (vi(TEMP, 60, "60 grados"),)),)
    assert clean.reason == Reason.CHECK_VALUES  # the waiting card's question, added once
    flagged = plan_turn(
        ctx(card),
        ProponerMedicion(trial_number=7, values=[ev(TEMP, "600", 600)]),
        "Ensayo 7, 600 grados",
    )
    assert flagged.operations == () and flagged.reason == Reason.PENDING_OTHER_TRIAL
    replacing = plan_turn(
        ctx(card),
        ProponerMedicion(trial_number=3, values=[ev(TEMP, "60", 60)]),
        "Ensayo 3, 60 grados",
    )
    assert replacing.operations == () and replacing.reason == Reason.PENDING_OTHER_TRIAL


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
    assert plan.operations == (SetTrial(5), Unset((TEMP,)), Supersede(), SaveNow(5, card.values))
    assert plan.reason == Reason.AUTO_SAVED


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
    assert plan.operations == (Supersede(), SaveNow(6, (vi(TEMP, 71, "71", turn_id=40),)))


def test_si_skips_numbers_already_placed_from_that_sentence() -> None:
    placed = ValueInfo(REND, 500, "500", Grounding.MODEL, turn_id=40)
    context = after(asked(Reason.AMBIGUOUS_VARIABLE, "500 y reflujo 71", TEMP), card6(placed))
    plan = plan_turn(context, Confirmar(), "sí")
    assert plan.operations == (SaveNow(6, (vi(TEMP, 71, "71", turn_id=40),)),)


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


# --- AC-33 to AC-35: error pass, 2026-10-30 ---


def test_the_which_variable_question_offers_its_choices_with_o() -> None:
    names = ["Temperatura", "pH", "Rendimiento"]
    assert reply_text(Reason.AMBIGUOUS_VARIABLE, names) == (
        "No sé a qué variable va ese valor. ¿Es Temperatura, pH o Rendimiento?"
    )
    assert reply_text(Reason.AMBIGUOUS_VARIABLE, names[:2]).endswith("¿Es Temperatura o pH?")
    assert reply_text(Reason.AMBIGUOUS_VARIABLE, names[:1]).endswith("¿Es Temperatura?")
    assert (
        reply_text(Reason.MISSING_VALUES, names[1:]) == "Me falta pH y Rendimiento. ¿Cuánto fueron?"
    )


def test_a_range_for_one_variable_keeps_the_rest_of_the_sentence() -> None:
    """What the prompt now asks the model for (AC-34): both values, plus the others. The
    clean value saves; the trial stays selected for the answer (spec 0011, AC-6)."""
    sentence = "ensayo 20 temperatura 23 a 71 grados duración 30"
    call = ProponerMedicion(
        trial_number=20,
        values=[ev(TEMP, "23", 23), ev(TEMP, "71", 71, "grados"), ev(DUR, "30", 30)],
    )
    plan = plan_turn(ctx(), call, sentence)
    assert plan.operations == (StartProposal(20), SaveNow(20, (vi(DUR, 30, "30"),)))
    assert plan.reason == Reason.TWO_VALUES and plan.variable_ids == (TEMP,)
    assert plan.said == ("23", "71 grados")


def test_the_prompt_asks_for_both_values_of_a_range() -> None:
    prompt = system_prompt(ctx())
    assert '"temperatura 23 a 71 grados"' in prompt
    assert "No uses `pedir_aclaracion` por eso" in prompt


@pytest.mark.parametrize("answer", ["71", "71 grados", "el 71"])
def test_a_bare_number_answers_a_one_variable_question(answer: str) -> None:
    context = after(asked(Reason.AMBIGUOUS_VARIABLE, "ensayo 6, reflujo 23 a 71", TEMP), card6())
    plan = plan_turn(context, PedirAclaracion(reason="ambiguous_variable"), answer)
    said = answer.removeprefix("el ")
    assert plan.operations == (Supersede(), SaveNow(6, (vi(TEMP, 71, said),)))


def test_with_no_card_the_answer_starts_the_asked_trial() -> None:
    """Not the remembered trial (AC-31): the student was dictating ensayo 20."""
    context = replace(
        after(asked(Reason.AMBIGUOUS_VARIABLE, "ensayo 20 temperatura 23 a 71", TEMP)),
        remembered=RememberedTrial(trial_id=33, number=3),
    )
    plan = plan_turn(context, PedirAclaracion(reason="ambiguous_variable"), "71")
    assert plan.operations == (SaveNow(20, (vi(TEMP, 71, "71"),)),)
    yes = plan_turn(
        replace(
            context, last_question=asked(Reason.AMBIGUOUS_VARIABLE, "ensayo 20, reflujo 71", TEMP)
        ),
        Confirmar(),
        "sí",
    )
    assert yes.operations == (SaveNow(20, (vi(TEMP, 71, "71", turn_id=40),)),)


@pytest.mark.parametrize(
    ("question", "answer"),
    [
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71", TEMP, DUR), "71"),  # two candidates
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71", TEMP), "71 y 72"),
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71", TEMP), "rendimiento 71"),
        (asked(Reason.AMBIGUOUS_VARIABLE, "reflujo 71", TEMP), "ensayo 7"),
    ],
)
def test_other_numbers_after_a_which_variable_question_go_to_the_model(
    question: LastQuestion, answer: str
) -> None:
    plan = plan_turn(after(question, card6()), PedirAclaracion(reason="ambiguous_variable"), answer)
    assert plan.operations == () and plan.reason == Reason.AMBIGUOUS_VARIABLE


@pytest.mark.parametrize("sentence", ["el 5", "5", "es el 5"])
def test_a_lone_number_read_as_the_trial_opens_no_card(sentence: str) -> None:
    """One number is the trial or a value, never both (AC-36)."""
    plan = plan_turn(ctx(), ProponerMedicion(trial_number=5), sentence)
    assert plan.operations == ()
    assert plan.reason == Reason.AMBIGUOUS_VARIABLE and plan.variable_ids == (TEMP, DUR, REND)


def test_a_trial_number_with_no_trial_word_is_kept_beside_a_value() -> None:
    call = ProponerMedicion(trial_number=6, values=[ev(TEMP, "65", 65, "grados")])
    plan = plan_turn(ctx(), call, "6: temperatura 65 grados")
    assert plan.operations == (SaveNow(6, (vi(TEMP, 65, "65 grados"),)),)
    assert plan.reason == Reason.AUTO_SAVED  # nothing asks about the 6


def test_a_lone_number_read_as_the_trial_leaves_a_pending_card_alone() -> None:
    card = card6(model_value(TEMP, 65, "65"))
    plan = plan_turn(ctx(card), ProponerMedicion(trial_number=5), "el 5")
    assert plan.operations == () and plan.reason == Reason.AMBIGUOUS_VARIABLE


def test_a_trial_word_still_starts_an_empty_card() -> None:
    plan = plan_turn(ctx(), ProponerMedicion(trial_number=5), "ensayo 5")
    assert plan.operations == (StartProposal(5),) and plan.reason == Reason.TRIAL_SELECTED


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
    view = proposal_view(card, VARIABLES, {}, "frase", Source.TEXT)
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
    view = proposal_view(card, VARIABLES, {}, "frase", Source.TEXT)
    assert view.flagged and view.can_confirm and view.question.reason == Reason.READY


def test_a_correction_shows_previous_and_is_not_flagged() -> None:
    card = card6(model_value(REND, 500, "500"), number=3, target=33)
    view = proposal_view(card, VARIABLES, {REND: 74.0}, "frase", Source.TEXT)
    assert not view.flagged and view.can_confirm
    assert view.values[2].previous == 74.0 and view.values[0].previous is None
    assert view.question.reason == Reason.CONFIRM_CHANGE
    assert view.question.text == "¿Cambio Rendimiento del ensayo 3 de 74 a 500 %?"


def test_view_choose_trial_blocks_confirm() -> None:
    """An empty selection (spec 0011, AC-8): a number and no values, nothing to save."""
    view = proposal_view(card6(number=4), VARIABLES, {}, "ensayo 4", Source.TEXT)
    assert view.question.reason == Reason.TRIAL_SELECTED and not view.can_confirm
    assert view.question.text == "Ensayo 4. Dime los valores."
    assert all(v.value is None for v in view.values)


# --- AC-27, AC-31: clean readings save with no tap; the remembered trial ---

FULL = "Ensayo 6: temperatura 65, duración 20, rendimiento 74"


def full_call(rend_text: str = "74") -> ProponerMedicion:
    return ProponerMedicion(
        trial_number=6, values=[ev(TEMP, "65", 65), ev(DUR, "20", 20), ev(REND, rend_text, 74)]
    )


def test_a_code_side_match_is_not_clean() -> None:
    """The flagged half waits; the rest saves now (spec 0011, AC-6)."""
    plan = plan_turn(ctx(), full_call(rend_text="setenta y cuatro"), FULL)
    assert plan.operations == (
        StartProposal(6),
        SetValue(REND, 74.0, "74", Grounding.CODE),
        SaveNow(6, (vi(TEMP, 65, "65"), vi(DUR, 20, "20"))),
    )
    assert plan.reason == Reason.CHECK_VALUES and plan.variable_ids == (REND,)


def test_a_converted_unit_is_not_clean() -> None:
    call = ProponerMedicion(
        trial_number=6,
        values=[ev(TEMP, "65", 65), ev(DUR, "2", 2, "horas"), ev(REND, "74", 74)],
    )
    plan = plan_turn(ctx(), call, "Ensayo 6: temperatura 65, duración 2 horas, rendimiento 74")
    assert plan.operations[-1] == SaveNow(6, (vi(TEMP, 65, "65"), vi(REND, 74, "74")))
    assert SetValue(DUR, 120.0, "2 horas", Grounding.MODEL) in plan.operations


def test_a_saved_trial_number_is_not_clean() -> None:
    """The split (spec 0011, AC-5): the empty slot saves, the filled ones ask."""
    call = ProponerMedicion(
        trial_number=3, values=[ev(TEMP, "65", 65), ev(DUR, "20", 20), ev(REND, "75", 75)]
    )
    plan = plan_turn(ctx(), call, "Ensayo 3: temperatura 65, duración 20, rendimiento 75")
    assert plan.operations == (
        StartProposal(3),
        SetTarget(33),
        SetValue(TEMP, 65.0, "65", Grounding.MODEL),
        SetValue(REND, 75.0, "75", Grounding.MODEL),
        SaveNow(3, (vi(DUR, 20, "20"),)),
    )
    assert plan.reason == Reason.CONFIRM_CHANGE and plan.variable_ids == (TEMP, REND)


def remembering() -> TurnContext:
    return replace(ctx(), remembered=RememberedTrial(33, 3))


def test_no_number_goes_to_the_remembered_trial_and_fills_an_empty_slot() -> None:
    plan = plan_turn(remembering(), ProponerMedicion(values=[ev(DUR, "20", 20)]), "20")
    assert plan.operations == (SaveNow(3, (vi(DUR, 20, "20"),)),)
    assert plan.reason == Reason.AUTO_SAVED


def test_replacing_a_value_of_the_remembered_trial_waits_for_the_card() -> None:
    plan = plan_turn(remembering(), ProponerMedicion(values=[ev(REND, "75", 75)]), "75")
    assert plan.operations == (
        StartProposal(3),
        SetTarget(33),
        SetValue(REND, 75.0, "75", Grounding.MODEL),
    )
    assert plan.reason == Reason.CONFIRM_CHANGE


def vi(variable_id: int, value: float, said: str, turn_id: int | None = None) -> ValueInfo:
    """A value as `SaveNow` carries it: read from this turn unless `turn_id` says otherwise."""
    return ValueInfo(variable_id, value, said, Grounding.MODEL, turn_id=turn_id)


def test_a_flagged_value_on_a_saved_trial_is_still_flagged() -> None:
    """Flags apply to every value that fills an empty slot, also on a saved trial (AC-6)."""
    plan = plan_turn(
        ctx(), ProponerMedicion(trial_number=3, values=[ev(DUR, "900", 900)]), "ensayo 3, 900"
    )
    assert SaveNow not in {type(op) for op in plan.operations}
    assert plan.reason == Reason.CHECK_VALUES


def test_values_on_a_numberless_card_wait_for_the_number() -> None:
    plan = plan_turn(ctx(), ProponerMedicion(values=[ev(TEMP, "50", 50)]), "temperatura 50 grados")
    assert plan.operations == (
        StartProposal(None),
        SetValue(TEMP, 50.0, "50 grados", Grounding.MODEL),
    )
    assert plan.reason == Reason.MISSING_TRIAL


@pytest.mark.parametrize("sentence", ["ensayo 4", "Ensayo 4.", "es el ensayo 4", "prueba 4"])
def test_a_bare_trial_selects_it_with_no_model(sentence: str) -> None:
    assert bare_trial(sentence) == 4
    plan = plan_before_model(ctx(), sentence)
    assert plan is not None and plan.operations == (StartProposal(4),)
    assert plan.reason == Reason.TRIAL_SELECTED
    assert reply_text(Reason.TRIAL_SELECTED, n=4) == "Ensayo 4. Dime los valores."


@pytest.mark.parametrize("sentence", ["4", "el 4", "ensayo 4, temperatura 60", "ensayo cero"])
def test_more_than_a_bare_trial_goes_to_the_model(sentence: str) -> None:
    assert plan_before_model(ctx(), sentence) is None


def test_a_bare_saved_trial_targets_it() -> None:
    plan = plan_before_model(ctx(), "ensayo 3")
    assert plan is not None and plan.operations == (StartProposal(3), SetTarget(33))


def test_a_bare_trial_replaces_an_empty_selection_and_keeps_its_own() -> None:
    selected = card6(number=4)
    other = plan_before_model(ctx(selected), "ensayo 5")
    assert other is not None and other.operations == (StartProposal(5),)
    same = plan_before_model(ctx(selected), "ensayo 4")
    assert same is not None and same.operations == () and same.reason == Reason.TRIAL_SELECTED


def test_a_bare_trial_with_a_waiting_card() -> None:
    waiting = card6(model_value(TEMP, 500, "500"))
    other = plan_before_model(ctx(waiting), "ensayo 5")
    assert other is not None and other.operations == ()
    assert other.reason == Reason.PENDING_OTHER_TRIAL
    same = plan_before_model(ctx(waiting), "ensayo 6")
    assert same is not None and same.operations == () and same.reason == Reason.CHECK_VALUES


def test_a_bare_trial_answering_the_trial_question_is_a_short_answer() -> None:
    card = card6(model_value(TEMP, 65, "65"), number=None)
    context = after(asked(Reason.MISSING_TRIAL, "temperatura 65"), card)
    assert plan_before_model(context, "ensayo 5") is None  # planned by plan_turn instead


def test_values_after_a_bare_trial_save_on_it() -> None:
    plan = plan_turn(ctx(card6(number=4)), ProponerMedicion(values=[ev(TEMP, "66", 66)]), "66")
    assert plan.operations == (Supersede(), SaveNow(4, (vi(TEMP, 66, "66"),)))
    assert plan.reason == Reason.AUTO_SAVED


def test_the_change_question_and_the_joined_replies() -> None:
    one = [Change("temperatura", 65, 68, "°C")]
    two = [*one, Change("presión", 2, 3, "bar")]
    assert change_question(one, 3) == "¿Cambio temperatura del ensayo 3 de 65 a 68 °C?"
    assert change_question(two, 3) == (
        "¿Cambio temperatura de 65 a 68 °C y presión de 2 a 3 bar en el ensayo 3?"
    )
    assert change_question(one, None) == "¿Cambio temperatura de 65 a 68 °C?"
    line = saved_line(3, [(2, "bar")])
    assert split_saved(line, change_question(one, None)) == (
        "Guardado ensayo 3: 2 bar. ¿Cambio temperatura de 65 a 68 °C?"
    )
    assert saved_still_pending(saved_line(4, [(66, "°C")]), change_question(one, 3)) == (
        "Guardado ensayo 4: 66 °C. Sigue pendiente: ¿Cambio temperatura del ensayo 3 de 65 a 68 °C?"
    )
