"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createExperiment,
  createWithInstructions,
  experimentKeys,
  getExperiment,
  getTrials,
  listExperiments,
  readInstructions,
  type ApiFailure,
  type ApiResult,
  type ExperimentDetail,
  type NewExperiment,
  type ReadResult,
} from "@/api/experiments";
import type {
  AttachedInstructions,
  InstructionsInput,
  PageRange,
} from "@/lib/instructions";

// Every query and mutation rejects with an ApiFailure (see unwrap), never a
// bare Error, so screens can switch on `error.kind`.
declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiFailure;
  }
}

// Queries need a rejected promise to enter their error state, so the result
// union is unwrapped here, at the edge, and the failure itself is the error.
const unwrap = async <T>(result: Promise<ApiResult<T>>): Promise<T> => {
  const settled = await result;
  if (settled.ok) return settled.data;
  throw settled.error;
};

// Retrying a 404 or a 401 cannot help; anything else gets the one retry.
const retryOnce = (failures: number, error: ApiFailure): boolean =>
  failures < 1 && error.kind === "unavailable";

// The one cached list: /cuadernos, the sidebar, and later the push to talk
// picker read it, so they never disagree (spec 0005, AC-1, AC-12).
export function useExperiments() {
  return useQuery({
    queryKey: experimentKeys.all,
    queryFn: () => unwrap(listExperiments()),
    retry: retryOnce,
  });
}

// A notebook's saved trials for the side panel (spec 0007, AC-4).
export function useTrials(id: number) {
  return useQuery({
    queryKey: experimentKeys.trials(id),
    queryFn: () => unwrap(getTrials(id)),
    retry: retryOnce,
  });
}

export function useExperiment(id: number | null) {
  return useQuery({
    queryKey: experimentKeys.detail(id ?? -1),
    queryFn: () => unwrap(getExperiment(id ?? -1)),
    enabled: id !== null,
    retry: retryOnce,
  });
}

export type CreateRequest = {
  readonly body: NewExperiment;
  readonly instructions: AttachedInstructions | null;
};

// Mutations never retry (the library default), so a failed create is never
// sent twice (AC-7). Attached instructions take the multipart route (AC-29).
export function useCreateExperiment() {
  const client = useQueryClient();
  return useMutation<ExperimentDetail, ApiFailure, CreateRequest>({
    retry: false,
    mutationFn: ({ body, instructions }) =>
      unwrap(
        instructions === null
          ? createExperiment(body)
          : createWithInstructions(body, instructions),
      ),
    onSuccess: (created) => {
      client.setQueryData(experimentKeys.detail(created.id), created);
      return client.invalidateQueries({
        queryKey: experimentKeys.all,
        exact: true,
      });
    },
  });
}

export type ReadRequest = {
  readonly input: InstructionsInput;
  readonly range: PageRange | null;
  readonly signal: AbortSignal;
};

// The read never retries on its own (AC-21). It resolves with the result union,
// failures included, so the panel can switch on every outcome in one place.
export function useReadInstructions() {
  return useMutation<ReadResult, never, ReadRequest>({
    retry: false,
    mutationFn: ({ input, range, signal }) =>
      readInstructions(input, range, signal),
  });
}
