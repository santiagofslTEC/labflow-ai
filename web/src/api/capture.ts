import { api } from "./client";
import type { components } from "./schema";

// Text capture and the confirm card (spec 0006). snake_case like the API; the
// hooks turn it into the card's camelCase props.
export type TurnResponse = components["schemas"]["TurnResponse"];
export type ProposalView = components["schemas"]["ProposalView"];
export type ReplyReason = components["schemas"]["Reason"];

export const captureKeys = {
  proposal: (experimentId: number) => ["proposal", experimentId] as const,
};

// Capture errors carry the API's Spanish message, which the stage shows as is
// (a 409 not_pending, a 503 llm_unavailable, a 422 invalid_text...).
export type CaptureFailure =
  | { readonly kind: "unauthorized" }
  | {
      readonly kind: "rejected";
      readonly code: string;
      readonly message: string;
    }
  | { readonly kind: "unavailable" };

export type CaptureResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: CaptureFailure };

type Answer<T> = {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
};

// The API's one error shape: {"code", "message"} (AGENTS.md).
const apiError = (
  error: unknown,
): { readonly code: string; readonly message: string } | null =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  "message" in error &&
  typeof error.code === "string" &&
  typeof error.message === "string"
    ? { code: error.code, message: error.message }
    : null;

const toResult = <T>({
  data,
  error,
  response,
}: Answer<T>): CaptureResult<T> => {
  if (response.ok) return { ok: true, data: data as T };
  if (response.status === 401)
    return { ok: false, error: { kind: "unauthorized" } };
  const body = apiError(error);
  if (body) return { ok: false, error: { kind: "rejected", ...body } };
  return { ok: false, error: { kind: "unavailable" } };
};

const settle = async <T>(
  request: () => Promise<Answer<T>>,
): Promise<CaptureResult<T>> => {
  try {
    return toResult(await request());
  } catch {
    return { ok: false, error: { kind: "unavailable" } };
  }
};

export const getProposal = (
  experimentId: number,
): Promise<CaptureResult<ProposalView | null>> =>
  settle(() =>
    api.GET("/api/experiments/{experiment_id}/proposal", {
      params: { path: { experiment_id: experimentId } },
    }),
  );

export const sendUtterance = (
  experimentId: number,
  text: string,
): Promise<CaptureResult<TurnResponse>> =>
  settle(() =>
    api.POST("/api/experiments/{experiment_id}/utterances", {
      params: { path: { experiment_id: experimentId } },
      body: { text },
    }),
  );

export const editValue = (
  proposalId: number,
  variableId: number,
  value: number,
): Promise<CaptureResult<TurnResponse>> =>
  settle(() =>
    api.PUT("/api/proposals/{proposal_id}/values/{variable_id}", {
      params: { path: { proposal_id: proposalId, variable_id: variableId } },
      body: { value },
    }),
  );

export const checkValue = (
  proposalId: number,
  variableId: number,
): Promise<CaptureResult<TurnResponse>> =>
  settle(() =>
    api.POST("/api/proposals/{proposal_id}/values/{variable_id}/check", {
      params: { path: { proposal_id: proposalId, variable_id: variableId } },
    }),
  );

export const chooseTrial = (
  proposalId: number,
  kind: "correction" | "new",
): Promise<CaptureResult<TurnResponse>> =>
  settle(() =>
    api.POST("/api/proposals/{proposal_id}/trial", {
      params: { path: { proposal_id: proposalId } },
      body: { kind },
    }),
  );

export const confirmProposal = (
  proposalId: number,
): Promise<CaptureResult<TurnResponse>> =>
  settle(() =>
    api.POST("/api/proposals/{proposal_id}/confirm", {
      params: { path: { proposal_id: proposalId } },
    }),
  );

export const discardProposal = (
  proposalId: number,
): Promise<CaptureResult<TurnResponse>> =>
  settle(() =>
    api.POST("/api/proposals/{proposal_id}/discard", {
      params: { path: { proposal_id: proposalId } },
    }),
  );
