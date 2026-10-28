"""The capture prompt (spec 0006): Spanish, listing the variables, the pending card, the
saved trial numbers, and the last turns. Pure apart from reading the template once."""

from functools import cache
from pathlib import Path

from app.services.card_state import CardInfo, VariableInfo
from app.services.text import format_number
from app.services.turn_plan import TurnContext

_TEMPLATE = Path(__file__).parent / "prompts" / "capture.md"


@cache  # an immutable file read once, not app state
def _template() -> str:
    return _TEMPLATE.read_text(encoding="utf-8")


def _variable_line(v: VariableInfo) -> str:
    aliases = ", ".join(v.aliases) if v.aliases else "-"
    return f"- {v.id}: {v.name} ({v.unit or 'sin unidad'}); otros nombres: {aliases}"


def _card_text(card: CardInfo | None, variables: tuple[VariableInfo, ...]) -> str:
    if card is None:
        return "ninguna"
    names = {v.id: v for v in variables}
    trial = card.trial_number if card.trial_number is not None else "sin número"
    lines = [f"ensayo {trial}"]
    for value in card.values:
        v = names.get(value.variable_id)
        if v is not None:
            lines.append(f"- {v.name}: {format_number(value.value)} {v.unit or ''}".rstrip())
    return "\n".join(lines)


def system_prompt(context: TurnContext) -> str:
    turns = "\n".join(f"{role}: {text}" for role, text in context.last_turns) or "ninguna"
    trials = ", ".join(str(n) for n in sorted(context.trial_numbers)) or "ninguno"
    return _template().format(
        variables="\n".join(_variable_line(v) for v in context.variables),
        card=_card_text(context.card, context.variables),
        trials=trials,
        turns=turns,
    )
