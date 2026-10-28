export type MicDockState =
  | { readonly kind: "idle" }
  | { readonly kind: "requesting_permission" }
  | {
      readonly kind: "listening";
      readonly elapsedMs: number;
      readonly level?: number;
    }
  | { readonly kind: "processing" }
  | {
      readonly kind: "unavailable";
      readonly reason: "denied" | "no_device" | "insecure";
    }
  | { readonly kind: "service_error"; readonly message: string };

export type MicDockProps = {
  readonly state: MicDockState;
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly onSubmitText: () => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onRetry: () => void;
};
