import type { ExperimentDetail, ExperimentSummary } from "@/api/experiments";

// The sample notebook as the API returns it (spec 0005).
export const sampleDetail: ExperimentDetail = {
  id: 7,
  title: "Rendimiento vs temperatura",
  goal: "Ver cómo la temperatura cambia el rendimiento de la reacción.",
  status: "open",
  created_by: "ana",
  created_at: "2026-10-28T15:00:00Z",
  variables: [
    {
      id: 1,
      name: "Temperatura",
      unit: "°C",
      min_value: 20,
      max_value: 100,
      required: true,
      position: 0,
    },
    {
      id: 2,
      name: "Duración",
      unit: "min",
      min_value: 0,
      max_value: null,
      required: true,
      position: 1,
    },
    {
      id: 3,
      name: "pH",
      unit: null,
      min_value: null,
      max_value: null,
      required: false,
      position: 2,
    },
  ],
};

export const summary = (
  id: number,
  overrides: Partial<ExperimentSummary> = {},
): ExperimentSummary => ({
  id,
  title: `Cuaderno ${id}`,
  status: "open",
  trial_count: 0,
  last_activity_at: new Date().toISOString(),
  ...overrides,
});
