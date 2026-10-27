"""Load the sample experiment from the product doc through the proposal lifecycle, so every
measurement has a phrase, a source, and a turn (spec 0002, AC-13). Safe to run again: it
replaces the previous copy. Refuses to run against prod."""

import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

from sqlmodel import Session, col, delete  # noqa: E402

from app.core.db import get_engine  # noqa: E402
from app.core.settings import get_settings  # noqa: E402
from app.models import Experiment, Proposal, ProposalValue, Turn, Variable  # noqa: E402
from app.models.enums import Role, Source  # noqa: E402
from app.repositories import proposals, turns  # noqa: E402
from app.services.results import Confirmed  # noqa: E402

TITLE = "Ejemplo: rendimiento vs. temperatura"

# (name, unit, min, max, aliases)
VARIABLES = (
    ("Temperatura", "°C", 20.0, 100.0, ("temp", "T")),
    ("Duración", "min", 0.0, 180.0, ()),
    ("Rendimiento", "%", 0.0, 100.0, ()),
)

# The product doc's sample table: (trial, temperatura °C, duración min, rendimiento %)
TRIALS = (
    (1, 40.0, 15.0, 58.0),
    (2, 45.0, 15.0, 64.0),
    (3, 50.0, 15.0, 73.0),
    (4, 55.0, 15.0, 80.0),
    (5, 60.0, 15.0, 76.0),
)


def sentence(number: int, temperature: float, duration: float, yield_pct: float) -> str:
    return (
        f"Ensayo {number}: temperatura {temperature:g} grados, "
        f"duración {duration:g} minutos, rendimiento {yield_pct:g} por ciento"
    )


def seed(session: Session) -> int:
    """Replace the sample experiment and return its id."""
    session.exec(delete(Experiment).where(col(Experiment.title) == TITLE))
    experiment = Experiment(title=TITLE, created_by="seed")
    session.add(experiment)
    session.flush()
    assert experiment.id is not None
    variables = [
        Variable(
            experiment_id=experiment.id,
            name=name,
            unit=unit,
            min_value=low,
            max_value=high,
            required=True,
            position=position,
            aliases=list(aliases),
        )
        for position, (name, unit, low, high, aliases) in enumerate(VARIABLES)
    ]
    session.add_all(variables)
    session.commit()
    variable_ids = [v.id for v in variables]

    # Same order as a real capture: the sentence, a new card, its values, then confirm.
    for number, *values in TRIALS:
        turn = turns.add_turn(
            session, experiment.id, Role.USER, sentence(number, *values), Source.TEXT
        )
        proposal = proposals.start_proposal(session, experiment.id, trial_number=number)
        if not isinstance(turn, Turn) or not isinstance(proposal, Proposal):
            raise RuntimeError(f"seed could not start trial {number}: {turn!r} {proposal!r}")
        assert turn.id is not None and proposal.id is not None
        for variable_id, value in zip(variable_ids, values, strict=True):
            assert variable_id is not None
            saved = proposals.set_value(session, proposal.id, variable_id, value, turn.id)
            if not isinstance(saved, ProposalValue):
                raise RuntimeError(f"seed could not set a value on trial {number}: {saved!r}")
        result = proposals.confirm(session, proposal.id)
        if not isinstance(result, Confirmed):
            raise RuntimeError(f"seed could not confirm trial {number}: {result!r}")
    return experiment.id


def main() -> None:
    if get_settings().env != "dev":
        sys.exit("seed runs only with ENV=dev")
    with Session(get_engine()) as session:
        experiment_id = seed(session)
    print(f"Seeded experiment {experiment_id}: {TITLE!r}, trials 1 to {len(TRIALS)}")


if __name__ == "__main__":
    main()
