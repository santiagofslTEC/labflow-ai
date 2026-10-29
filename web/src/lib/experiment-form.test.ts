import { describe, expect, it } from "vitest";

import type { InstructionsProposal } from "@/api/experiments";

import {
  EXAMPLE,
  LIMITS,
  MESSAGES,
  fieldId,
  formReducer,
  initialFormState,
  isPristine,
  toCreateBody,
  validateExperimentForm,
  type FormAction,
  type FormState,
} from "./experiment-form";

const apply = (...actions: readonly FormAction[]): FormState =>
  actions.reduce(formReducer, initialFormState);

const setRow = (
  key: number,
  field: "name" | "unit" | "min" | "max",
  value: string,
): FormAction => ({ type: "set_variable", key, field, value });

const valid = (...actions: readonly FormAction[]) =>
  apply(
    { type: "set_title", value: "Cuaderno" },
    setRow(0, "name", "A"),
    ...actions,
  );

describe("limits (shared with the API)", () => {
  it("match api/app/services/experiment_rules.py", () => {
    expect(LIMITS).toEqual({
      title: 200,
      goal: 1000,
      context: 600,
      name: 80,
      unit: 20,
      variables: 12,
    });
  });
});

describe("formReducer", () => {
  it("starts with one empty, required row", () => {
    expect(initialFormState.variables).toEqual([
      { key: 0, name: "", unit: "", min: "", max: "", required: true },
    ]);
  });

  it("adds rows at the end, up to 12", () => {
    const twelve = apply(
      ...Array.from({ length: 15 }, () => ({ type: "add_row" }) as const),
    );
    expect(twelve.variables).toHaveLength(LIMITS.variables);
    expect(twelve.variables.map((row) => row.key)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );
  });

  it("never removes the last row", () => {
    expect(apply({ type: "remove_row", key: 0 }).variables).toHaveLength(1);
    const removed = apply({ type: "add_row" }, { type: "remove_row", key: 0 });
    expect(removed.variables.map((row) => row.key)).toEqual([1]);
  });

  it("fills the sample experiment without sending anything", () => {
    const filled = apply({ type: "fill_example" });
    expect(filled.title).toBe(EXAMPLE.title);
    expect(filled.goal).toBe(EXAMPLE.goal);
    expect(
      filled.variables.map(({ name, unit, min, max, required }) => ({
        name,
        unit,
        min,
        max,
        required,
      })),
    ).toEqual(EXAMPLE.variables.map((row) => ({ ...row, required: true })));
  });

  it("does not mutate the previous state", () => {
    const before = apply({ type: "set_title", value: "A" });
    formReducer(before, { type: "set_title", value: "B" });
    expect(before.title).toBe("A");
  });
});

describe("isPristine (AC-6)", () => {
  it("is true only for the initial state", () => {
    expect(isPristine(initialFormState)).toBe(true);
    expect(isPristine(apply({ type: "set_title", value: "x" }))).toBe(false);
    expect(
      isPristine(apply({ type: "set_required", key: 0, value: false })),
    ).toBe(false);
    expect(isPristine(apply({ type: "add_row" }))).toBe(false);
  });

  it("is true again once everything is cleared, whatever the row keys", () => {
    const cleared = apply(
      { type: "add_row" },
      setRow(1, "name", "x"),
      { type: "remove_row", key: 0 },
      setRow(1, "name", ""),
    );
    expect(isPristine(cleared)).toBe(true);
  });
});

describe("validateExperimentForm (AC-5)", () => {
  it("accepts a filled sample", () => {
    expect(validateExperimentForm(apply({ type: "fill_example" }))).toEqual({});
  });

  it("asks for a title and a name, after trimming", () => {
    const errors = validateExperimentForm(
      apply({ type: "set_title", value: "   " }, setRow(0, "name", " ")),
    );
    expect(errors).toEqual({
      [fieldId.title]: MESSAGES.titleRequired,
      [fieldId.variable(0, "name")]: MESSAGES.nameRequired,
    });
  });

  it("checks every length limit", () => {
    const errors = validateExperimentForm(
      apply(
        { type: "set_title", value: "x".repeat(201) },
        { type: "set_goal", value: "x".repeat(1001) },
        setRow(0, "name", "x".repeat(81)),
        setRow(0, "unit", "x".repeat(21)),
      ),
    );
    expect(Object.values(errors)).toEqual([
      MESSAGES.tooLong(200),
      MESSAGES.tooLong(1000),
      MESSAGES.tooLong(80),
      MESSAGES.tooLong(20),
    ]);
  });

  it("flags a later name equal after trim and lower case", () => {
    const errors = validateExperimentForm(
      valid(
        { type: "add_row" },
        setRow(0, "name", "Temperatura"),
        setRow(1, "name", " temperatura "),
      ),
    );
    expect(errors).toEqual({
      [fieldId.variable(1, "name")]: MESSAGES.duplicateName,
    });
  });

  it.each(["abc", ".5", "1e3", "1.000,5", "1".repeat(400)])(
    "rejects %s as a bound",
    (text) => {
      expect(validateExperimentForm(valid(setRow(0, "min", text)))).toEqual({
        [fieldId.variable(0, "min")]: MESSAGES.notANumber,
      });
    },
  );

  it("accepts comma or point decimals and a negative bound", () => {
    expect(
      validateExperimentForm(
        valid(setRow(0, "min", "-273"), setRow(0, "max", "73,5")),
      ),
    ).toEqual({});
  });

  it("puts min above max on the min field", () => {
    expect(
      validateExperimentForm(
        valid(setRow(0, "min", "90"), setRow(0, "max", "80")),
      ),
    ).toEqual({ [fieldId.variable(0, "min")]: MESSAGES.minAboveMax });
  });

  it("lists errors in form order, so the first is the field to focus", () => {
    const errors = validateExperimentForm(
      apply({ type: "add_row" }, setRow(1, "max", "x")),
    );
    expect(Object.keys(errors)).toEqual([
      fieldId.title,
      fieldId.variable(0, "name"),
      fieldId.variable(1, "name"),
      fieldId.variable(1, "max"),
    ]);
  });
});

describe("toCreateBody", () => {
  it("trims, parses decimals, and turns blanks into null", () => {
    const state = apply(
      { type: "set_title", value: "  Cuaderno  " },
      { type: "set_goal", value: "   " },
      setRow(0, "name", " pH "),
      setRow(0, "unit", "  "),
      setRow(0, "min", "20,5"),
      { type: "set_required", key: 0, value: false },
    );
    expect(toCreateBody(state)).toEqual({
      title: "Cuaderno",
      goal: null,
      context: null,
      variables: [
        {
          name: "pH",
          unit: null,
          min_value: 20.5,
          max_value: null,
          required: false,
        },
      ],
    });
  });

  it("keeps the row order", () => {
    const body = toCreateBody(apply({ type: "fill_example" }));
    expect(body.variables.map((v) => v.name)).toEqual([
      "Temperatura",
      "Duración",
      "Rendimiento",
    ]);
    expect(body.variables[1]).toMatchObject({ min_value: 0, max_value: 180 });
  });
});

describe("from instructions (AC-23, AC-24, AC-26, AC-27)", () => {
  const proposal = (
    variables: InstructionsProposal["variables"],
  ): InstructionsProposal => ({
    kind: "proposal",
    title: "Práctica 3",
    goal: null,
    context: "Se mide el rendimiento.",
    variables,
    found_count: variables.length,
    page_count: 1,
    read_from_page: null,
    read_to_page: null,
  });
  const temperatura = {
    name: "Temperatura",
    unit: "°C",
    min_value: 40.5,
    max_value: 10000,
    required: true,
    range_quote: "entre 40,5 y 10000 °C",
    range_page: 2,
  };
  const attached = { kind: "text", text: "instrucciones" } as const;
  const filled = (variables: InstructionsProposal["variables"]) =>
    apply(
      { type: "set_title", value: "Lo que escribí" },
      { type: "fill_from_proposal", proposal: proposal(variables), attached },
    );

  it("replaces every value and keeps the quote of a kept range", () => {
    const state = filled([
      temperatura,
      {
        ...temperatura,
        name: "Rendimiento",
        unit: "%",
        min_value: null,
        max_value: null,
        range_quote: null,
        range_page: null,
      },
    ]);
    expect(state.title).toBe("Práctica 3");
    expect(state.context).toBe("Se mide el rendimiento.");
    expect(state.instructions).toEqual(attached);
    const [first, second] = state.variables;
    expect(first).toMatchObject({
      name: "Temperatura",
      unit: "°C",
      min: "40,5",
      max: "10000",
      proposedRange: { quote: "entre 40,5 y 10000 °C", page: 2 },
    });
    expect(second).toMatchObject({ min: "", max: "", proposedRange: null });
    expect(toCreateBody(state).variables[0]).toMatchObject({
      min_value: 40.5,
      max_value: 10000,
    });
  });

  it("keeps one empty row when nothing was proposed", () => {
    const state = filled([]);
    expect(state.variables).toHaveLength(1);
    expect(state.variables[0]?.name).toBe("");
  });

  it("stops at 12 rows", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...temperatura,
      name: `V${i}`,
    }));
    expect(filled(many).variables).toHaveLength(12);
  });

  it("forgets the quote for good once a bound is edited", () => {
    const state = filled([temperatura]);
    const key = state.variables[0]?.key ?? -1;
    const edited = formReducer(state, setRow(key, "max", "90"));
    expect(edited.variables[0]?.proposedRange).toBe(null);
    const back = formReducer(edited, setRow(key, "max", "10000"));
    expect(back.variables[0]?.proposedRange).toBe(null);
  });

  it("counts attached instructions or a context as a change", () => {
    expect(isPristine(apply({ type: "attach_instructions", attached }))).toBe(
      false,
    );
    expect(isPristine(apply({ type: "set_context", value: "x" }))).toBe(false);
    expect(
      isPristine(
        apply(
          { type: "attach_instructions", attached },
          { type: "detach_instructions" },
        ),
      ),
    ).toBe(true);
  });

  it("blocks a context over 600", () => {
    const state = valid({ type: "set_context", value: "x".repeat(601) });
    expect(validateExperimentForm(state)[fieldId.context]).toBe(
      MESSAGES.tooLong(600),
    );
  });
});
