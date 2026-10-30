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
export type TrialsView = components["schemas"]["TrialsView"];
export type TurnLine = components["schemas"]["TurnLine"];
export type FolderSummary = components["schemas"]["FolderSummary"];
export type ResultsView = components["schemas"]["ResultsView"];
export type VariableIn = components["schemas"]["VariableIn"];
export type VariablesDeleted = components["schemas"]["VariablesDeleted"];
export type VariableDetail = components["schemas"]["VariableDetail"];
export type NewExperiment = components["schemas"]["NewExperiment"];
export type InstructionsRead = components["schemas"]["InstructionsRead"];
export type InstructionsProposal =
  components["schemas"]["InstructionsProposal"];

export const experimentKeys = {
  all: ["experiments"] as const,
  detail: (id: number) => ["experiments", id] as const,
  // Under `all`, so the save invalidation refreshes it (spec 0007, AC-4).
  trials: (id: number) => ["experiments", id, "trials"] as const,
  results: (id: number) => ["experiments", id, "results"] as const,
  // The conversation thread; under `all`, so voice turns refresh it too.
  turns: (id: number) => ["experiments", id, "turns"] as const,
};

// Class folders (2026-10-30). Their counts change with every move, so a move
// refreshes both this key and the notebook list.
export const folderKeys = {
  all: ["folders"] as const,
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
    case 409:
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

// The saved trials by number and the 5 newest measurements (spec 0007, AC-1).
export const getTrials = (id: number): Promise<ApiResult<TrialsView>> =>
  settle(() =>
    api.GET("/api/experiments/{experiment_id}/trials", {
      params: { path: { experiment_id: id } },
    }),
  );

// The notebook's conversation, oldest first: spoken and typed lines and
// LabFlow's replies.
export const getTurns = (id: number): Promise<ApiResult<readonly TurnLine[]>> =>
  settle(() =>
    api.GET("/api/experiments/{experiment_id}/turns", {
      params: { path: { experiment_id: id } },
    }),
  );

// Class folders on the lab dashboard (2026-10-30).
export const listFolders = (): Promise<ApiResult<readonly FolderSummary[]>> =>
  settle(() => api.GET("/api/folders"));

export const createFolder = (name: string): Promise<ApiResult<FolderSummary>> =>
  settle(() => api.POST("/api/folders", { body: { name } }));

export const renameFolder = (
  id: number,
  name: string,
): Promise<ApiResult<FolderSummary>> =>
  settle(() =>
    api.PATCH("/api/folders/{folder_id}", {
      params: { path: { folder_id: id } },
      body: { name },
    }),
  );

// A 204 has no body, so success is read from the status.
export const deleteFolder = async (id: number): Promise<ApiResult<null>> => {
  const result = await settle(async () => {
    const answer = await api.DELETE("/api/folders/{folder_id}", {
      params: { path: { folder_id: id } },
    });
    return answer.response.ok ? { ...answer, data: null } : answer;
  });
  return result;
};

// `folderId` null takes the notebook out of its folder.
export const moveNotebook = (
  experimentId: number,
  folderId: number | null,
): Promise<ApiResult<ExperimentDetail>> =>
  settle(() =>
    api.PUT("/api/experiments/{experiment_id}/folder", {
      params: { path: { experiment_id: experimentId } },
      body: { folder_id: folderId },
    }),
  );

// Review variables after the notebook exists (spec 0008).
export const addVariable = (
  experimentId: number,
  body: VariableIn,
): Promise<ApiResult<VariableDetail>> =>
  settle(() =>
    api.POST("/api/experiments/{experiment_id}/variables", {
      params: { path: { experiment_id: experimentId } },
      body,
    }),
  );

export const updateVariable = (
  variableId: number,
  body: VariableIn,
): Promise<ApiResult<VariableDetail>> =>
  settle(() =>
    api.PUT("/api/variables/{variable_id}", {
      params: { path: { variable_id: variableId } },
      body,
    }),
  );

export const deleteVariables = (
  experimentId: number,
  variableIds: readonly number[],
): Promise<ApiResult<VariablesDeleted>> =>
  settle(() =>
    api.POST("/api/experiments/{experiment_id}/variables/delete", {
      params: { path: { experiment_id: experimentId } },
      body: { variable_ids: [...variableIds] },
    }),
  );

// Count, min, max, and mean per variable, worked out by the API (spec 0009).
export const getResults = (id: number): Promise<ApiResult<ResultsView>> =>
  settle(() =>
    api.GET("/api/experiments/{experiment_id}/results", {
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
