import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  createExperiment,
  createWithInstructions,
  readInstructions,
  type InstructionsProposal,
  type ReadResult,
} from "@/api/experiments";
import { sampleDetail } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { NotebookForm } from "./notebook-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  createExperiment: vi.fn(),
  createWithInstructions: vi.fn(),
  readInstructions: vi.fn(),
}));

const readMock = vi.mocked(readInstructions);
const createMock = vi.mocked(createExperiment);
const createWithMock = vi.mocked(createWithInstructions);

const HANDOUT =
  "Práctica 3. Mida la temperatura (entre 40 y 80 °C) y el rendimiento en %.";

const proposal = (
  overrides: Partial<InstructionsProposal> = {},
): ReadResult => ({
  ok: true,
  data: {
    kind: "proposal",
    title: "Práctica 3",
    goal: null,
    context: "Se mide el rendimiento.",
    variables: [
      {
        name: "Temperatura",
        unit: "°C",
        min_value: 40,
        max_value: 80,
        required: true,
        range_quote: "entre 40 y 80 °C",
        range_page: null,
      },
      {
        name: "Rendimiento",
        unit: "%",
        min_value: null,
        max_value: null,
        required: true,
        range_quote: null,
        range_page: null,
      },
    ],
    found_count: 2,
    page_count: 1,
    read_from_page: null,
    read_to_page: null,
    ...overrides,
  },
});

const setup = () => {
  const user = userEvent.setup();
  return { user, ...renderWithQuery(<NotebookForm />) };
};

const leer = () => screen.getByRole("button", { name: "Leer instrucciones" });

const pasteHandout = async (
  user: ReturnType<typeof userEvent.setup>,
  text = HANDOUT,
) => {
  await user.click(screen.getByRole("radio", { name: "Pegar texto" }));
  await user.click(screen.getByLabelText("Instrucciones"));
  await user.paste(text);
};

beforeEach(() => {
  push.mockReset();
  readMock.mockReset();
  createMock.mockReset();
  createWithMock.mockReset();
});

describe("the panel (AC-19, AC-20, AC-35)", () => {
  it("opens on Subir PDF with the form hidden", async () => {
    const { container } = setup();
    expect(screen.getByRole("radio", { name: "Subir PDF" })).toBeChecked();
    expect(screen.getByLabelText("Archivo PDF")).toHaveAttribute(
      "accept",
      "application/pdf,.pdf",
    );
    expect(screen.queryByLabelText("Título")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Llenar a mano hides the panel; the link opens it again", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Llenar a mano" }));
    expect(screen.getByLabelText("Título")).toHaveFocus();
    expect(screen.queryByLabelText("Archivo PDF")).toBeNull();
    await user.click(leer());
    expect(screen.getByLabelText("Archivo PDF")).toBeInTheDocument();
  });

  it("checks the input before sending anything", async () => {
    const { user } = setup();
    await user.click(leer());
    expect(screen.getByText("Elige un archivo PDF.")).toBeInTheDocument();
    await pasteHandout(user, "muy corto");
    await user.click(leer());
    expect(
      screen.getByText("Pega un poco más de las instrucciones."),
    ).toBeInTheDocument();
    expect(readMock).not.toHaveBeenCalled();
  });
});

describe("a read (AC-21, AC-23, AC-24, AC-26)", () => {
  it("fills the form from the proposal", async () => {
    readMock.mockResolvedValue(proposal());
    const { user, container } = setup();
    await pasteHandout(user);
    await user.click(leer());

    expect(await screen.findByLabelText("Título")).toHaveValue("Práctica 3");
    expect(screen.getByLabelText("Título")).toHaveFocus();
    expect(readMock).toHaveBeenCalledWith(
      { kind: "text", text: HANDOUT },
      null,
      expect.any(AbortSignal),
    );
    expect(
      screen.getByText(
        "Propuesto desde tus instrucciones. Revisa antes de crear.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Texto pegado · ${HANDOUT.length} caracteres`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Contexto para la captura/)).toHaveValue(
      "Se mide el rendimiento.",
    );
    expect(screen.getByLabelText("Mín, variable 1")).toHaveValue("40");
    const quote = screen.getByText(/«entre 40 y 80 °C»/);
    expect(screen.getByLabelText("Máx, variable 1")).toHaveAttribute(
      "aria-describedby",
      quote.id,
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Máx, variable 1"), "5");
    expect(screen.queryByText(/«entre 40 y 80 °C»/)).toBeNull();
  });

  it("says how many it found when it kept 12", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      name: `V${i}`,
      unit: null,
      min_value: null,
      max_value: null,
      required: true,
      range_quote: null,
      range_page: null,
    }));
    readMock.mockResolvedValue(proposal({ variables: many, found_count: 15 }));
    const { user } = setup();
    await pasteHandout(user);
    await user.click(leer());
    expect(
      await screen.findByText(
        "Encontramos 15 variables; dejamos 12. Quita o cambia las que quieras.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the reading state and can cancel it", async () => {
    readMock.mockImplementation(
      (_input, _range, signal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () =>
            resolve({ ok: false, error: { kind: "aborted" } }),
          ),
        ),
    );
    const { user } = setup();
    await pasteHandout(user);
    await user.click(leer());

    const busy = screen.getByRole("button", { name: "Leyendo instrucciones…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(/Puede tardar hasta un minuto/),
    ).toBeInTheDocument();
    await user.click(busy);
    expect(readMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancelar lectura" }));
    expect(await screen.findByLabelText("Instrucciones")).toHaveValue(HANDOUT);
    expect(leer()).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByLabelText("Título")).toBeNull();
  });

  it("asks before replacing what you typed", async () => {
    readMock.mockResolvedValue(proposal());
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Llenar a mano" }));
    await user.type(screen.getByLabelText("Título"), "Mío");
    await user.click(leer());
    await pasteHandout(user);
    await user.click(leer());

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "¿Reemplazar lo que escribiste con lo que leímos?",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(readMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Título")).toHaveValue("Mío");

    await user.click(leer());
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Reemplazar",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Título")).toHaveValue("Práctica 3"),
    );
  });
});

describe("a failed read (AC-28)", () => {
  it("opens the form with the instructions attached and a Reintentar", async () => {
    readMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "unavailable" },
    });
    createWithMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { user } = setup();
    await pasteHandout(user);
    await user.click(leer());

    expect(
      await screen.findByText(
        "No pudimos leer las instrucciones. Llena el formulario o intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(
      screen.getByText(`Texto pegado · ${HANDOUT.length} caracteres`),
    ).toBeInTheDocument();

    readMock.mockResolvedValueOnce(proposal());
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Título")).toHaveValue("Práctica 3"),
    );
    expect(readMock).toHaveBeenCalledTimes(2);
  });

  it("shows a 409 or 422 in the panel and attaches nothing", async () => {
    readMock.mockResolvedValue({
      ok: false,
      error: {
        kind: "rejected",
        message: "Ya estamos leyendo unas instrucciones. Espera a que termine.",
      },
    });
    const { user } = setup();
    await pasteHandout(user);
    await user.click(leer());
    expect(
      await screen.findByText(
        "Ya estamos leyendo unas instrucciones. Espera a que termine.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).toBeNull();
  });
});

describe("a long PDF (AC-22)", () => {
  it("asks for pages, checks them, and reads the range", async () => {
    readMock
      .mockResolvedValueOnce({
        ok: true,
        data: {
          kind: "needs_pages",
          page_count: 70,
          char_count: 180_000,
          max_chars: 100_000,
        },
      })
      .mockResolvedValueOnce(
        proposal({ page_count: 70, read_from_page: 12, read_to_page: 18 }),
      );
    const { user, container } = setup();
    const file = new File(["%PDF-"], "guia.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Archivo PDF"), file);
    await user.click(leer());

    expect(
      await screen.findByText(/Este PDF tiene 70 páginas/),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.type(screen.getByLabelText("Desde"), "18");
    await user.type(screen.getByLabelText("Hasta"), "12");
    await user.click(leer());
    expect(screen.getByText("Elige páginas entre 1 y 70.")).toBeInTheDocument();
    expect(readMock).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByLabelText("Desde"));
    await user.type(screen.getByLabelText("Desde"), "12");
    await user.clear(screen.getByLabelText("Hasta"));
    await user.type(screen.getByLabelText("Hasta"), "18");
    await user.click(leer());
    expect(readMock).toHaveBeenLastCalledWith(
      { kind: "pdf", file },
      { from: 12, to: 18 },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("guia.pdf · 70 págs")).toBeInTheDocument();
  });
});

describe("create with instructions (AC-29)", () => {
  const readAndFill = async (user: ReturnType<typeof userEvent.setup>) => {
    readMock.mockResolvedValue(proposal());
    await pasteHandout(user);
    await user.click(leer());
    await screen.findByDisplayValue("Práctica 3");
  };

  it("sends the instructions with the notebook", async () => {
    createWithMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { user } = setup();
    await readAndFill(user);
    await user.click(screen.getByRole("button", { name: "Crear cuaderno" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuadernos/7"));
    expect(createMock).not.toHaveBeenCalled();
    expect(createWithMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Práctica 3",
        context: "Se mide el rendimiento.",
      }),
      { kind: "text", text: HANDOUT },
    );
  });

  it("shows an instructions error next to the chip", async () => {
    createWithMock.mockResolvedValue({
      ok: false,
      error: {
        kind: "invalid",
        code: "no_text_in_pdf",
        message: "Este PDF no tiene texto. Pega las instrucciones.",
      },
    });
    const { user } = setup();
    await readAndFill(user);
    await user.click(screen.getByRole("button", { name: "Crear cuaderno" }));

    const message = await screen.findByText(
      "Este PDF no tiene texto. Pega las instrucciones.",
    );
    expect(screen.getByRole("button", { name: "Quitar" })).toHaveAttribute(
      "aria-describedby",
      message.id,
    );
    expect(screen.queryByText("No se creó el cuaderno")).toBeNull();
  });

  it("Quitar detaches the instructions and keeps the values", async () => {
    createMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { user } = setup();
    await readAndFill(user);
    await user.click(screen.getByRole("button", { name: "Quitar" }));

    expect(screen.queryByText(/Texto pegado ·/)).toBeNull();
    expect(screen.getByLabelText("Título")).toHaveValue("Práctica 3");
    await user.click(screen.getByRole("radio", { name: "Pegar texto" }));
    expect(screen.getByLabelText("Instrucciones")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Crear cuaderno" }));
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createWithMock).not.toHaveBeenCalled();
  });
});

describe("accessibility of the panel states (AC-35)", () => {
  it("has no violations while reading", async () => {
    readMock.mockImplementation(() => new Promise(() => undefined));
    const { user, container } = setup();
    await pasteHandout(user);
    await user.click(leer());
    expect(
      screen.getByRole("button", { name: "Leyendo instrucciones…" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with a read error, announced politely", async () => {
    readMock.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    const { user, container } = setup();
    await pasteHandout(user);
    await user.click(leer());
    const error = await screen.findByText(
      "No pudimos leer las instrucciones. Llena el formulario o intenta de nuevo.",
    );
    expect(error.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    expect(await axe(container)).toHaveNoViolations();
  });
});
