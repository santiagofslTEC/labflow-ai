import { api } from "./client";
import type { components } from "./schema";

// Users see "cuaderno"; the API and these types keep "experiment" (spec 0005).
export type ExperimentSummary = components["schemas"]["ExperimentSummary"];
export type ExperimentDetail = components["schemas"]["ExperimentDetail"];
export type VariableDetail = components["schemas"]["VariableDetail"];
export type NewExperiment = components["schemas"]["NewExperiment"];

export const experimentKeys = {
  all: ["experiments"] as const,
  detail: (id: number) => ["experiments", id] as const,
};

// What went wrong, in the terms the screens care about. `invalid` carries the
// API's Spanish message; the others get fixed client copy.
export type ApiFailure =
  | { readonly kind: "not_found" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unavailable" };

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiFailure };

type Answer<T> = {
  readonly data?: T;
  readonly error?: { readonly message: string };
  readonly response: Response;
};

const toResult = <T>({ data, error, response }: Answer<T>): ApiResult<T> => {
  if (data !== undefined) return { ok: true, data };
  switch (response.status) {
    case 401:
      return { ok: false, error: { kind: "unauthorized" } };
    case 404:
      return { ok: false, error: { kind: "not_found" } };
    case 422:
      return {
        ok: false,
        error: { kind: "invalid", message: error?.message ?? "" },
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
