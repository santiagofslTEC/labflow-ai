"""No invented numbers (spec 0005, AC-25): each step of `ground_proposal`, and the helpers it
stands on. Pure, no database."""

import pytest

from app.ai.tools import ProponerCuaderno, ProposedVariable
from app.services.instructions import check_text
from app.services.results import InstructionsTooShort, TextTooLong
from app.services.setup_rules import (
    ReadText,
    cut,
    ground_proposal,
    normalize_for_match,
    quote_numbers,
)
from app.services.units import is_known_unit

HANDOUT = "Mida la temperatura (entre 40 y 80 °C) y el rendimiento en %. Haga 5 ensayos."
PASTED = ReadText((HANDOUT,), None)


def proposal(*variables: ProposedVariable, **fields: str | None) -> ProponerCuaderno:
    return ProponerCuaderno(
        title=fields.get("title") or "Rendimiento",
        goal=fields.get("goal"),
        context=fields.get("context"),
        variables=list(variables),
    )


def temperature(low: float | None, high: float | None, quote: str | None) -> ProposedVariable:
    return ProposedVariable(
        name="Temperatura", unit="°C", min_value=low, max_value=high, range_quote=quote
    )


# --- the helpers ---


@pytest.mark.parametrize(
    ("text", "numbers"),
    [
        ("entre 40 y 80 °C", (40, 80)),
        ("40-80", (40, 80)),
        ("40\N{EN DASH}80", (40, 80)),
        ("40 - 80", (40, 80)),
        ("de -10 a 5", (-10, 5)),
        ("\N{MINUS SIGN}3 °C", (-3,)),
        ("40,5 o 40.5", (40.5, 40.5)),
        ("1.000.000 de células", ()),
        ("cuarenta grados", ()),
    ],
)
def test_quote_numbers(text: str, numbers: tuple[float, ...]) -> None:
    assert quote_numbers(text) == numbers


def test_normalize_for_match() -> None:
    assert normalize_for_match("Tempera-\n tura  ﬁnal\tX") == "temperatura final x"


@pytest.mark.parametrize(
    ("text", "limit", "expected"),
    [("corto", 10, "corto"), ("uno dos tres", 9, "uno dos"), ("abcdefghij", 4, "abcd")],
)
def test_cut_at_the_last_space(text: str, limit: int, expected: str) -> None:
    assert cut(text, limit) == expected


def test_is_known_unit() -> None:
    assert is_known_unit("grados")
    assert is_known_unit(" ºC ")
    assert not is_known_unit("mol/L")


def test_check_text() -> None:
    assert check_text("x" * 49) == InstructionsTooShort()
    assert check_text("  " + "x" * 50 + "  ") == "x" * 50
    assert check_text("x" * 100_001) == TextTooLong()


# --- step 1: a range stays only when its quote and numbers are in the text ---


def test_a_quoted_range_is_kept() -> None:
    result = ground_proposal(proposal(temperature(40, 80, "entre 40 y 80 °C")), PASTED)
    kept = result.variables[0]
    assert (kept.min_value, kept.max_value, kept.range_quote) == (40, 80, "entre 40 y 80 °C")
    assert kept.range_page is None  # pasted text has no page


def test_a_quote_matches_ignoring_case_and_spacing() -> None:
    result = ground_proposal(proposal(temperature(40, 80, "ENTRE  40 y\n80 °c")), PASTED)
    assert result.variables[0].min_value == 40


@pytest.mark.parametrize(
    ("low", "high", "quote"),
    [
        (40, 90, "entre 40 y 80 °C"),  # a bound not in the quote
        (40, 80, "entre 40 y 80 grados"),  # a quote not in the text
        (80, 40, "entre 40 y 80 °C"),  # min above max
        (40, 80, None),  # no quote
        (40, 80, "   "),  # a blank quote
    ],
    ids=["bound not quoted", "quote not in text", "reversed", "no quote", "blank quote"],
)
def test_an_unproven_range_is_dropped_and_the_variable_stays(
    low: float, high: float, quote: str | None
) -> None:
    result = ground_proposal(proposal(temperature(low, high, quote)), PASTED)
    kept = result.variables[0]
    assert kept.name == "Temperatura"
    assert (kept.min_value, kept.max_value, kept.range_quote, kept.range_page) == (
        None,
        None,
        None,
        None,
    )


def test_a_single_bound_is_checked_alone() -> None:
    result = ground_proposal(proposal(temperature(None, 80, "entre 40 y 80 °C")), PASTED)
    assert (result.variables[0].min_value, result.variables[0].max_value) == (None, 80)


def test_a_decimal_comma_counts() -> None:
    read = ReadText(("Mantenga el pH entre 6,5 y 7,5.",), None)
    variable = ProposedVariable(
        name="pH", min_value=6.5, max_value=7.5, range_quote="entre 6,5 y 7,5"
    )
    assert ground_proposal(proposal(variable), read).variables[0].max_value == 7.5


def test_a_thousands_separator_drops_the_range() -> None:
    read = ReadText(("Agite a no más de 1.000 rpm durante el ensayo.",), None)
    variable = ProposedVariable(name="Agitación", max_value=1000, range_quote="no más de 1.000 rpm")
    assert ground_proposal(proposal(variable), read).variables[0].max_value is None


# --- step 2: the page comes from code ---


def test_the_page_is_where_the_quote_is() -> None:
    read = ReadText(("Introducción.", "Trabaje entre 40 y 80 °C.", "Fin."), 12)
    result = ground_proposal(proposal(temperature(40, 80, "entre 40 y 80 °C")), read)
    assert result.variables[0].range_page == 13


def test_a_quote_across_a_page_break_takes_the_first_page() -> None:
    read = ReadText(("Trabaje entre 40", "y 80 °C."), 1)
    result = ground_proposal(proposal(temperature(40, 80, "entre 40 y 80 °C")), read)
    assert result.variables[0].range_page == 1


# --- step 3: context sentences with a number not in the text are removed ---


def test_a_context_sentence_with_an_invented_number_is_removed() -> None:
    context = "Se mide el rendimiento. La reacción va a 25 °C. Se hacen 5 ensayos."
    result = ground_proposal(proposal(context=context), PASTED)
    assert result.context == "Se mide el rendimiento. Se hacen 5 ensayos."


def test_a_decimal_point_does_not_end_a_sentence() -> None:
    read = ReadText(("Use 40.5 °C.",), None)
    result = ground_proposal(proposal(context="Se trabaja a 40.5 °C; luego 7 °C."), read)
    assert result.context == "Se trabaja a 40.5 °C;"


# --- steps 4 to 7 ---


def test_duplicate_names_keep_the_first() -> None:
    first = ProposedVariable(name="Temperatura", unit="°C")
    again = ProposedVariable(name=" temperatura ", unit="K")
    result = ground_proposal(proposal(first, again), PASTED)
    assert [(v.name, v.unit) for v in result.variables] == [("Temperatura", "°C")]
    assert result.found_count == 1


@pytest.mark.parametrize(
    ("unit", "expected"),
    [("grados", "°C"), ("por ciento", "%"), (" mol/L ", "mol/L"), ("x" * 21, None), ("  ", None)],
)
def test_units(unit: str, expected: str | None) -> None:
    result = ground_proposal(proposal(ProposedVariable(name="V", unit=unit)), PASTED)
    assert result.variables[0].unit == expected


def test_strings_are_cut_to_the_form_limits() -> None:
    long = ProposedVariable(name="Nombre " * 20)
    result = ground_proposal(
        proposal(long, title="Título " * 40, goal="Meta " * 300, context="Contexto " * 100),
        PASTED,
    )
    assert len(result.title) <= 200
    assert result.goal is not None and len(result.goal) <= 1000
    assert result.context is not None and len(result.context) <= 600
    assert len(result.variables[0].name) <= 80
    assert not result.variables[0].name.endswith(" ")


def test_a_blank_title_stays_blank() -> None:
    assert ground_proposal(ProponerCuaderno(title="  "), PASTED).title == ""


def test_over_12_are_cut_and_counted() -> None:
    variables = [ProposedVariable(name=f"Variable {i}") for i in range(15)]
    result = ground_proposal(proposal(*variables), PASTED)
    assert len(result.variables) == 12
    assert result.found_count == 15
    assert result.variables[-1].name == "Variable 11"
