"use client";

import {
  ArrowRightIcon,
  CircleCheckIcon,
  KeyboardIcon,
  MessageCircleQuestionIcon,
  MicIcon,
  PencilIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatQuantity } from "@/lib/format";
import { duration, savedExit, settleMs, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { announcement, copy } from "./copy";
import {
  flightLayoutId,
  isUnsaved,
  type ProposalCardProps,
  type ProposalCardState,
  type ProposalValue,
} from "./types";
import { ValueField } from "./value-field";

// The live region waits a beat after mount so assistive tech has seen it empty.
const LIVE_DELAY_MS = 100;

const isTextField = (element: Element | null): boolean =>
  element instanceof HTMLElement &&
  element.matches(
    "input, textarea, [contenteditable]:not([contenteditable=false])",
  );

function ProposalCard({
  trialNumber,
  values,
  layoutIdPrefix,
  phrase,
  source,
  state,
  onConfirm,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onDiscard,
  onRetry,
  onSettled,
}: ProposalCardProps) {
  const reduced = useReducedMotion() ?? false;
  const titleId = useId();
  const editFormId = useId();
  const unsaved = isUnsaved(state);
  const saving = state.kind === "saving";
  const missing = values.find((value) => value.value === null);

  const liveRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editButtons = useRef(new Map<number, HTMLButtonElement>());
  const slotInputs = useRef(new Map<number, HTMLInputElement>());
  const previous = useRef<ProposalCardState | null>(null);

  // AC-11: one polite region, rendered empty, then updated per state.
  const liveText = announcement(state, trialNumber, values);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = liveText;
    }, LIVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [liveText]);

  // AC-10: focus follows state kind changes, never stealing from a text field.
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before?.kind === state.kind) return;

    if (state.kind === "editing") {
      editInputRef.current?.focus();
      return;
    }
    if (before?.kind === "editing") {
      editButtons.current.get(before.variableId)?.focus();
      return;
    }
    if (isTextField(document.activeElement)) return;

    if (state.kind === "needs_clarification") {
      const slot = values.find((value) => value.value === null);
      if (slot) slotInputs.current.get(slot.variableId)?.focus();
      return;
    }
    if (state.kind === "proposed" && missing) {
      editButtons.current.get(missing.variableId)?.focus();
      return;
    }
    if (
      state.kind === "proposed" ||
      state.kind === "correction" ||
      state.kind === "save_error"
    ) {
      primaryRef.current?.focus();
    }
  }, [state, values, missing]);

  // AC-15: onSettled once, when the saved exit has finished.
  const onSettledRef = useRef(onSettled);
  const settled = useRef(false);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });
  useEffect(() => {
    if (state.kind !== "saved") return;
    const timer = window.setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      onSettledRef.current();
    }, settleMs(reduced));
    return () => window.clearTimeout(timer);
  }, [state.kind, reduced]);

  const enter = reduced
    ? { initial: { opacity: 0 }, transition: { duration: duration.fade } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.98 },
        transition: spring.gentle,
      };
  const exitTransition = reduced
    ? { duration: duration.fade }
    : {
        delay: savedExit.delay,
        duration: savedExit.collapse,
        ease: "easeInOut" as const,
      };

  return (
    <motion.div
      data-slot="proposal-card"
      data-motion={reduced ? "reduced" : "full"}
      initial={enter.initial}
      animate={
        state.kind === "saved"
          ? reduced
            ? { opacity: 0 }
            : { opacity: 0, height: 0, scale: 0.98 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={state.kind === "saved" ? exitTransition : enter.transition}
      className={cn(state.kind === "saved" && "overflow-hidden")}
    >
      <section
        aria-labelledby={titleId}
        data-state={state.kind}
        data-saved={!unsaved}
        className={cn(
          "flex flex-col gap-5 rounded-card p-5 text-ink shadow-card transition-colors duration-300 sm:p-6",
          unsaved
            ? "border-2 border-dashed border-unsaved-border bg-unsaved"
            : "border-2 border-solid border-saved bg-surface",
        )}
      >
        <div ref={liveRef} aria-live="polite" className="sr-only" />

        <header className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl leading-7 font-semibold">
            {trialNumber === null ? (
              <>
                Ensayo{" "}
                <span className="inline-flex h-7 min-w-9 items-center justify-center rounded-md border border-dashed border-control px-2 font-mono text-ink-muted">
                  ?
                </span>
              </>
            ) : (
              copy.title(trialNumber)
            )}
          </h2>
          {unsaved ? (
            <Badge variant="unsaved">{copy.unsavedBadge}</Badge>
          ) : (
            <motion.span
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduced ? { duration: duration.fade } : spring.snappy}
            >
              <Badge variant="saved">
                <CircleCheckIcon aria-hidden />
                {copy.savedBadge}
              </Badge>
            </motion.span>
          )}
        </header>

        <p className="flex items-start gap-2 text-sm text-ink-muted">
          {source === "voice" ? (
            <MicIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <KeyboardIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            <span className="sr-only">
              {source === "voice" ? copy.sourceVoice : copy.sourceText}:{" "}
            </span>
            <q className="italic">{phrase}</q>
          </span>
        </p>

        <motion.div
          layout="size"
          transition={spring.snappy}
          className="flex flex-col gap-4"
        >
          <Prompt state={state} trialNumber={trialNumber} />

          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {values.map((value) => (
              <ValueRow
                key={value.variableId}
                value={value}
                state={state}
                layoutId={flightLayoutId(layoutIdPrefix, value.variableId)}
                editFormId={editFormId}
                editInputRef={editInputRef}
                registerEditButton={(node) => {
                  if (node) editButtons.current.set(value.variableId, node);
                  else editButtons.current.delete(value.variableId);
                }}
                registerSlot={(node) => {
                  if (node) slotInputs.current.set(value.variableId, node);
                  else slotInputs.current.delete(value.variableId);
                }}
                onEdit={onEdit}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
              />
            ))}
          </ul>

          {state.kind === "save_error" ? (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-control border border-danger bg-surface px-4 py-3 text-sm"
            >
              <p className="font-semibold text-danger">
                {copy.saveErrorHeadline}
              </p>
              <p className="text-ink">{state.message}</p>
            </div>
          ) : null}

          <Actions
            state={state}
            saving={saving}
            confirmDisabled={Boolean(missing)}
            editFormId={editFormId}
            primaryRef={primaryRef}
            onConfirm={onConfirm}
            onDiscard={onDiscard}
            onRetry={onRetry}
            onCancelEdit={onCancelEdit}
          />
        </motion.div>
      </section>
    </motion.div>
  );
}

function Prompt({
  state,
  trialNumber,
}: {
  readonly state: ProposalCardState;
  readonly trialNumber: number | null;
}) {
  if (state.kind === "proposed")
    return <p className="text-lg font-medium">{copy.promptProposed}</p>;
  if (state.kind === "correction")
    return (
      <p className="text-lg font-medium">
        {copy.promptCorrection(trialNumber)}
      </p>
    );
  if (state.kind === "needs_clarification")
    return (
      <p className="flex items-start gap-2 text-lg font-medium">
        <MessageCircleQuestionIcon
          aria-hidden
          className="mt-1 size-5 shrink-0 text-warning-ink"
        />
        {state.question}
      </p>
    );
  return null;
}

type ValueRowProps = {
  readonly value: ProposalValue;
  readonly state: ProposalCardState;
  readonly layoutId: string | undefined;
  readonly editFormId: string;
  readonly editInputRef: React.Ref<HTMLInputElement>;
  readonly registerEditButton: (node: HTMLButtonElement | null) => void;
  readonly registerSlot: (node: HTMLInputElement | null) => void;
  readonly onEdit: (variableId: number) => void;
  readonly onCommitEdit: (variableId: number, value: number) => void;
  readonly onCancelEdit: () => void;
};

function ValueRow({
  value,
  state,
  layoutId,
  editFormId,
  editInputRef,
  registerEditButton,
  registerSlot,
  onEdit,
  onCommitEdit,
  onCancelEdit,
}: ValueRowProps) {
  const { variableId, name, unit } = value;
  const editingThis =
    state.kind === "editing" && state.variableId === variableId;
  const slot = state.kind === "needs_clarification" && value.value === null;
  const canEdit =
    state.kind === "proposed" ||
    (state.kind === "needs_clarification" && value.value !== null);
  const commit = (next: number) => onCommitEdit(variableId, next);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-label font-semibold text-ink-muted uppercase">
            {name}
          </span>
          {editingThis ? (
            <ValueField
              key={`edit-${variableId}-${value.value}`}
              formId={editFormId}
              name={name}
              unit={unit}
              initial={value.value}
              onCommit={commit}
              onCancel={onCancelEdit}
              inputRef={editInputRef}
            />
          ) : slot ? (
            <ValueField
              key={`slot-${variableId}`}
              name={name}
              unit={unit}
              initial={null}
              onCommit={commit}
              inputRef={registerSlot}
            />
          ) : (
            <Reading value={value} state={state} layoutId={layoutId} />
          )}
        </div>
        {canEdit ? (
          <Button
            ref={registerEditButton}
            variant="ghost"
            size="icon-lg"
            aria-label={copy.edit(name)}
            onClick={() => onEdit(variableId)}
          >
            <PencilIcon aria-hidden />
          </Button>
        ) : null}
      </div>
      {value.warning ? (
        <p className="flex items-center gap-2 rounded-control border border-unsaved-border bg-unsaved px-3 py-2 text-sm text-warning-ink">
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          {value.warning}
        </p>
      ) : null}
    </li>
  );
}

const READOUT = "font-mono text-readout tabular-nums lg:text-readout-lg";

function Reading({
  value,
  state,
  layoutId,
}: {
  readonly value: ProposalValue;
  readonly state: ProposalCardState;
  readonly layoutId: string | undefined;
}) {
  if (value.value === null)
    return (
      <span className="inline-flex h-10 w-24 items-center justify-center rounded-control border border-dashed border-control">
        <span aria-hidden className={cn(READOUT, "text-ink-muted")}>
          —
        </span>
        <span className="sr-only">{copy.emptySlot(value.name)}</span>
      </span>
    );

  const current = formatQuantity(value.value, value.unit);
  const changed =
    state.kind === "correction" &&
    value.previous !== undefined &&
    value.previous !== null &&
    value.previous !== value.value;

  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {changed && value.previous !== null && value.previous !== undefined ? (
        <>
          <del className="font-mono text-lg text-ink-muted tabular-nums">
            <span className="sr-only">{copy.before}: </span>
            {formatQuantity(value.previous, value.unit)}
          </del>
          <ArrowRightIcon
            aria-hidden
            className="size-4 self-center text-ink-muted"
          />
        </>
      ) : null}
      <motion.span
        layoutId={layoutId}
        layout="position"
        transition={spring.gentle}
        className={cn(READOUT, "inline-block no-underline")}
      >
        {changed ? (
          <ins className="no-underline">
            <span className="sr-only">{copy.after}: </span>
            {current}
          </ins>
        ) : (
          current
        )}
      </motion.span>
    </span>
  );
}

type ActionsProps = {
  readonly state: ProposalCardState;
  readonly saving: boolean;
  readonly confirmDisabled: boolean;
  readonly editFormId: string;
  readonly primaryRef: React.Ref<HTMLButtonElement>;
  readonly onConfirm: () => void;
  readonly onDiscard: () => void;
  readonly onRetry: () => void;
  readonly onCancelEdit: () => void;
};

// Left to right, primary last. While saving the buttons stay focusable
// (aria-disabled) so focus does not drop to the page.
function Actions({
  state,
  saving,
  confirmDisabled,
  editFormId,
  primaryRef,
  onConfirm,
  onDiscard,
  onRetry,
  onCancelEdit,
}: ActionsProps) {
  if (state.kind === "saved") return null;

  if (state.kind === "editing")
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" size="lg" onClick={onCancelEdit}>
          {copy.actions.cancel}
        </Button>
        <Button type="submit" form={editFormId} size="lg">
          {copy.actions.save}
        </Button>
      </div>
    );

  const primary =
    state.kind === "correction"
      ? { label: copy.actions.replace, onClick: onConfirm }
      : state.kind === "save_error"
        ? { label: copy.actions.retry, onClick: onRetry }
        : { label: copy.actions.confirm, onClick: onConfirm };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button
        variant="ghost"
        size="lg"
        aria-disabled={saving || undefined}
        onClick={saving ? undefined : onDiscard}
      >
        {copy.actions.discard}
      </Button>
      <Button
        ref={primaryRef}
        size="lg"
        disabled={
          !saving &&
          state.kind !== "correction" &&
          state.kind !== "save_error" &&
          confirmDisabled
        }
        aria-disabled={saving || undefined}
        onClick={saving ? undefined : primary.onClick}
      >
        {saving ? (
          <>
            <Spinner data-icon="inline-start" />
            {copy.actions.saving}
          </>
        ) : (
          primary.label
        )}
      </Button>
    </div>
  );
}

export { ProposalCard };
export type {
  ProposalCardProps,
  ProposalCardState,
  ProposalValue,
} from "./types";
