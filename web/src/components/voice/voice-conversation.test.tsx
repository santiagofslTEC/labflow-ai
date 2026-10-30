import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { endVoiceSession, startVoiceSession } from "@/api/voice";
import { renderWithQuery } from "@/test/query";

import { VoiceConversation } from "./voice-conversation";

type Options = {
  readonly onMessage?: (m: { role: string; message: string }) => void;
  readonly onDisconnect?: (d: { reason: string }) => void;
};

const conversation = {
  status: "disconnected" as string,
  isSpeaking: false,
  startSession: vi.fn(),
  endSession: vi.fn(),
};
let options: Options = {};

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useConversation: (given: Options) => {
    options = given;
    return conversation;
  },
}));

vi.mock("@/api/voice", () => ({
  startVoiceSession: vi.fn(),
  endVoiceSession: vi.fn(),
}));

const startMock = vi.mocked(startVoiceSession);
const endMock = vi.mocked(endVoiceSession);
const session = {
  sid: "sid-1",
  signed_url: "wss://example/signed",
  session_token: "tok",
  expires_at: "2026-10-30T12:00:00Z",
};

beforeEach(() => {
  conversation.status = "disconnected";
  conversation.isSpeaking = false;
  conversation.startSession.mockImplementation(() => {
    conversation.status = "connected";
  });
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  });
  startMock.mockResolvedValue({ ok: true, data: session });
});

afterEach(() => {
  vi.clearAllMocks();
});

const renderVoice = () =>
  renderWithQuery(
    <>
      <input id="capture-text" aria-label="Medición escrita" />
      <VoiceConversation
        experimentId={3}
        variant="inline"
        fallbackInputId="capture-text"
      />
    </>,
  );

describe("VoiceConversation", () => {
  it("starts a session with the signed URL and our token (AC-1)", async () => {
    renderVoice();
    await userEvent.click(screen.getByRole("button", { name: /hablar/i }));
    await waitFor(() =>
      expect(conversation.startSession).toHaveBeenCalledWith({
        signedUrl: "wss://example/signed",
        customLlmExtraBody: { session_token: "tok" },
      }),
    );
    expect(startMock).toHaveBeenCalledWith(3);
    expect(await screen.findByText("Escuchando…")).toBeInTheDocument();
  });

  it("shows what you said and what LabFlow answered, and refetches (AC-2, AC-20)", async () => {
    const { client } = renderVoice();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: /hablar/i }));
    await waitFor(() => expect(conversation.startSession).toHaveBeenCalled());
    act(() =>
      options.onMessage?.({ role: "user", message: "Ensayo 7, 65 grados" }),
    );
    act(() =>
      options.onMessage?.({
        role: "agent",
        message: "Guardado ensayo 7: 65 °C.",
      }),
    );
    expect(
      screen.getByText("Ensayo 7, 65 grados", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Guardado ensayo 7: 65 °C.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["proposal", 3] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["experiments"] });
  });

  it("stops the session and ends it on our side (AC-1)", async () => {
    renderVoice();
    await userEvent.click(screen.getByRole("button", { name: /hablar/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: /terminar/i }),
    );
    expect(conversation.endSession).toHaveBeenCalled();
    expect(endMock).toHaveBeenCalledWith("sid-1");
    expect(screen.getByRole("button", { name: /hablar/i })).toBeInTheDocument();
  });

  it("falls back to typing when the session cannot start (AC-11)", async () => {
    startMock.mockResolvedValue({
      ok: false,
      message: "La voz no está disponible. Escribe la medición.",
    });
    renderVoice();
    await userEvent.click(screen.getByRole("button", { name: /hablar/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No te escuché bien");
    expect(alert).toHaveTextContent("La voz no está disponible");
    expect(screen.getByLabelText("Medición escrita")).toHaveFocus();
    expect(conversation.startSession).not.toHaveBeenCalled();
  });

  it("explains a blocked mic (AC-11)", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException("no", "NotAllowedError"),
    );
    renderVoice();
    await userEvent.click(screen.getByRole("button", { name: /hablar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Micrófono bloqueado",
    );
    expect(startMock).not.toHaveBeenCalled();
  });

  it("ends when the tab hides (AC-10)", async () => {
    renderVoice();
    await userEvent.click(screen.getByRole("button", { name: /hablar/i }));
    await screen.findByRole("button", { name: /terminar/i });
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(conversation.endSession).toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  it("has no axe violations when idle", async () => {
    const { container } = renderVoice();
    expect(await axe(container)).toHaveNoViolations();
  });
});
