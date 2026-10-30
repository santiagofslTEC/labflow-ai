"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  captureKeys,
  checkValue,
  chooseTrial,
  confirmProposal,
  discardProposal,
  editValue,
  getProposal,
  sendUtterance,
  undoSave,
  type CaptureFailure,
  type CaptureResult,
  type ProposalView,
  type TurnResponse,
} from "@/api/capture";
import { experimentKeys } from "@/api/experiments";
import { toCard, toTurn, type CardView, type Turn } from "@/lib/capture";

// Queries need a rejected promise to enter their error state, so the result
// union is unwrapped here, at the edge, and the failure itself is the error.
const unwrap = async <T>(result: Promise<CaptureResult<T>>): Promise<T> => {
  const settled = await result;
  if (settled.ok) return settled.data;
  throw settled.error;
};

// The pending card, so a reload shows it where it was (spec 0006, AC-17).
export function usePendingProposal(experimentId: number) {
  return useQuery<ProposalView | null, CaptureFailure, CardView | null>({
    queryKey: captureKeys.proposal(experimentId),
    queryFn: () => unwrap(getProposal(experimentId)),
    select: (view) => (view ? toCard(view) : null),
    retry: (failures, error) => failures < 1 && error.kind === "unavailable",
  });
}

// Every capture call answers with the card read back from the database, so the
// cache takes it as is. Mutations never retry: a sentence is never sent twice.
function useTurnMutation<V>(
  experimentId: number,
  request: (variables: V) => Promise<CaptureResult<TurnResponse>>,
) {
  const client = useQueryClient();
  return useMutation<Turn, CaptureFailure, V>({
    retry: false,
    mutationFn: async (variables) => {
      const response = await unwrap(request(variables));
      client.setQueryData(
        captureKeys.proposal(experimentId),
        response.proposal ?? null,
      );
      // Every turn adds lines to the conversation thread.
      void client.invalidateQueries({
        queryKey: experimentKeys.turns(experimentId),
      });
      return toTurn(response);
    },
  });
}

export const useSendUtterance = (experimentId: number) =>
  useTurnMutation(experimentId, (text: string) =>
    sendUtterance(experimentId, text),
  );

export const useEditValue = (experimentId: number) =>
  useTurnMutation(
    experimentId,
    (v: {
      readonly proposalId: number;
      readonly variableId: number;
      readonly value: number;
    }) => editValue(v.proposalId, v.variableId, v.value),
  );

export const useCheckValue = (experimentId: number) =>
  useTurnMutation(
    experimentId,
    (v: { readonly proposalId: number; readonly variableId: number }) =>
      checkValue(v.proposalId, v.variableId),
  );

export const useChooseTrial = (experimentId: number) =>
  useTurnMutation(
    experimentId,
    (v: { readonly proposalId: number; readonly kind: "correction" | "new" }) =>
      chooseTrial(v.proposalId, v.kind),
  );

export const useConfirm = (experimentId: number) =>
  useTurnMutation(experimentId, (proposalId: number) =>
    confirmProposal(proposalId),
  );

export const useDiscard = (experimentId: number) =>
  useTurnMutation(experimentId, (proposalId: number) =>
    discardProposal(proposalId),
  );

export const useUndo = (experimentId: number) =>
  useTurnMutation(experimentId, (proposalId: number) => undoSave(proposalId));
