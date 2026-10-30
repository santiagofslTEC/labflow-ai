"""The active voice sessions and their turns (spec 0007, AC-13, AC-14). Lives in `app.state`,
created in the lifespan, per process (like the Claude cap); a redeploy ends every session,
which the spec accepts.

A turn is keyed by the count of user messages in the request. ElevenLabs may send the same
turn again with a longer sentence while you keep talking, so the newest request for a key
wins: the older run is marked superseded and, if it has not written yet, writes nothing."""

import asyncio
import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Annotated, cast

from fastapi import Depends, Request

from app.voice.session import TOKEN_MAX_AGE_S, VoiceClaims

TURN_LIMIT = 60
# Entries are dropped 30 min after the session started; a token lives 25 min.
SESSION_LIFE_S = 30 * 60


@dataclass(frozen=True, slots=True)
class Spoken:
    """What a turn says. `keep` is False for a failed turn, so saying it again runs anew.
    `auto_saved` is the proposal a turn saved with no tap, so a newer request for the same
    turn can take it back (AC-14)."""

    text: str
    keep: bool = True
    auto_saved: int | None = None


@dataclass(slots=True)
class RunFlags:
    """Read and set on the event loop only, with no await in between, so the write gate is
    atomic: once `wrote` is set, a newer request knows this run saved (or tried to)."""

    superseded: bool = False
    wrote: bool = False

    def may_write(self) -> bool:
        if self.superseded:
            return False
        self.wrote = True
        return True


@dataclass(frozen=True, slots=True)
class TurnRun:
    digest: str
    task: asyncio.Task[Spoken]
    flags: RunFlags


@dataclass(slots=True)
class ActiveSession:
    holder: str
    experiment_id: int
    started_at: float
    turns: dict[int, TurnRun] = field(default_factory=dict[int, TurnRun])


class Action(StrEnum):
    JOIN = "join"  # same key, same sentence: replay the stored reply or wait for it
    SUPERSEDE = "supersede"  # same key, a different (usually longer) sentence
    START = "start"
    LIMIT = "limit"


def digest_of(sentence: str) -> str:
    return hashlib.sha256(sentence.encode()).hexdigest()


def plan_request(turns: Mapping[int, TurnRun], key: int, digest: str) -> Action:
    """Pure: what a request for turn `key` does, given the runs this session already has.
    Superseded requests share their key with the newer one, so they never count twice."""
    current = turns.get(key)
    if current is not None:
        return Action.JOIN if current.digest == digest else Action.SUPERSEDE
    return Action.LIMIT if len(turns) >= TURN_LIMIT else Action.START


def is_live(active: ActiveSession, now: float) -> bool:
    return now - active.started_at < TOKEN_MAX_AGE_S


@dataclass
class VoiceSessions:
    active: dict[str, ActiveSession] = field(default_factory=dict[str, ActiveSession])

    def _prune(self, now: float) -> None:
        for sid in [s for s, a in self.active.items() if now - a.started_at >= SESSION_LIFE_S]:
            del self.active[sid]

    def open(self, claims: VoiceClaims, now: float) -> None:
        self._prune(now)
        self.active[claims.sid] = ActiveSession(claims.holder, claims.experiment_id, now)

    def get(self, claims: VoiceClaims, now: float) -> ActiveSession | None:
        """The session a token names, while it is active and belongs to the token's holder."""
        self._prune(now)
        active = self.active.get(claims.sid)
        if active is None or not is_live(active, now):
            return None
        if (active.holder, active.experiment_id) != (claims.holder, claims.experiment_id):
            return None
        return active

    def end(self, sid: str, holder: str) -> bool:
        """End a session; its token stops working. False when unknown or someone else's."""
        active = self.active.get(sid)
        if active is None or active.holder != holder:
            return False
        del self.active[sid]
        return True


def forget_failed(turns: dict[int, TurnRun], key: int, run: TurnRun) -> None:
    """Done callback: a failed (or crashed) run is not cached, unless a newer run took its key."""
    task = run.task
    failed = task.cancelled() or task.exception() is not None or not task.result().keep
    if failed and turns.get(key) is run:
        del turns[key]


def get_voice_sessions(request: Request) -> VoiceSessions:
    return cast(VoiceSessions, request.app.state.voice_sessions)


VoiceSessionsDep = Annotated[VoiceSessions, Depends(get_voice_sessions)]
