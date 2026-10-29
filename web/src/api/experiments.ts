import {
  INSTRUCTION_MESSAGES,
  type AttachedInstructions,
  type InstructionsInput,
  type PageRange,
} from "@/lib/instructions";

import { api } from "./client";
import type { components } from "./schema";

// Users see "cuaderno"; the API and these types keep "experiment" (spec 0005).
export type ExperimentSummary = components["schemas"]["ExperimentSummary"];
export type ExperimentDetail = components["schemas"]["ExperimentDetail"];
export type VariableDetail = components["schemas"]["VariableDetail"];
export type NewExperiment = components["schemas"]["NewExperiment"];
export type InstructionsRead = components["schemas"]["InstructionsRead"];
export type InstructionsProposal =
  components["schemas"]["InstructionsProposal"];

export const experimentKeys = {
  all: ["experiments"] as const,
  detail: (id: number) => ["experiments", id] as const,
};

// What went wrong, in the terms the screens care about. `invalid` carries the
// API's Spanish message; the others get fixed client copy.
export type ApiFailure =
  | { readonly kind: "not_found" }
  | {
      readonly kind: "invalid";
      readonly message: string;
      readonly code?: string;
    }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unavailable" };

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiFailure };

type Answer<T> = {
  readonly data?: T;
  readonly error?: { readonly message: string; readonly code?: string };
  readonly response: Response;
};

const toResult = <T>({ data, error, response }: Answer<T>): ApiResult<T> => {
  if (data !== undefined) return { ok: true, data };
  switch (response.status) {
    case 401:
      return { ok: false, error: { kind: "unauthorized" } };
    case 404:
      return { ok: false, error: { kind: "not_found" } };
    case 413:
    case 422:
      return {
        ok: false,
        error: {
          kind: "invalid",
          message:
            error?.message ??
            (response.status === 413 ? INSTRUCTION_MESSAGES.tooLarge : ""),
          code: error?.code,
        },
      };
    default:
      return { ok: false, error: { kind: "unavailable" } };
  }
};

// fetch rejects only when the network or the rewrite is down.
const settle = async <T>(
  request: () => Promise<Answer<T>>,
): Promise<ApiResult<T>> => {
  try {
    return toResult(await request());
  } catch {
    return { ok: false, error: { kind: "unavailable" } };
  }
};

export const listExperiments = (): Promise<
  ApiResult<readonly ExperimentSummary[]>
> => settle(() => api.GET("/api/experiments"));

export const getExperiment = (
  id: number,
): Promise<ApiResult<ExperimentDetail>> =>
  settle(() =>
    api.GET("/api/experiments/{experiment_id}", {
      params: { path: { experiment_id: id } },
    }),
  );

export const createExperiment = (
  body: NewExperiment,
): Promise<ApiResult<ExperimentDetail>> =>
  settle(() => api.POST("/api/experiments", { body }));

// The multipart bodies (spec 0005, AC-21, AC-29). openapi-fetch hands a
// FormData body to fetch as is; the cast is the one allowed in this file, since
// the generated body types describe the fields, not the FormData.
const formBody = (
  fields: Readonly<Record<string, string | Blob | number | null>>,
): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === null) continue;
    form.append(name, value instanceof Blob ? value : String(value));
  }
  return form;
};

// The typed body slot cannot hold a FormData; `never` fits any slot.
const asFormBody = (form: FormData): never => form as never;

// A read failure, in the terms the instructions panel cares about (AC-28).
export type ReadFailure =
  | { readonly kind: "rejected"; readonly message: string }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "aborted" };

export type ReadResult =
  | { readonly ok: true; readonly data: InstructionsRead }
  | { readonly ok: false; readonly error: ReadFailure };

type ReadErrorBody = { readonly message?: string } | string | undefined;

const readFailure = (status: number, error: ReadErrorBody): ReadFailure => {
  const message = typeof error === "object" ? error.message : undefined;
  switch (status) {
    case 401:
      return { kind: "unauthorized" };
    case 409:
      return {
        kind: "rejected",
        message: message ?? INSTRUCTION_MESSAGES.inProgress,
      };
    case 413:
      // Vercel's own limit answers 413 without the JSON error shape.
      return {
        kind: "rejected",
        message: message ?? INSTRUCTION_MESSAGES.tooLarge,
      };
    case 422:
      return message ? { kind: "rejected", message } : { kind: "unavailable" };
    default:
      return { kind: "unavailable" };
  }
};

export const readInstructions = async (
  input: InstructionsInput,
  range: PageRange | null,
  signal: AbortSignal,
): Promise<ReadResult> => {
  const form = formBody({
    ...(input.kind === "pdf" ? { file: input.file } : { text: input.text }),
    from_page: range?.from ?? null,
    to_page: range?.to ?? null,
  });
  try {
    const { data, error, response } = await api.POST(
      "/api/experiments/instructions/read",
      { body: asFormBody(form), bodySerializer: () => form, signal },
    );
    return data !== undefined
      ? { ok: true, data }
      : { ok: false, error: readFailure(response.status, error) };
  } catch {
    return {
      ok: false,
      error: signal.aborted ? { kind: "aborted" } : { kind: "unavailable" },
    };
  }
};

export const createWithInstructions = (
  body: NewExperiment,
  attached: AttachedInstructions,
): Promise<ApiResult<ExperimentDetail>> => {
  const form = formBody({
    body: JSON.stringify(body),
    ...(attached.kind === "pdf"
      ? {
          file: attached.file,
          read_from_page: attached.readFromPage,
          read_to_page: attached.readToPage,
        }
      : { instructions_text: attached.text }),
  });
  return settle(() =>
    api.POST("/api/experiments/with-instructions", {
      body: asFormBody(form),
      bodySerializer: () => form,
    }),
  );
};
