"""Every reply the user reads (spec 0006, AC-12): fixed Spanish templates keyed by a reason
code. The model's text never reaches the user. Pure."""

from collections.abc import Sequence
from enum import StrEnum

from app.services.text import join_names


class Reason(StrEnum):
    READY = "ready"
    MISSING_VALUES = "missing_values"
    MISSING_TRIAL = "missing_trial"
    CHOOSE_TRIAL = "choose_trial"
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


def reply_text(
    reason: Reason,
    names: Sequence[str] = (),
    n: int | None = None,
    unit: str | None = None,
    said: Sequence[str] = (),
) -> str:
    """The Spanish reply. `names` are variable names, `n` a trial number from the database,
    `unit` the unit of the one variable an `unknown_unit` reply is about, and `said` the
    user's own words for each value a `two_values` reply quotes."""
    listed = join_names(names)
    match reason:
        case Reason.READY:
            return "¿Lo guardo?"
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
            return f"No sé a qué variable va ese valor. ¿Es {listed}?"
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
            return f"Guardé el ensayo {n}."
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
