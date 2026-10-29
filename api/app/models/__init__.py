"""The seven tables of spec 0002, plus `protocol` and `protocol_page` (spec 0005).
Importing this package registers them all on `SQLModel.metadata`, which Alembic reads."""

from sqlmodel import SQLModel

# Set before any table module loads, so unnamed constraints get stable names.
SQLModel.metadata.naming_convention = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
}

from app.models.experiment import Experiment  # noqa: E402
from app.models.measurement import Measurement  # noqa: E402
from app.models.proposal import Proposal  # noqa: E402
from app.models.proposal_value import ProposalValue  # noqa: E402
from app.models.protocol import Protocol  # noqa: E402
from app.models.protocol_page import ProtocolPage  # noqa: E402
from app.models.trial import Trial  # noqa: E402
from app.models.turn import Turn  # noqa: E402
from app.models.variable import Variable  # noqa: E402

__all__ = [
    "Experiment",
    "Measurement",
    "Proposal",
    "ProposalValue",
    "Protocol",
    "ProtocolPage",
    "Trial",
    "Turn",
    "Variable",
]
