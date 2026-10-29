"""Number reading, grounding, and said text (spec 0006, AC-10 and AC-21). Pure, no database."""

import pytest

from app.models.enums import Grounding
from app.services.numbers import find_numbers, ground, parse_number, said_slice

SENTENCE = "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("73", 73.0),
        ("73,5", 73.5),
        ("73.5", 73.5),
        ("1.200", 1200.0),
        ("-5", -5.0),
        ("menos 5", -5.0),
        ("cero", 0.0),
        ("uno", 1.0),
        ("veintiún", 21.0),
        ("dieciséis", 16.0),
        ("setenta y tres", 73.0),
        ("setenta y tres coma cinco", 73.5),
        ("siete coma cero cinco", 7.05),
        ("sesenta y cinco punto dos", 65.2),
        ("cien", 100.0),
        ("ciento veinte", 120.0),
        ("trescientos treinta y ocho coma quince", 338.15),
        ("mil", 1000.0),
        ("mil doscientos", 1200.0),
        ("dos mil quinientos", 2500.0),
        ("novecientos noventa y nueve mil novecientos noventa y nueve", 999999.0),
        ("menos cuatro coma cinco", -4.5),
        ("73 coma 5", 73.5),
    ],
)
def test_parse_number_reads_digits_and_words(text: str, expected: float) -> None:
    assert parse_number(text) == pytest.approx(expected)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "grados",
        "setenta tres",
        "cien veinte",
        "cincuenta y cincuenta",
        "50 y 50",
        "y",
        "1.200,5",
    ],
)
def test_parse_number_rejects_what_is_not_one_number(text: str) -> None:
    assert parse_number(text) is None


def test_find_numbers_marks_trial_spans() -> None:
    spans = find_numbers(SENTENCE)
    assert [(s.value, s.is_trial) for s in spans] == [
        (6.0, True),
        (65.0, False),
        (20.0, False),
        (74.0, False),
    ]
    assert [SENTENCE[s.start : s.end] for s in spans] == ["6", "65", "20", "74"]


def test_find_numbers_reads_word_numbers_and_splits_on_y() -> None:
    sentence = "prueba siete, cincuenta y cincuenta y cinco"
    assert [(s.value, s.is_trial) for s in find_numbers(sentence)] == [
        (7.0, True),
        (50.0, False),
        (55.0, False),
    ]


def test_find_numbers_ensayo_numero() -> None:
    assert find_numbers("ensayo número 3, 50 grados")[0].is_trial


def test_ground_matches_the_quoted_words() -> None:
    grounded = ground(SENTENCE, "65", 65.0)
    assert grounded is not None
    assert grounded.grounding == Grounding.MODEL
    assert SENTENCE[grounded.span.start : grounded.span.end] == "65"


def test_ground_words_and_accents() -> None:
    sentence = "No, el rendimiento es setenta y tres coma cinco"
    grounded = ground(sentence, "setenta y tres coma cinco", 73.5)
    assert grounded is not None and grounded.grounding == Grounding.MODEL


def test_ground_rejects_a_number_the_sentence_lacks() -> None:
    assert ground(SENTENCE, "66", 66.0) is None


def test_ground_six_is_not_inside_sixty_five() -> None:
    # "6" only exists as the trial number, so it cannot be a value.
    assert ground("ensayo 6, 65 grados", "6", 6.0) is None


def test_ground_tres_is_not_inside_trescientos() -> None:
    assert ground("trescientos grados", "tres", 3.0) is None


def test_ground_rejects_the_trial_number_as_a_value() -> None:
    assert ground("ensayo seis", "seis", 6.0) is None


def test_ground_code_fallback_when_the_model_paraphrases() -> None:
    grounded = ground("rendimiento setenta y tres", "73", 73.0)
    assert grounded is not None and grounded.grounding == Grounding.CODE


def test_ground_code_fallback_fails_when_ambiguous() -> None:
    assert ground("50 y 50", "cincuenta", 50.0) is None


def test_ground_with_taken_spans_uses_the_next_equal_number() -> None:
    sentence = "temperatura 20, duración 20"
    first = ground(sentence, "20", 20.0)
    assert first is not None
    second = ground(sentence, "20", 20.0, taken=[first.span.start])
    assert second is not None and second.span.start != first.span.start


def test_ground_rejects_a_wrong_value_for_the_quoted_words() -> None:
    assert ground("rendimiento setenta y tres", "setenta y tres", 74.0) is None


def test_ground_negative() -> None:
    grounded = ground("temperatura menos cinco", "menos cinco", -5.0)
    assert grounded is not None and grounded.span.value == -5.0


@pytest.mark.parametrize(
    ("sentence", "number_text", "value", "said", "unit"),
    [
        (
            "rendimiento setenta y tres por ciento",
            "setenta y tres",
            73.0,
            "setenta y tres por ciento",
            "%",
        ),
        ("rendimiento 74 por ciento", "74", 74.0, "74 por ciento", "%"),
        ("duración 2 horas", "2", 2.0, "2 horas", "h"),
        ("temperatura 65°C", "65", 65.0, "65°C", "°C"),
        ("rendimiento 74%", "74", 74.0, "74%", "%"),
        ("temperatura 65 grados fahrenheit", "65", 65.0, "65 grados fahrenheit", "°F"),
        ("rendimiento 74, ensayo 3", "74", 74.0, "74", None),
        ("temperatura 65 con agua", "65", 65.0, "65", None),
        (
            "Rendimiento SETENTA Y TRES Por Ciento",
            "setenta y tres",
            73.0,
            "SETENTA Y TRES Por Ciento",
            "%",
        ),
    ],
)
def test_said_slice_keeps_the_users_words(
    sentence: str, number_text: str, value: float, said: str, unit: str | None
) -> None:
    grounded = ground(sentence, number_text, value)
    assert grounded is not None
    result = said_slice(sentence, grounded.span)
    assert (result.text, result.unit) == (said, unit)


def test_said_slice_matches_a_variables_own_unit_outside_the_table() -> None:
    sentence = "presión 3 bar"
    grounded = ground(sentence, "3", 3.0)
    assert grounded is not None
    assert said_slice(sentence, grounded.span, "bar").unit == "bar"
    assert said_slice(sentence, grounded.span).unit is None


@pytest.mark.parametrize(
    "sentence", ["esnayo 5", "emsayo 5", "ensay 5", "ensallo 5", "prueva 5", "corida 5"]
)
def test_a_slip_in_the_trial_word_still_marks_a_trial_span(sentence: str) -> None:
    (span,) = find_numbers(sentence)
    assert span.value == 5 and span.is_trial


@pytest.mark.parametrize("sentence", ["comida 5", "ensayamos 5", "presión 5"])
def test_other_words_before_a_number_are_not_trial_words(sentence: str) -> None:
    (span,) = find_numbers(sentence)
    assert not span.is_trial
