import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  createFolder,
  listExperiments,
  listFolders,
  moveNotebook,
  type FolderSummary,
} from "@/api/experiments";
import { summary } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { NotebookGrid } from "./notebook-grid";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: vi.fn(),
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  moveNotebook: vi.fn(),
}));

const listMock = vi.mocked(listExperiments);
const foldersMock = vi.mocked(listFolders);
const createMock = vi.mocked(createFolder);

const quimica: FolderSummary = {
  id: 3,
  name: "Química orgánica",
  notebook_count: 1,
  created_at: "2026-10-30T12:00:00Z",
};

beforeEach(() => {
  listMock.mockReset();
  foldersMock.mockReset();
  createMock.mockReset();
  foldersMock.mockResolvedValue({ ok: true, data: [] });
});

describe("NotebookGrid (lab dashboard)", () => {
  it("shows the totals and a tile per notebook after the new tile", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [
        summary(4, { title: "Temperatura", trial_count: 4 }),
        summary(5, { title: "pH", trial_count: 1, status: "closed" }),
      ],
    });
    const { container } = renderWithQuery(<NotebookGrid />);

    const temp = await screen.findByRole("link", { name: /Temperatura/ });
    expect(temp).toHaveAttribute("href", "/cuadernos/4");
    expect(temp).toHaveTextContent("4 ensayos");
    expect(screen.getByRole("link", { name: /pH/ })).toHaveTextContent(
      "Cerrado",
    );

    const tiles = within(
      screen.getByRole("list", { name: "Cuadernos" }),
    ).getAllByRole("link");
    expect(tiles[0]).toHaveAccessibleName("Nuevo cuaderno");
    expect(tiles[0]).toHaveAttribute("href", "/cuadernos/nuevo");

    expect(screen.queryByText("Sin carpeta")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the folders and keeps their notebooks out of Sin carpeta", async () => {
    foldersMock.mockResolvedValue({ ok: true, data: [quimica] });
    listMock.mockResolvedValue({
      ok: true,
      data: [
        summary(4, { title: "Temperatura", folder_id: 3 }),
        summary(5, { title: "pH" }),
      ],
    });
    renderWithQuery(<NotebookGrid />);

    const folder = await screen.findByRole("link", {
      name: /Química orgánica/,
    });
    expect(folder).toHaveAttribute("href", "/carpetas/3");
    expect(folder).toHaveTextContent("1 cuaderno");
    expect(await screen.findByText("Sin carpeta")).toBeInTheDocument();
    const loose = screen.getByRole("list", { name: "Cuadernos" });
    expect(within(loose).getByRole("link", { name: /pH/ })).toBeInTheDocument();
    expect(
      within(loose).queryByRole("link", { name: /Temperatura/ }),
    ).not.toBeInTheDocument();
  });

  it("files a notebook by dropping it on a folder", async () => {
    foldersMock.mockResolvedValue({ ok: true, data: [quimica] });
    listMock.mockResolvedValue({
      ok: true,
      data: [summary(5, { title: "pH" })],
    });
    vi.mocked(moveNotebook).mockResolvedValue({
      ok: false,
      error: { kind: "unavailable" },
    });
    renderWithQuery(<NotebookGrid />);

    const tile = await screen.findByRole("link", { name: /pH/ });
    const folder = await screen.findByRole("link", { name: /Química/ });
    expect(tile).toHaveAttribute("draggable", "true");
    const store = new Map<string, string>();
    const dataTransfer = {
      types: ["application/x-labflow-notebook"],
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };
    fireEvent.dragStart(tile, { dataTransfer });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Suelta «pH» en una carpeta",
    );
    fireEvent.dragOver(folder, { dataTransfer });
    expect(folder).toHaveTextContent("Suelta para mover aquí");
    fireEvent.drop(folder, { dataTransfer });

    await waitFor(() =>
      expect(vi.mocked(moveNotebook)).toHaveBeenCalledWith(5, 3),
    );
  });

  it("creates a folder from the Nueva carpeta tile", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ ok: true, data: [] });
    createMock.mockResolvedValue({
      ok: true,
      data: { ...quimica, notebook_count: 0 },
    });
    renderWithQuery(<NotebookGrid />);

    await user.click(screen.getByRole("button", { name: "Nueva carpeta" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Crear carpeta" }),
    );
    expect(within(dialog).getByText("Escribe un nombre.")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Nombre"), "Química");
    await user.click(
      within(dialog).getByRole("button", { name: "Crear carpeta" }),
    );
    expect(createMock).toHaveBeenCalledWith("Química");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("says so when the list cannot load", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "unauthorized" } });
    renderWithQuery(<NotebookGrid />);
    expect(
      await screen.findByText("No pudimos cargar tus cuadernos."),
    ).toBeInTheDocument();
  });
});
