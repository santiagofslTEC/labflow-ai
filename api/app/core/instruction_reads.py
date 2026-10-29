"""One instructions read at a time per holder, and at most two PDFs parsed at once (spec 0005,
Settled rules). Lives in `app.state`, created in the lifespan, per process (like the Claude
cap); with one Railway worker that is the whole API."""

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Annotated, cast

from fastapi import Depends, Request

EXTRACTIONS_AT_ONCE = 2


@dataclass
class InstructionReads:
    holders: set[str] = field(default_factory=set[str])
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    extractions: asyncio.Semaphore = field(
        default_factory=lambda: asyncio.Semaphore(EXTRACTIONS_AT_ONCE)
    )

    @asynccontextmanager
    async def slot(self, holder: str) -> AsyncGenerator[bool]:
        """Yields False when this holder already has a read running. The slot is freed when
        the read ends, even if the browser cancelled it (Starlette keeps the handler going)."""
        async with self.lock:
            taken = holder in self.holders
            if not taken:
                self.holders.add(holder)
        try:
            yield not taken
        finally:
            if not taken:
                async with self.lock:
                    self.holders.discard(holder)


def get_instruction_reads(request: Request) -> InstructionReads:
    return cast(InstructionReads, request.app.state.instruction_reads)


InstructionReadsDep = Annotated[InstructionReads, Depends(get_instruction_reads)]
