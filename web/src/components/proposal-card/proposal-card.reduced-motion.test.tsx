import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import {
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
} from "@/app/dev/ui/sample-data";
import { stubReducedMotion } from "@/test/media";

import { ProposalCard } from "./proposal-card";

// Its own file: Motion reads the reduced motion preference once per module.
beforeEach(() => {
  stubReducedMotion();
});

it("falls back to a fade and settles right after it (AC-15)", () => {
  vi.useFakeTimers();
  const onSettled = vi.fn();
  const p = {
    trialNumber: 3,
    values: SAMPLE_PROPOSAL_VALUES,
    phrase: SAMPLE_PHRASE,
    source: "text",
    onConfirm: vi.fn(),
    onEdit: vi.fn(),
    onCommitEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onDiscard: vi.fn(),
    onRetry: vi.fn(),
    onSettled,
  } as const;
  const { rerender } = render(
    <ProposalCard {...p} state={{ kind: "proposed" }} />,
  );
  const wrapper = screen
    .getByRole("region", { name: "Ensayo 3" })
    .closest("[data-slot=proposal-card]");
  expect(wrapper).toHaveAttribute("data-motion", "reduced");

  rerender(<ProposalCard {...p} state={{ kind: "saved" }} />);
  act(() => {
    vi.advanceTimersByTime(150);
  });
  expect(onSettled).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
