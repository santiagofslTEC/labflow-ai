"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  CircleCheckIcon,
  KeyboardIcon,
  MessageCircleQuestionIcon,
  MicIcon,
  OctagonAlertIcon,
  PencilIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatExact } from "@/lib/format";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, savedExit, settleMs, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { announcement, copy, saveLabel } from "./copy";
import {
  flightLayoutId,
  isFlagged,
  isUnsaved,
  needsCheck,
  type ProposalCardProps,
  type ProposalCardState,
  type ProposalValue,
  type TrialChoice,
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
  canConfirm,
  onConfirm,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onDiscard,
  onRetry,
  onSettled,
  onCheck,
  onChooseTrial,
}: ProposalCardProps) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const editFormId = useId();
  const unsaved = isUnsaved(state);
  const saving = state.kind === "saving";
  const missing = values.find((value) => value.value === null);
  const confirmable = canConfirm ?? (!missing && !values.some(needsCheck));
  // The API flags only values that fill an empty slot; a value that replaces a
  // saved one asks "¿Cambio…?" instead (spec 0011, AC-6).
  const flagged = isFlagged(values);
  const toCheck = values.some(needsCheck);
  const label = saveLabel(values, trialNumber, state.kind === "correction");

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
      state.kind === "choose_trial" ||
      state.kind === "pending_other_trial" ||
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
        data-flagged={(flagged && unsaved) || undefined}
        className={cn(
          "flex flex-col gap-4 rounded-card p-4 text-ink shadow-card transition-colors duration-300 sm:p-5",
          !unsaved
            ? "border border-solid border-saved bg-surface"
            : flagged
              ? "border-2 border-solid border-unsaved-border bg-unsaved"
              : "border border-dashed border-unsaved-border bg-unsaved",
        )}
      >
        <div ref={liveRef} aria-live="polite" className="sr-only" />

        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base leading-6 font-semibold">
            {trialNumber === null ? (
              <>
                Ensayo{" "}
                <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-md border border-dashed border-control px-2 font-mono text-ink-muted">
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

        <p className="flex items-start gap-2 border-l-2 border-line pl-3 text-sm text-ink-muted">
          {source === "voice" ? (
            <MicIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <KeyboardIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>
            <span className="sr-only">
              {source === "voice" ? copy.sourceVoice : copy.sourceText}:{" "}
            </span>
            <q>{phrase}</q>
          </span>
        </p>

        <motion.div
          layout="size"
          transition={spring.snappy}
          className="flex flex-col gap-3"
        >
          <Prompt
            state={state}
            trialNumber={trialNumber}
            toCheck={flagged && toCheck}
          />

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
                showFlags={flagged}
                onCheck={onCheck}
              />
            ))}
          </ul>

          {state.kind === "save_error" ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-control bg-sunken px-3 py-3 text-sm"
            >
              <OctagonAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-danger"
              />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium text-ink">{copy.saveErrorHeadline}</p>
                <p className="text-ink-muted">{state.message}</p>
              </div>
            </div>
          ) : null}

          <Actions
            state={state}
            saving={saving}
            confirmDisabled={!confirmable}
            label={label}
            trialNumber={trialNumber}
            editFormId={editFormId}
            primaryRef={primaryRef}
            onConfirm={onConfirm}
            onDiscard={onDiscard}
            onRetry={onRetry}
            onCancelEdit={onCancelEdit}
            onChooseTrial={onChooseTrial}
          />
        </motion.div>
      </section>
    </motion.div>
  );
}

function Prompt({
  state,
  trialNumber,
  toCheck,
}: {
  readonly state: ProposalCardState;
  readonly trialNumber: number | null;
  readonly toCheck: boolean;
}) {
  if ((state.kind === "proposed" || state.kind === "checking") && toCheck)
    return (
      <p className="flex items-start gap-2 font-semibold text-warning-ink">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
        {copy.promptFlagged}
      </p>
    );
  if (state.kind === "proposed")
    return <p className="font-medium">{copy.promptProposed}</p>;
  if (state.kind === "choose_trial" || state.kind === "pending_other_trial")
    return (
      <p className="flex items-start gap-2 font-medium">
        <MessageCircleQuestionIcon
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-warning-ink"
        />
        {state.question}
      </p>
    );
  if (state.kind === "correction")
    return (
      <p className="font-medium">
        {state.question ?? copy.promptCorrection(trialNumber)}
      </p>
    );
  if (state.kind === "needs_clarification")
    return (
      <p className="flex items-start gap-2 font-medium">
        <MessageCircleQuestionIcon
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-warning-ink"
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
  readonly showFlags: boolean;
  readonly onCheck: ((variableId: number) => void) | undefined;
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
  showFlags,
  onCheck,
}: ValueRowProps) {
  const { variableId, name, unit } = value;
  const editingThis =
    state.kind === "editing" && state.variableId === variableId;
  const slot = state.kind === "needs_clarification" && value.value === null;
  const canEdit =
    state.kind === "proposed" ||
    (state.kind === "needs_clarification" && value.value !== null);
  const flags = showFlags && value.value !== null ? (value.flags ?? []) : [];
  const checking = state.kind === "checking";
  const commit = (next: number) => onCommitEdit(variableId, next);

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <div
          className={cn(
            "flex min-w-0 flex-1 gap-1",
            editingThis || slot
              ? "flex-col"
              : "flex-wrap items-center justify-between gap-x-4",
          )}
        >
          <span className="text-sm text-ink-muted">{name}</span>
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
      {flags.length > 0 && value.value !== null ? (
        <div className="flex flex-col gap-2 rounded-control bg-surface/70 px-3 py-2">
          <ul className="flex flex-col gap-1">
            {flags.map((flag) => (
              <li
                key={flag.reason}
                className="flex items-start gap-2 text-sm text-warning-ink"
              >
                <TriangleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0"
                />
                {flag.text}
              </li>
            ))}
          </ul>
          {value.checked ? (
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <CheckIcon aria-hidden className="size-4 text-saved" />
              {copy.checkedNote}
            </p>
          ) : onCheck ? (
            <Button
              variant="secondary"
              size="md"
              className="self-start"
              aria-disabled={checking || undefined}
              onClick={checking ? undefined : () => onCheck(variableId)}
            >
              {checking && state.variableId === variableId ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CheckIcon aria-hidden data-icon="inline-start" />
              )}
              {copy.check(value.value, unit)}
            </Button>
          ) : null}
        </div>
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

  const current = formatExact(value.value, value.unit);
  const changed =
    state.kind === "correction" &&
    value.previous !== undefined &&
    value.previous !== null &&
    value.previous !== value.value;

  const said = value.saidText ?? null;
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
      {said !== null ? (
        <span className="flex items-baseline gap-2 text-sm text-ink-muted">
          <span className="sr-only">{copy.said}: </span>
          <q className="italic">{said}</q>
          <ArrowRightIcon aria-hidden className="size-3.5 self-center" />
          <span className="sr-only">{copy.understood}: </span>
        </span>
      ) : value.saidText === null ? (
        <span className="text-xs text-ink-muted">{copy.handwritten}</span>
      ) : null}
      {changed && value.previous !== null && value.previous !== undefined ? (
        <>
          <del className="font-mono text-base text-ink-muted tabular-nums">
            <span className="sr-only">{copy.before}: </span>
            {formatExact(value.previous, value.unit)}
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
        className={cn(
          READOUT,
          "inline-block no-underline",
          value.interpreted && "rounded-md bg-brand-soft px-1.5",
        )}
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
  readonly label: string;
  readonly trialNumber: number | null;
  readonly editFormId: string;
  readonly primaryRef: React.Ref<HTMLButtonElement>;
  readonly onConfirm: () => void;
  readonly onDiscard: () => void;
  readonly onRetry: () => void;
  readonly onCancelEdit: () => void;
  readonly onChooseTrial: ((choice: TrialChoice) => void) | undefined;
};

// Left to right, primary last. While saving the buttons stay focusable
// (aria-disabled) so focus does not drop to the page.
function Actions({
  state,
  saving,
  confirmDisabled,
  label,
  trialNumber,
  editFormId,
  primaryRef,
  onConfirm,
  onDiscard,
  onRetry,
  onCancelEdit,
  onChooseTrial,
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

  if (state.kind === "choose_trial")
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" size="lg" onClick={onDiscard}>
          {copy.actions.discard}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => onChooseTrial?.("new")}
        >
          {copy.chooseNew}
        </Button>
        <Button
          ref={primaryRef}
          size="lg"
          onClick={() => onChooseTrial?.("correction")}
        >
          {copy.chooseCorrection(trialNumber)}
        </Button>
      </div>
    );

  const busy = saving || state.kind === "checking";
  const primary =
    state.kind === "save_error"
      ? { label: copy.actions.retry, onClick: onRetry }
      : { label, onClick: onConfirm };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button
        variant="ghost"
        size="lg"
        aria-disabled={busy || undefined}
        onClick={busy ? undefined : onDiscard}
      >
        {copy.actions.discard}
      </Button>
      <Button
        ref={primaryRef}
        size="lg"
        disabled={!busy && state.kind !== "save_error" && confirmDisabled}
        aria-disabled={busy || undefined}
        onClick={busy ? undefined : primary.onClick}
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
