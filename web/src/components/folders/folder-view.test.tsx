import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  deleteFolder,
  listExperiments,
  listFolders,
  renameFolder,
} from "@/api/experiments";
import { summary } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { FolderView } from "./folder-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: vi.fn(),
  listFolders: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

const foldersMock = vi.mocked(listFolders);
const renameMock = vi.mocked(renameFolder);
const deleteMock = vi.mocked(deleteFolder);

const quimica = {
  id: 3,
  name: "Química orgánica",
  notebook_count: 1,
  created_at: "2026-10-30T12:00:00Z",
};

beforeEach(() => {
  push.mockReset();
  renameMock.mockReset();
  deleteMock.mockReset();
  foldersMock.mockResolvedValue({ ok: true, data: [quimica] });
  vi.mocked(listExperiments).mockResolvedValue({
    ok: true,
    data: [
      summary(4, { title: "Temperatura", folder_id: 3 }),
      summary(5, { title: "pH" }),
    ],
  });
});

describe("FolderView", () => {
  it("shows only its notebooks and creates new ones inside it", async () => {
    const { container } = renderWithQuery(<FolderView rawId="3" />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Química orgánica",
      }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Cuadernos" });
    expect(
      await within(list).findByRole("link", { name: /Temperatura/ }),
    ).toBeInTheDocument();
    expect(
      within(list).queryByRole("link", { name: /pH/ }),
    ).not.toBeInTheDocument();
    expect(
      within(list).getByRole("link", { name: "Nuevo cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/nuevo?carpeta=3");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renames the folder", async () => {
    const user = userEvent.setup();
    renameMock.mockResolvedValue({
      ok: true,
      data: { ...quimica, name: "Química I" },
    });
    renderWithQuery(<FolderView rawId="3" />);

    await user.click(await screen.findByRole("button", { name: "Renombrar" }));
    const name = within(await screen.findByRole("dialog")).getByLabelText(
      "Nombre",
    );
    expect(name).toHaveValue("Química orgánica");
    await user.clear(name);
    await user.type(name, "Química I");
    await user.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(renameMock).toHaveBeenCalledWith(3, "Química I");
  });

  it("deletes the folder after a confirm and goes home", async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValue({ ok: true, data: null });
    renderWithQuery(<FolderView rawId="3" />);

    await user.click(
      await screen.findByRole("button", { name: "Eliminar carpeta" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("quedan en «Sin carpeta»");
    await user.click(
      within(dialog).getByRole("button", { name: "Eliminar carpeta" }),
    );
    expect(deleteMock).toHaveBeenCalledWith(3);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("says so for a folder that does not exist", async () => {
    renderWithQuery(<FolderView rawId="99" />);
    expect(
      await screen.findByRole("heading", { name: "Esta carpeta no existe" }),
    ).toBeInTheDocument();
  });
});
