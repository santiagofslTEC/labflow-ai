"use client";

import { SendHorizontalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";

import type { CaptureFailure } from "@/api/capture";
import { ProposalCard } from "@/components/proposal-card/proposal-card";
import type {
  ProposalCardState,
  TrialChoice,
} from "@/components/proposal-card/types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  useCheckValue,
  useChooseTrial,
  useConfirm,
  useDiscard,
  useEditValue,
  usePendingProposal,
  useSendUtterance,
  useUndo,
} from "@/hooks/use-capture";
import {
  cardState,
  isSelection,
  keepsWaiting,
  releasesWaiting,
  sentenceQuestion,
  type CardView,
  type SavedTrial,
  type Turn,
} from "@/lib/capture";

import { copy, failureMessage } from "./copy";
import { SavedNotice } from "./saved-notice";

const TEXT_MAX = 500;

type Overlay =
  | { readonly kind: "editing"; readonly variableId: number }
  | { readonly kind: "checking"; readonly variableId: number }
  | { readonly kind: "saving" }
  | { readonly kind: "save_error"; readonly message: string };

type Origin = "sentence" | "check" | "button";

export type CaptureStageProps = {
  readonly experimentId: number;
  // Features 7 and 20 refresh the table and "Último" here.
  readonly onSaved?: (saved: SavedTrial) => void;
  readonly onUndone?: () => void;
  // "chat" puts the text field last, under the card, and leaves LabFlow's
  // plain replies to the conversation thread above it.
  readonly layout?: "stacked" | "chat";
};

// The typed capture loop (spec 0006, AC-18): a text field above the confirm card.
function CaptureStage({
  experimentId,
  onSaved,
  onUndone,
  layout = "stacked",
}: CaptureStageProps) {
  const chat = layout === "chat";
  const pending = usePendingProposal(experimentId);
  const send = useSendUtterance(experimentId);
  const edit = useEditValue(experimentId);
  const check = useCheckValue(experimentId);
  const choose = useChooseTrial(experimentId);
  const confirm = useConfirm(experimentId);
  const discard = useDiscard(experimentId);
  const undo = useUndo(experimentId);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Turn["reply"]>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [savedCard, setSavedCard] = useState<CardView | null>(null);
  // AC-28: the last auto save, undoable until the next sentence is sent.
  const [notice, setNotice] = useState<SavedTrial | null>(null);
  // AC-8: the sentence for another trial, sent again once the pending card is
  // saved or discarded. Browser only; nothing about it is stored.
  const waiting = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardEnd = useRef<HTMLDivElement>(null);

  const busy =
    send.isPending ||
    edit.isPending ||
    check.isPending ||
    choose.isPending ||
    confirm.isPending ||
    discard.isPending ||
    undo.isPending;
  const card = pending.data ?? null;

  // In the chat a card under review, a saved card, or the saved notice comes
  // into view inside the chat box, just above the text field.
  const shown = savedCard?.id ?? notice?.proposalId ?? card?.id ?? null;
  useEffect(() => {
    if (chat && shown !== null)
      cardEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [chat, shown]);

  const handleTurn = (
    turn: Turn,
    origin: Origin,
    before: CardView | null,
    sentence?: string,
  ) => {
    setOverlay(null);
    setReply(turn.reply);
    if (turn.saved) {
      if (turn.saved.auto) setNotice(turn.saved);
      else if (before) setSavedCard(before);
      onSaved?.(turn.saved);
    }
    const held = waiting.current;
    if (origin === "sentence" && turn.reply?.reason === "pending_other_trial") {
      waiting.current = sentence ?? null;
      return;
    }
    if (held !== null && releasesWaiting(turn)) {
      waiting.current = null;
      submit(held, true);
      return;
    }
    if (!keepsWaiting(turn, origin === "check")) waiting.current = null;
  };

  // A resend skips the one request rule: it starts as the previous one ends.
  const submit = (text: string, isResend = false) => {
    const sentence = text.trim();
    if (!sentence || (busy && !isResend)) return;
    setError(null);
    setNotice(null); // the next sentence ends the undo window (AC-29)
    const before = card;
    send.mutate(sentence, {
      onSuccess: (turn) => {
        if (!isResend) setDraft("");
        handleTurn(turn, "sentence", before, sentence);
      },
      onError: (failure: CaptureFailure) => {
        if (isResend) setDraft(sentence); // keep it where the user can send it
        setError(failureMessage(failure));
      },
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(draft);
  };

  const onButtonError = (failure: CaptureFailure) => {
    setOverlay(null);
    setError(failureMessage(failure));
  };

  const doConfirm = (target: CardView) => {
    setOverlay({ kind: "saving" });
    confirm.mutate(target.id, {
      onSuccess: (turn) => handleTurn(turn, "button", target),
      onError: (failure) =>
        setOverlay({ kind: "save_error", message: failureMessage(failure) }),
    });
  };

  const doUndo = (target: SavedTrial) => {
    if (busy) return;
    setError(null);
    undo.mutate(target.proposalId, {
      onSuccess: (turn) => {
        setNotice(null);
        handleTurn(turn, "button", null);
        onUndone?.();
      },
      onError: (failure) => {
        setNotice(null);
        setError(failureMessage(failure));
      },
    });
  };

  const stateFor = (target: CardView): ProposalCardState => {
    if (overlay) return overlay;
    return cardState(target, reply);
  };

  const form = (
    <form onSubmit={onSubmit} noValidate>
      <Field data-invalid={error ? true : undefined} className="gap-1.5">
        <FieldLabel
          htmlFor="capture-text"
          className={chat ? "sr-only" : undefined}
        >
          {copy.label}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id="capture-text"
            value={draft}
            maxLength={TEXT_MAX}
            autoComplete="off"
            enterKeyHint="send"
            placeholder={copy.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "capture-error" : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            className="h-12"
          />
          <Button
            type="submit"
            size="lg"
            aria-disabled={busy || undefined}
            aria-label={send.isPending ? copy.sending : copy.send}
          >
            {send.isPending ? <Spinner /> : <SendHorizontalIcon aria-hidden />}
          </Button>
        </div>
        {error ? <FieldError id="capture-error">{error}</FieldError> : null}
      </Field>
    </form>
  );

  // In the chat layout the root is `contents`: the card and the text field sit
  // in the chat's scroll box, and the field sticks to its bottom.
  return (
    <div className={chat ? "contents" : "flex flex-col gap-4"}>
      {chat ? null : form}

      {pending.isError ? (
        <p role="alert" className="text-sm text-danger">
          {copy.loadError}
        </p>
      ) : null}

      {savedCard ? (
        <ProposalCard
          key={`saved-${savedCard.id}`}
          trialNumber={savedCard.trialNumber}
          values={savedCard.values}
          phrase={savedCard.phrase}
          source={savedCard.source}
          state={{ kind: "saved" }}
          onConfirm={noop}
          onEdit={noop}
          onCommitEdit={noop}
          onCancelEdit={noop}
          onDiscard={noop}
          onRetry={noop}
          onSettled={() => setSavedCard(null)}
        />
      ) : (
        <>
          {/* A split turn shows what it saved and the card that waits (spec 0011, AC-5). */}
          {notice ? (
            <SavedNotice
              key={`notice-${notice.proposalId}`}
              saved={notice}
              undoing={undo.isPending}
              onUndo={() => doUndo(notice)}
            />
          ) : null}
          {card && isSelection(card) ? (
            <div className="flex flex-col gap-1 text-sm text-ink-muted">
              <p role="status">{copy.selection(card.trialNumber)}</p>
              {sentenceQuestion(reply) ? (
                <p className="text-ink">{sentenceQuestion(reply)}</p>
              ) : null}
            </div>
          ) : card ? (
            <ProposalCard
              key={card.id}
              trialNumber={card.trialNumber}
              values={card.values}
              phrase={card.phrase}
              source={card.source}
              state={stateFor(card)}
              canConfirm={card.canConfirm}
              onConfirm={() => doConfirm(card)}
              onRetry={() => doConfirm(card)}
              onEdit={(variableId) =>
                setOverlay({ kind: "editing", variableId })
              }
              onCancelEdit={() => setOverlay(null)}
              onCommitEdit={(variableId, value) =>
                edit.mutate(
                  { proposalId: card.id, variableId, value },
                  {
                    onSuccess: (turn) => handleTurn(turn, "button", card),
                    onError: onButtonError,
                  },
                )
              }
              onCheck={(variableId) => {
                setOverlay({ kind: "checking", variableId });
                check.mutate(
                  { proposalId: card.id, variableId },
                  {
                    onSuccess: (turn) => handleTurn(turn, "check", card),
                    onError: onButtonError,
                  },
                );
              }}
              onChooseTrial={(kind: TrialChoice) =>
                choose.mutate(
                  { proposalId: card.id, kind },
                  {
                    onSuccess: (turn) => handleTurn(turn, "button", card),
                    onError: onButtonError,
                  },
                )
              }
              onDiscard={() =>
                discard.mutate(card.id, {
                  onSuccess: (turn) => handleTurn(turn, "button", card),
                  onError: onButtonError,
                })
              }
              onSettled={noop}
            />
          ) : !chat && !notice && reply ? (
            <p role="status" className="text-sm text-ink-muted">
              {reply.text}
            </p>
          ) : null}
        </>
      )}
      {chat ? <div ref={cardEnd} aria-hidden className="scroll-mb-28" /> : null}
      {chat ? (
        <div className="sticky bottom-[var(--tabbar-height)] z-10 -mx-4 mt-auto border-t border-line bg-surface/95 px-4 pt-3 pb-3 backdrop-blur-md lg:bottom-0 lg:mx-0 lg:border-t-0 lg:px-0 lg:pb-4">
          {form}
        </div>
      ) : null}
    </div>
  );
}

const noop = () => undefined;

export { CaptureStage };
