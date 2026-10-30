"""Every reply the user reads (spec 0006, AC-12): fixed Spanish templates keyed by a reason
code. The model's text never reaches the user. Pure."""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.services.text import format_number, join_names


class Reason(StrEnum):
    READY = "ready"
    MISSING_VALUES = "missing_values"  # no longer produced (spec 0011, AC-15)
    MISSING_TRIAL = "missing_trial"
    CHOOSE_TRIAL = "choose_trial"  # no longer produced; cards from before spec 0011 only
    TRIAL_SELECTED = "trial_selected"  # a trial number and no values yet (spec 0011, AC-8)
    CONFIRM_CHANGE = "confirm_change"  # a value would replace a saved one (spec 0011, AC-4)
    PENDING_OTHER_TRIAL = "pending_other_trial"
    AMBIGUOUS_VARIABLE = "ambiguous_variable"
    TWO_VALUES = "two_values"
    UNKNOWN_UNIT = "unknown_unit"
    UNCLEAR_NUMBER = "unclear_number"
    CHECK_VALUES = "check_values"
    SAVED = "saved"
    AUTO_SAVED = "auto_saved"
    DISCARDED = "discarded"
    NO_PENDING = "no_pending"
    NOT_SUPPORTED_YET = "not_supported_yet"
    OFF_TOPIC = "off_topic"
    SESSION_LIMIT = "session_limit"  # spoken only: a voice session ran its 60 turns (spec 0007)
    UNDONE = "undone"  # "deshacer" took back the last auto save (spec 0007, AC-7)
    NOTHING_TO_UNDO = "nothing_to_undo"


# Reasons that depend on one sentence: they show only in that turn's response (AC-17).
SENTENCE_REASONS = frozenset(
    {
        Reason.AMBIGUOUS_VARIABLE,
        Reason.TWO_VALUES,
        Reason.UNKNOWN_UNIT,
        Reason.UNCLEAR_NUMBER,
        Reason.PENDING_OTHER_TRIAL,
    }
)


@dataclass(frozen=True, slots=True)
class Change:
    """One saved value a card would replace (spec 0011, AC-4)."""

    name: str
    old: float
    new: float
    unit: str | None


def _with_unit(value: float, unit: str | None) -> str:
    return f"{format_number(value)} {unit}" if unit else format_number(value)


def change_question(changes: Sequence[Change], n: int | None) -> str:
    """ "¿Cambio temperatura del ensayo 3 de 65 a 68 °C?", or for several, "¿Cambio
    temperatura de 65 a 68 °C y presión de 2 a 3 bar en el ensayo 3?". With no `n` the trial
    is left out, for a reply that already named it (AC-5)."""
    parts = [f"{format_number(c.old)} a {_with_unit(c.new, c.unit)}" for c in changes]
    if len(changes) == 1:
        trial = f" del ensayo {n}" if n is not None else ""
        return f"¿Cambio {changes[0].name}{trial} de {parts[0]}?"
    listed = join_names([f"{c.name} de {part}" for c, part in zip(changes, parts, strict=True)])
    trial = f" en el ensayo {n}" if n is not None else ""
    return f"¿Cambio {listed}{trial}?"


def reply_text(
    reason: Reason,
    names: Sequence[str] = (),
    n: int | None = None,
    unit: str | None = None,
    said: Sequence[str] = (),
    changes: Sequence[Change] = (),
) -> str:
    """The Spanish reply. `names` are variable names, `n` a trial number from the database,
    `unit` the unit of the one variable an `unknown_unit` reply is about, `said` the user's
    own words for each value a `two_values` reply quotes, and `changes` what a
    `confirm_change` card would replace."""
    listed = join_names(names)
    match reason:
        case Reason.READY:
            return "¿Lo guardo?"
        case Reason.TRIAL_SELECTED:
            return f"Ensayo {n}. Dime los valores."
        case Reason.CONFIRM_CHANGE:
            return change_question(changes, n)
        case Reason.MISSING_VALUES:
            ask = "¿Cuánto fue?" if len(names) == 1 else "¿Cuánto fueron?"
            return f"Me falta {listed}. {ask}"
        case Reason.MISSING_TRIAL:
            return "¿Qué número de ensayo es?"
        case Reason.CHOOSE_TRIAL:
            return f"El ensayo {n} ya existe. ¿Es una corrección o un ensayo nuevo?"
        case Reason.PENDING_OTHER_TRIAL:
            return f"Tienes el ensayo {n} sin guardar. ¿Lo guardo o lo descarto?"
        case Reason.AMBIGUOUS_VARIABLE:
            if not names:
                return "No sé a qué variable va ese valor. ¿A qué variable corresponde?"
            # It asks for one of them, so "o" (AC-33).
            return f"No sé a qué variable va ese valor. ¿Es {join_names(names, 'o')}?"
        case Reason.TWO_VALUES:
            return f"Dijiste {join_names(said)} para {listed}. ¿Cuál guardo?"
        case Reason.UNKNOWN_UNIT:
            where = f"Dímelo en {unit}." if unit else "Dímelo sin unidad."
            return f"No reconozco esa unidad para {listed}. {where}"
        case Reason.UNCLEAR_NUMBER:
            return f"No entendí el valor de {listed}. ¿Me lo repites?"
        case Reason.CHECK_VALUES:
            return f"Antes de guardar, revisa {listed}."
        case Reason.SAVED:
            return f"Guardado el ensayo {n}."
        case Reason.AUTO_SAVED:
            return f"Guardado ensayo {n}."  # the turn reply reads the values back (saved_line)
        case Reason.DISCARDED:
            return "Descarté la tarjeta."
        case Reason.NO_PENDING:
            return "No hay nada pendiente."
        case Reason.NOT_SUPPORTED_YET:
            return (
                "Por ahora solo registro mediciones. Pronto podré responder preguntas y graficar."
            )
        case Reason.OFF_TOPIC:
            return "Solo registro mediciones de este experimento."
        case Reason.SESSION_LIMIT:
            return "Llegaste al límite de esta sesión. Empieza otra."
        case Reason.UNDONE:
            return f"Deshecho: ensayo {n}."
        case Reason.NOTHING_TO_UNDO:
            return "No hay nada que deshacer."


def saved_line(n: int, values: Sequence[tuple[float, str | None]]) -> str:
    """ "Guardado ensayo 3: 2 bar.": what a save wrote, read back. `values` are (number,
    unit) pairs in position order."""
    return f"Guardado ensayo {n}: {join_names([_with_unit(v, unit) for v, unit in values])}."


def auto_saved_aloud(n: int, values: Sequence[tuple[float, str | None]]) -> str:
    """What voice says after an auto save (spec 0007, AC-5): the values read back, so you
    hear what was saved."""
    return f"{saved_line(n, values)} Di deshacer para quitarlo."


def split_saved(saved: str, question: str) -> str:
    """A turn that saved part of its sentence and asks about the rest of the same trial
    (spec 0011, AC-5). Text and voice say the same, with no "Di deshacer" hint."""
    return f"{saved} {question}"


def saved_still_pending(saved: str, question: str) -> str:
    """A turn that saved another trial while a card waits (spec 0011, AC-9)."""
    return f"{saved} Sigue pendiente: {question}"
