"""Ownership at the HTTP edge (spec 0014, AC-6): a principal reaches only notebooks in its
space, its own as an account or the shared null owner space as a code holder. Anything
outside answers the same 404 as a missing id, so an id reveals nothing."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlmodel import Session, col, select

from app.core.db import SessionDep
from app.core.errors import ApiError
from app.core.gate import PrincipalDep
from app.core.principal import owner_of
from app.models import Proposal, Variable
from app.repositories.space import notebook_visible

_ID_MAX = 2**63 - 1


def _notebook_of(
    session: Session, model: type[Proposal] | type[Variable], row_id: int
) -> int | None:
    if not 1 <= row_id <= _ID_MAX:
        return None
    return session.exec(select(col(model.experiment_id)).where(col(model.id) == row_id)).first()


def require_notebook(experiment_id: int, session: SessionDep, principal: PrincipalDep) -> None:
    if not notebook_visible(session, experiment_id, owner_of(principal)):
        raise ApiError(404, "experiment_not_found", "Este cuaderno no existe.")


def require_card(proposal_id: int, session: SessionDep, principal: PrincipalDep) -> None:
    notebook = _notebook_of(session, Proposal, proposal_id)
    if notebook is None or not notebook_visible(session, notebook, owner_of(principal)):
        raise ApiError(404, "proposal_not_found", "Esta tarjeta ya no existe.")


def require_variable(variable_id: int, session: SessionDep, principal: PrincipalDep) -> None:
    notebook = _notebook_of(session, Variable, variable_id)
    if notebook is None or not notebook_visible(session, notebook, owner_of(principal)):
        raise ApiError(404, "variable_not_found", "Esa variable ya no existe en este cuaderno.")


NOTEBOOK = Depends(require_notebook)
CARD = Depends(require_card)
VARIABLE = Depends(require_variable)


def current_owner(principal: PrincipalDep) -> UUID | None:
    return owner_of(principal)


OwnerDep = Annotated[UUID | None, Depends(current_owner)]
