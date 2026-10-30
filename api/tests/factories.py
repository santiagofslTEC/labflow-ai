"""Rows for database tests: a notebook with the seed's three variables."""

from dataclasses import dataclass
from uuid import UUID

from sqlmodel import Session

from app.models import Experiment, Variable


@dataclass(frozen=True)
class Notebook:
    experiment_id: int
    temp: int
    dur: int
    rend: int


def make_notebook(
    session: Session, title: str = "Prueba captura", owner: UUID | None = None
) -> Notebook:
    """A notebook with Temperatura, Duración, and Rendimiento; a null owner is the access
    codes' shared space, an owner is that account's (spec 0014)."""
    experiment = Experiment(title=title, created_by="test", owner_id=owner)
    session.add(experiment)
    session.flush()
    assert experiment.id is not None
    rows = [
        Variable(
            experiment_id=experiment.id,
            name="Temperatura",
            unit="°C",
            min_value=20,
            max_value=100,
            position=0,
            aliases=["temp"],
        ),
        Variable(
            experiment_id=experiment.id,
            name="Duración",
            unit="min",
            min_value=0,
            max_value=180,
            position=1,
        ),
        Variable(
            experiment_id=experiment.id,
            name="Rendimiento",
            unit="%",
            min_value=0,
            max_value=100,
            position=2,
        ),
    ]
    session.add_all(rows)
    session.commit()
    ids = [r.id for r in rows]
    assert all(i is not None for i in ids)
    return Notebook(experiment.id, *(i for i in ids if i is not None))
