# 0003. Design system and UI foundation: warm paper with instrument readouts

**Date**: 2026-10-27
**Status**: Accepted

## Summary

LabFlow gets one visual language that every screen builds on. It has a warm near white canvas inside a sidebar app shell (a quiet document app, like Notion or Linear), near black ink, Instrument Serif for titles, Geist for the interface, and big Geist Mono numbers, like a lab instrument's display. Unsaved values look clearly different from saved ones (a dashed amber edge, a tint, and a "Sin guardar" label), because trusting what gets saved is the whole product. This feature builds the tokens (named colors, sizes, and timings), `web/design.md`, the base components (shadcn/ui on Radix, restyled), the proposal card and the mic dock in every state with sample data, expressive Motion animations, and a `/dev/ui` preview page. Features 5 to 11 then reuse these pieces instead of inventing their own look. Amended 2026-10-28 after a design review: the sidebar shell, quieter colors, ink and outline buttons with no red fills, soft dot badges, and the `PushToTalk` mic (AC-17, AC-19, AC-20); the voice first main page itself is spec [0004](../0004-push-to-talk-main-page/index.md).

## Requirements

**User stories**:
- As a student at the bench, I want unsaved values to look unmistakably different from saved ones, so I never mistake a guess for a record.
- As a student wearing gloves, I want big buttons and a mic that is always in the same place, so I can act without precise taps.
- As a presenter on Friday, I want the numbers on the card to be large and readable when projected, so the audience follows the demo.
- As the team, we want every base piece and state on one preview page, so features 5 to 11 just reuse them and `/check verify` can check them.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: `web/src/app/globals.css` defines every color, font, radius, shadow, and chart color as a token (a named CSS variable) exposed to Tailwind v4 through `@theme`. Light values live on `:root`, warm charcoal values under `@media (prefers-color-scheme: dark)`. No file under `web/src/components/` or `web/src/app/` (except `globals.css` and `manifest.ts`) contains a raw hex, `rgb()`/`hsl()`/`oklch()` color, or Tailwind palette color class (such as `bg-zinc-100`); components use only token classes. A Vitest test scans those folders and fails on any match. `:root` sets `color-scheme: light dark`.
- **AC-2**: `web/design.md` documents the direction and its Mobbin references, the type scale, every color token with its meaning (including unsaved vs saved), spacing, radius, shadow, motion tokens, touch target sizes, the layout rules, the proposal card anatomy and states, and the mic dock states.
- **AC-3**: Fonts load through `next/font/google`: Instrument Serif (`weight: "400"` only; never bolded) for display text only (page and experiment titles, the home greeting, `BrandMark`, `EmptyState` titles), Geist for interface text, and Geist Mono with tabular figures (digits of equal width) for every measured value and unit, in the card and in the table.
- **AC-4**: In both themes, every text and background pair listed in *Key invariants* reaches a contrast ratio of at least 4.5:1, and every UI boundary and focus ring at least 3:1. A unit test reads `globals.css` (light values from the `@theme static` block, dark values from the `prefers-color-scheme: dark` `:root` block; hex only; WCAG relative luminance in sRGB) and fails if any listed pair falls below its threshold or any token is missing from either theme. (axe cannot check contrast in jsdom, so this test is the only automated contrast check.)
- **AC-5**: Every interactive piece (Button, Input, Textarea, Select, Tabs, Dialog, the card actions, the mic dock) works with the keyboard alone and shows a visible focus ring on keyboard focus (2px `--color-focus` outline, 2px offset). Dialog traps focus and returns it to its trigger on close.
- **AC-6**: `vitest-axe` reports zero violations for every component state rendered in the tests.
- **AC-7**: Confirmar, Editar, Descartar, and the mic pill are at least 48px tall; every other control is at least 40px tall.
- **AC-8**: `ProposalCard` renders each of these states from props alone, with no network: `proposed`, `editing` (one value in an inline field), `saving`, `saved`, `needs_clarification` (missing values as empty slots plus the question), `correction` (old and new value side by side plus "¿Reemplazo el ensayo N?"), and `save_error` (message plus Reintentar). Any value can also show a range warning row. A value whose variable has no unit (pH) shows the number alone.
- **AC-9**: In every unsaved state (`proposed`, `editing`, `saving`, `needs_clarification`, `correction`, `save_error`) the card shows the "Sin guardar" badge, a dashed `--color-unsaved-border` edge, and the `--color-unsaved` tint. In `saved` it shows a solid border, the teal check, and "Guardado". The two can be told apart in grayscale.
- **AC-10**: Focus moves to the card's primary action (Confirmar or Reemplazar, or the first empty slot in `needs_clarification`) only when the card mounts or its state kind changes from anything other than `editing`, and only if no text field (`input`, `textarea`, `[contenteditable]`) currently has focus. Leaving `editing` (Guardar, Enter, Cancelar, or Esc) returns focus to that value's Editar. Entering `save_error` focuses Reintentar. After `onSettled` the card is gone and the parent moves focus to the dock's text field. Enter on the focused primary action triggers it. There are no global shortcuts, and typing in the dock's text field never triggers a card action.
- **AC-11**: The card holds one polite `aria-live` region that is rendered empty on mount and then updated with the announcement for each state from the copy table (for example "Propuesta del ensayo 3, sin guardar", "Ensayo 3 guardado"). The `save_error` message is rendered in a `role="alert"` element instead.
- **AC-12**: `MicDock` renders each of these states from props: `idle` (black pill "Dictar"), `requesting_permission` ("Permite el micrófono"), `listening` (5 level bars, each a fixed height envelope `[0.5, 0.8, 1, 0.8, 0.5]` times `level` (0 to 1, clamped), with a 0.15 floor; a gentle CSS pulse when `level` is absent; an `mm:ss` timer from `elapsedMs`, clamped to `00:00`..`99:59`; and Detener), `processing` ("Transcribiendo…"), `unavailable` (muted pill with the reason string for `denied`, `no_device`, or `insecure`; entering it moves focus to the text field), and `service_error` (headline "No te escuché bien" plus `message` as a second line, plus Reintentar; in a `role="alert"` element). The dock's text field is a single line Input that stays usable in every state; Enter or the Enviar button submits; Enviar is disabled when `text` is blank. The dock holds its own polite live region, rendered empty on mount, announcing each state from the copy table. The dock is `position: fixed` to the bottom with `env(safe-area-inset-bottom)` padding, page content reserves its height as bottom padding, and layouts use `dvh` so the phone keyboard does not hide it.
- **AC-13**: `formatQuantity(value, unit)` in `web/src/lib/format.ts` formats with `Intl.NumberFormat("es")`, keeps up to 3 decimals without padding zeros, and puts a space before the unit: `73.5, "%"` → `73,5 %`, `50, "°C"` → `50 °C`, `15, "min"` → `15 min`, `7.2, null` → `7,2`. The card, the table, and `/dev/ui` all use it. `parseDecimal(text)` returns `{ ok: true; value: number } | { ok: false }`: it trims the text, accepts only `^-?\d+([.,]\d+)?$` (so `73,5` and `73.5` give 73.5, and `1.234` is 1.234, a decimal), and rejects empty text, two separators (`1.234,5`), exponents, and anything else. The edit field opens with the value formatted with a comma and no unit (`73,5`).
- **AC-14**: `WorkspaceLayout` renders each slot (`conversation`, `card`, `table`, `chart`, `dock`) exactly once and switches layout with CSS only. At 1024px and wider: two columns (left: conversation with the card below it, just above the dock; right: table above chart), tab list hidden. Below 1024px: one column with a tab list (Conversación · Tabla · Gráfico) under the header; Radix tab panels use `forceMount` and are hidden with CSS, so nothing mounts twice; the card lives in the Conversación panel, and when `card` is present while another tab is active, the Conversación tab shows a dot with the accessible label "Propuesta pendiente". The dock stays pinned to the bottom on every size. From 320px to 1920px wide no page scrolls sideways (checked by hand; jsdom cannot measure layout).
- **AC-15**: With motion allowed, the card rises and fades in on a spring, its state changes animate, and in `saved` it shows the check, then collapses and calls `onSettled` once when the exit finishes (about 1.2 s; under reduced motion right after a fade of 150ms or less). The dock morphs between states. On `/dev/ui`, confirming the sample card makes each value fly into its cell of a sample table row: the row mounts when the card reaches `saved`, each value and its cell share the `layoutId` `${layoutIdPrefix}-${variableId}` inside one `LayoutGroup`, the number moves with `layout="position"` and crossfades between the 32px and 15px sizes (no scale stretch), and the card collapses only after the flight. With `prefers-reduced-motion: reduce`, every one of these becomes an opacity fade of 150ms or less, or no animation at all, and animated components set `data-motion="reduced"` so tests can check it. The movement itself is checked by hand on `/dev/ui`.
- **AC-16**: `/dev/ui` shows every base component and every card and dock state, using the demo experiment's sample data (Temperatura °C, Duración min, Rendimiento %, trials 1 to 5), in whichever theme the system uses. It returns 404 when `VERCEL_ENV` is `production`, and renders locally and on Vercel preview deploys. The rule lives in a pure `isDevUiEnabled(vercelEnv: string | undefined): boolean` in `web/src/lib/dev-ui.ts`.
- **AC-17**: The root layout applies the fonts, tokens, and `AppShell`. At 1024px and wider `AppShell` shows a 240px `Sidebar` on the `canvas` (the `BrandMark` wordmark, Inicio, the Experimentos list or its empty line, and the dev pages when `isDevUiEnabled`) beside a `surface` content sheet inset from the window; below 1024px a 56px sticky top bar holds a menu button that opens the same sidebar as a sheet (`MobileNav`) and the wordmark. The content area pads its bottom by `--dock-height`. Until spec 0004 replaces it, the home page shows the serif greeting from the copy table and the API status as a `Badge`, keeping its three outcomes: connecting (`neutral`), connected with the env name (`saved`), not responding (`danger`).
- **AC-18**: `web/src/app/manifest.ts` sets `name: "LabFlow AI"`, `short_name: "LabFlow"`, `lang: "es"`, `start_url: "/"`, `display: "standalone"`, `background_color` from the light canvas and `theme_color` from the light ink (a test checks both equal the `globals.css` tokens), and points to `/icons/icon-192.png`, `/icons/icon-512.png`, and `/icons/icon-maskable-512.png` (purposes `any`, `any`, `maskable`; files you provide). `BrandMark` renders the text wordmark "LabFlow" in Instrument Serif until `web/public/brand/logo.svg` exists, then switching to the logo is a one line change.
- **AC-19**: `PushToTalk` (`web/src/components/push-to-talk/`) is a pure presentational big mic (96px round, ink fill) that takes `MicDockState` plus `onStart`, `onStop`, `onCancel`, `onKeyboard`, and `onInterrupt(elapsedMs)`, which it calls instead of a release when a press is cancelled (`pointercancel`), so the parent can apply its own rule (spec 0004, AC-9). A press held 350 ms or more stops on release; a shorter press is a tap that keeps listening until the next press (`releaseOutcome` in `press.ts`, unit tested). Space acts as a hold; Enter and assistive tech clicks (a click with `detail` 0) toggle. While listening it shows level bars, the `mm:ss` timer, a visible Cancelar, and the hint "Suelta para enviar" or "Toca otra vez para terminar"; it ignores presses while `requesting_permission`, `processing`, or `unavailable` (`aria-disabled`), shows the unavailable reason, and reads `service_error` in a `role="alert"`. It has a polite live region like `MicDock`, suppresses the long press callout, and vitest-axe finds no violations in idle, listening, processing, and unavailable.
- **AC-20**: Buttons follow four variants: `primary` (ink fill), `secondary` (surface with a hairline `line` border), `ghost` (muted text), and `danger`, which looks like `secondary` with only its icon in `danger`; no button has a red or bright fill. Badges are soft sentence case pills with a status dot (hidden when an icon leads), with no outline. Section labels and table headers are sentence case, never letter spaced uppercase. Error rows in the card and dock use a `sunken` fill with a small `danger` icon, the headline in ink, and the message muted.

## Decision

**Chosen option**: Option 1: Warm paper with instrument readouts, built on shadcn/ui and Radix, animated with Motion.

LabFlow uses a warm near white and near black palette in a sidebar app shell, with one teal "saved" accent and an amber "unsaved" signal, Instrument Serif titles over Geist and Geist Mono, restyled shadcn/ui components, and Motion for expressive but reduced motion safe animation.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`). Where the shadcn skill's defaults differ from this spec (Base UI, a new app scaffold, an uppercase `DESIGN.md`), this spec wins: Radix, the existing `web/` app, and `web/design.md`.

**Calls made in this spec** (pick, then the runner up; reasoning in [rationale.md](rationale.md)):
- Color values: the token table below, each pair checked by a test. Runner up: shadcn's neutral palette, which reads generic and cold.
- Contrast check: a Vitest test that parses `globals.css`, so tokens have one source. Runner up: a TypeScript token file mirrored into CSS, which duplicates every value.
- Icons: `lucide-react` (shadcn's default, tree shaken). Runner up: Phosphor, which has more weights but is a second icon style to match.
- Toast: `sonner` through shadcn's `sonner` component. Runner up: Radix Toast, which needs more wiring for the same result.
- Mic timer: an `elapsedMs` prop (the component stays pure; feature 8 owns the clock). Runner up: an internal interval, which hides time in component state.
- Card to table flight: Motion `layoutId` inside a `LayoutGroup`. Runner up: the View Transitions API, which needs router coordination and has uneven Safari support.
- `/dev/ui` gate: `process.env.VERCEL_ENV === "production"` → `notFound()`. Runner up: `NODE_ENV`, which is also `production` on preview deploys and would hide the page there.
- Breakpoint: 1024px (Tailwind `lg`). Runner up: 1280px, which would push most laptops at 1100 to 1280px into the phone layout.
- Chart colors: four chart tokens now; the Plotly template that reads them belongs to feature 9. Runner up: deciding the Plotly theme here, before the chart exists.
- Decimals: up to 3 digits as stored, no padding. Runner up: a fixed digit count per variable, which needs a precision field the data model does not have.

## Feature design

**Data model sketch**: none. This feature stores nothing. The card's props mirror spec 0002's `proposal` and `proposal_value` (see *Value sourcing*), so feature 6 maps data straight in.

**Design tokens** (values amended 2026-10-28; light on `:root`, dark under `prefers-color-scheme: dark`; names become Tailwind classes such as `bg-canvas`, `text-ink-muted`, `border-unsaved-border`):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-canvas` | `#FBFAF8` | `#191817` | sidebar and window behind the content sheet (warm near white / soft charcoal) |
| `--color-surface` | `#FFFFFF` | `#201F1D` | content sheet, cards, composer, dialogs |
| `--color-sunken` | `#F3F1EC` | `#292725` | hover, view chips, badges, tabs track, error rows |
| `--color-ink` | `#1F1B16` | `#F1EEE9` | text, primary button fill |
| `--color-ink-muted` | `#6B6358` | `#A39D94` | secondary text, labels |
| `--color-on-ink` | `#FAF8F4` | `#1F1B16` | text on the primary button |
| `--color-line` | `#EBE7E0` | `#33302C` | decorative dividers (not a control boundary) |
| `--color-control` | `#8C8377` | `#7D7569` | input and select borders (≥3:1) |
| `--color-saved` | `#0E6B6B` | `#4FB3A9` | saved check, saved accents |
| `--color-unsaved` | `#FDF6E7` | `#2B2418` | unsaved card tint |
| `--color-unsaved-border` | `#B7791F` | `#E0A84A` | dashed unsaved edge, unsaved badge dot |
| `--color-warning-ink` | `#8A5A00` | `#F0C27A` | range warning text |
| `--color-danger` | `#B42318` | `#F2867A` | error and destructive icons, badge dots (never a button fill) |
| `--color-focus` | `#0E6B6B` | `#4FB3A9` | focus ring |
| `--color-chart-1` to `-4` | `#0E6B6B`, `#B7791F`, `#5B5BD6`, `#C2410C` | `#4FB3A9`, `#E0A84A`, `#9B9BF0`, `#F4875A` | Plotly series (feature 9) |

Token plumbing in `globals.css` (Tailwind v4): the `--color-*`, `--radius-*`, and `--shadow-*` tokens with their light values go in one `@theme static { … }` block (`static` so every token is emitted even before a class uses it; the chart tokens must survive for feature 9). Dark mode overrides the same names in `@media (prefers-color-scheme: dark) { :root { … } }`, which works because the utilities read `var(--color-…)`. Only the font indirection uses `@theme inline { --font-serif: var(--font-instrument-serif); --font-sans: var(--font-geist-sans); --font-mono: var(--font-geist-mono); }`. shadcn's own semantic variables (`--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--popover`, and so on) are kept and aliased once to the tokens (`--background: var(--color-canvas)`, `--primary: var(--color-ink)`, `--ring: var(--color-focus)`, `--input: var(--color-control)`, `--destructive: var(--color-danger)`, …) instead of rewriting every class; shadcn's generated `.dark` class block is deleted (no toggle). Remove the scaffold's `--background`/`--foreground` and the Arial body rule.

Badge variants (text / background / border): `neutral` `ink-muted` / `sunken` / none; `saved` `saved` / `surface` / `saved`; `unsaved` `warning-ink` / `unsaved` / `unsaved-border`; `warning` same as `unsaved` with a warning icon; `danger` `danger` / `surface` / `danger`. Placeholder text uses `ink-muted`. Disabled controls use 50% opacity (exempt from contrast under WCAG).

Type scale (Tailwind `@theme` font and size tokens): display `Instrument Serif` 40/44 at `lg`, 32/36 below; title serif 28/32; body Geist 16/24; small 14/20; label Geist 12/16 or 14/20, sentence case (no uppercase labels); readout Geist Mono 32/36 at `lg`, 28/32 below, `tabular-nums`; table numbers Geist Mono 15/20 `tabular-nums`, right aligned. Spacing: Tailwind's 4px scale. Radius: `--radius-card` 14px, `--radius-control` 10px, pills full. Shadow: `--shadow-control` a 1px lift for buttons, inputs, and the sheet; `--shadow-card` `0 1px 2px rgb(31 27 22 / 0.04), 0 4px 12px rgb(31 27 22 / 0.05)` (dark: `0 1px 2px rgb(0 0 0 / 0.3), 0 4px 12px rgb(0 0 0 / 0.25)`); `--shadow-dock` a stronger version for the floating composer and the push to talk mic. Targets: `h-12` (48px) for card actions and the mic pill, `h-10` (40px) minimum elsewhere.

Motion tokens (`web/src/lib/motion.ts`, constants only): `spring.snappy` `{ type: "spring", stiffness: 420, damping: 34 }` for state changes and the dock morph; `spring.gentle` `{ type: "spring", stiffness: 220, damping: 26 }` for the card entering and the flight; `duration.fade` 0.15 s. The root wraps the app in `<MotionConfig reducedMotion="user">`, and every animated component also checks `useReducedMotion()` so movement becomes a fade.

**Component inventory** (named exports; client components only where they hold interaction or animation):

| Component | Path | Built from | Notes |
|---|---|---|---|
| Button | `web/src/components/ui/button.tsx` | shadcn `button` | variants `primary` (ink), `secondary` (surface + control border), `ghost`, `danger`; sizes `md` 40px, `lg` 48px, `icon` |
| Input, Textarea, Label, Field | `web/src/components/ui/` | shadcn `input`, `textarea`, `label`, `field` | forms use `FieldGroup` + `Field` + `FieldLabel` + `FieldDescription`; errors set `data-invalid` on `Field` and `aria-invalid` on the control (shadcn skill rule) |
| Select | `web/src/components/ui/select.tsx` | shadcn `select` (Radix) | units, chart axes |
| Card, Badge | `web/src/components/ui/` | shadcn `card`, `badge` | Badge variants `neutral`, `saved`, `unsaved`, `warning`, `danger` |
| Table | `web/src/components/ui/table.tsx` | shadcn `table` | numeric cells use `font-mono tabular-nums text-right` |
| Tabs | `web/src/components/ui/tabs.tsx` | shadcn `tabs` (Radix) | phone workspace tabs |
| Dialog | `web/src/components/ui/dialog.tsx` | shadcn `dialog` (Radix) | focus trap and return |
| Toaster | `web/src/components/ui/sonner.tsx` | shadcn `sonner` | mounted once in the root layout |
| Skeleton, EmptyState | `web/src/components/ui/` | shadcn `skeleton`; EmptyState hand written | EmptyState: icon, serif title, one line, optional action |
| AppShell, Sidebar, MobileNav, PageHeader, PanelHeading, BrandMark | `web/src/components/app-shell/` | hand written + Radix Dialog | sidebar and content sheet, 56px phone top bar, content `max-w-6xl`, dock slot (AC-17) |
| PushToTalk | `web/src/components/push-to-talk/` | Button, `mic-dock/meter` | pure presentational big mic, press rule in `press.ts` (AC-19) |
| WorkspaceLayout | `web/src/components/app-shell/workspace-layout.tsx` | hand written + Tabs | props `conversation`, `card?`, `table`, `chart`, `dock` as React nodes; each rendered once (AC-14) |
| ProposalCard | `web/src/components/proposal-card/` | Card, Button, Badge, Input | pure presentational, contract below |
| MicDock | `web/src/components/mic-dock/` | Button, Input | pure presentational, contract below; single line text field |
| `formatQuantity` | `web/src/lib/format.ts` | plain function | AC-13 |
| `cn` | `web/src/lib/utils.ts` | shadcn `clsx` + `tailwind-merge` | |

**State transitions** (driven by props; the parent owns state, the components own none beyond the inline edit draft):

```
ProposalCard.state.kind:
  proposed ──Editar──▶ editing ──Enter / Guardar──▶ proposed (value changed by parent)
                         └──Esc──▶ proposed
  proposed | correction ──Confirmar / Reemplazar──▶ saving ──▶ saved ──(check, flight, collapse ~1.2 s, onSettled)──▶ gone
                                         └──▶ save_error ──Reintentar──▶ saving
  needs_clarification ──(parent fills values)──▶ proposed
  any unsaved ──Descartar──▶ gone (parent decides)

MicDock.state.kind:
  idle ──tap──▶ requesting_permission ──granted──▶ listening ──Detener──▶ processing ──▶ idle
                     └──denied / no device──▶ unavailable
  listening | processing ──service failure──▶ service_error ──Reintentar──▶ requesting_permission
```

**Component contracts** (`readonly` props; unions for state, matching the AGENTS.md result union style):

```ts
type ProposalValue = {
  readonly variableId: number;
  readonly name: string;            // variable.name
  readonly unit: string | null;     // proposal_value.unit (null for unitless)
  readonly value: number | null;    // null = missing, shown as an empty slot
  readonly previous?: number | null;// correction only: saved measurement.value
  readonly warning?: string | null; // feature 11 fills it
};
type ProposalCardState =
  | { readonly kind: "proposed" }
  | { readonly kind: "editing"; readonly variableId: number }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "needs_clarification"; readonly question: string }
  | { readonly kind: "correction" }
  | { readonly kind: "save_error"; readonly message: string };
type ProposalCardProps = {
  readonly trialNumber: number | null; // in correction: the trial being replaced
  readonly values: readonly ProposalValue[]; // already in variable.position order
  readonly layoutIdPrefix?: string;   // flight: value and table cell share `${prefix}-${variableId}`
  readonly phrase: string;
  readonly source: "voice" | "text";
  readonly state: ProposalCardState;
  readonly onConfirm: () => void;
  readonly onEdit: (variableId: number) => void;
  readonly onCommitEdit: (variableId: number, value: number) => void;
  readonly onCancelEdit: () => void;
  readonly onDiscard: () => void;
  readonly onRetry: () => void;
  readonly onSettled: () => void;     // once, after the saved exit animation
};

type MicDockState =
  | { readonly kind: "idle" }
  | { readonly kind: "requesting_permission" }
  | { readonly kind: "listening"; readonly elapsedMs: number; readonly level?: number }
  | { readonly kind: "processing" }
  | { readonly kind: "unavailable"; readonly reason: "denied" | "no_device" | "insecure" }
  | { readonly kind: "service_error"; readonly message: string };
type MicDockProps = {
  readonly state: MicDockState;
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly onSubmitText: () => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onRetry: () => void;
};
```

The edit field parses with `parseDecimal` (AC-13). Invalid input shows the Field error from the copy table and does not call `onCommitEdit`. The edit draft lives in the card and resets whenever the edited value's prop changes or `editing` ends.

**Card controls per state** (the parent decides what happens; the card only shows these):

| State | Values area | Actions (left to right; primary last) |
|---|---|---|
| `proposed` | rows with values; missing values as empty slots; Editar per row (48px icon button) | Descartar (ghost) · Confirmar (primary, disabled while any value is null) |
| `editing` | the edited row becomes an Input; other rows read only | Cancelar (ghost) · Guardar (primary) |
| `saving` | rows read only | Confirmar shows a spinner and "Guardando…", all actions disabled |
| `saved` | rows read only, teal check | none |
| `needs_clarification` | question shown above rows; each missing value is an Input slot (Enter commits via `onCommitEdit`); filled rows keep Editar | Descartar (ghost) · Confirmar (disabled until no value is null) |
| `correction` | each row shows `previous` struck through → new value; rows where both are equal show the value once | Descartar (ghost) · Reemplazar (primary) |
| `save_error` | rows read only; `role="alert"` message above actions | Descartar (ghost) · Reintentar (primary) |

A row with `warning` set shows a warning row under it (warning icon + text, `warning` Badge colors) in any state.

**Copy** (Spanish, exact; `{n}` is `trialNumber`, `{name}` a variable name):

| Where | Text |
|---|---|
| Card badge (unsaved states) / saved label | "Sin guardar" / "Guardado" |
| Card header / unknown trial | "Ensayo {n}" / "Ensayo ?" (the "?" styled as an empty slot) |
| Card prompt (`proposed`) | "¿Lo guardo?" |
| Card prompt (`correction`) | "¿Reemplazo el ensayo {n}?" |
| Empty slot placeholder | "—" visually (`aria-label` "{name} sin valor") |
| Field error (bad number) | "Escribe un número, por ejemplo 73,5" |
| Card live text | proposed "Propuesta del ensayo {n}, sin guardar" · editing "Editando {name}" · saving "Guardando ensayo {n}" · saved "Ensayo {n} guardado" · needs_clarification "Faltan valores: " + the question · correction "El ensayo {n} ya existe. ¿Lo reemplazo?" · save_error "No se pudo guardar" (alert) |
| Card `save_error` message | headline "No se pudo guardar" + `message` |
| Dock idle / listening stop / submit | "Dictar" / "Detener" / "Enviar" |
| Dock text placeholder | "Escribe una medición, por ejemplo: Ensayo 3, temperatura 50 grados" |
| Dock live text | idle "Micrófono listo" · requesting_permission "Permite el micrófono" · listening "Escuchando" · processing "Transcribiendo…" · unavailable the reason · service_error "No te escuché bien" (alert) |
| Dock unavailable reasons | denied "Micrófono bloqueado. Puedes escribir." · no_device "No hay micrófono. Puedes escribir." · insecure "El micrófono necesita HTTPS. Puedes escribir." |
| Phone tab dot label | "Propuesta pendiente" |
| Home greeting | "Tu cuaderno de laboratorio" |
| Home status badges | "Conectando con la API…" · "API conectada ({env})" · "La API no responde" |
| `/dev/ui` EmptyState demo | title "Aún no hay ensayos" · text "Dicta o escribe tu primera medición." |

**API surface**: no HTTP routes. One new page route and the manifest:

| Route | Kind | Inputs | Output | Access | Errors |
|---|---|---|---|---|---|
| `/dev/ui` | Next.js page (server component shell, client demo islands) | none | every component and state with sample data | local and preview only | 404 via `notFound()` when `VERCEL_ENV === "production"` |
| `/manifest.webmanifest` | `app/manifest.ts` | none | name, colors, icon paths | public | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| ProposalCard header | trial number ("Ensayo 3") | prop `trialNumber` ← `proposal.trial_number` (spec 0002); null shows "Ensayo ?" as a missing slot |
| ProposalCard rows | variable name, value, unit | props ← `variable.name`, `proposal_value.value`, `proposal_value.unit` (spec 0002); formatted by `formatQuantity` |
| ProposalCard correction | old value | prop `previous` ← saved `measurement.value` of `proposal.target_trial_id` (feature 6 reads it) |
| ProposalCard warning | warning text | prop `warning`, computed by feature 11 from `variable.min_value` / `max_value` |
| ProposalCard quote | the sentence and its source icon | props `phrase` and `source` ← `proposal_value.original_phrase` / `source` (spec 0002) |
| ProposalCard clarification | the question | prop `state.question` ← the assistant turn text (feature 6) |
| ProposalCard save error | message | prop `state.message` ← the API error `message` (AGENTS.md error shape) |
| MicDock listening | level bars | prop `level` (0 to 1) ← feature 8's audio analyser; absent → pulse |
| MicDock listening | timer `mm:ss` | prop `elapsedMs` ← feature 8's recording clock |
| MicDock unavailable | reason text | prop `reason` mapped to fixed Spanish strings in the component |
| Home | API status and env name | existing `GET /api/health` → `env` (spec 0001) |
| `/dev/ui` | sample experiment and trials | a constant in `web/src/app/dev/ui/sample-data.ts`, copied from the product doc's demo table |
| `/dev/ui` | visibility | `isDevUiEnabled(process.env.VERCEL_ENV)`; `VERCEL_ENV` is set by Vercel at build (read at prerender, so baked into each build); undefined locally → shown |
| ProposalCard flight | shared layout id | prop `layoutIdPrefix` (parent supplies, e.g. `trial-3`) + `variableId` |
| ProposalCard after saved | "done" signal | `onSettled` callback fired by the card's exit animation |
| ProposalCard edit field | initial text | `formatQuantity(value, null)` of the edited value |
| Every string | Spanish copy | the copy table above |
| Theme | light or dark | the browser's `prefers-color-scheme` |
| Number locale | decimal comma | the constant `"es"` in `format.ts` |
| Manifest | colors | the light `--color-canvas` and `--color-ink` values, repeated as constants in `manifest.ts` (a manifest cannot read CSS) |

**Key invariants**:
- Components never render a raw color; every color comes from a token (AC-1).
- Contrast pairs checked by the test (AC-4), in both themes. Text, ≥4.5:1: `ink` on `canvas`, `surface`, `unsaved`; `ink-muted` on `canvas`, `surface`, `sunken`, `unsaved`; `on-ink`/`ink`; `warning-ink`/`unsaved`; `danger` on `surface`, `canvas`, `unsaved`; `saved` on `surface`, `canvas`, `unsaved`. UI boundaries, ≥3:1: `control` on `surface`, `sunken`, `canvas`; `unsaved-border` on `surface`, `canvas`, `unsaved`; `focus` on `canvas`, `surface`, `sunken`, `unsaved`. These cover every Badge variant and the placeholder. All values pass (recomputed 2026-10-28 for the amended tokens); the tightest are dark `control`/`sunken` 3.27:1, light `control`/`sunken` 3.31:1, light `unsaved-border`/`unsaved` 3.38:1, and light `ink-muted`/`sunken` 5.24:1, so do not lighten `control` or `unsaved-border`.
- Unsaved always shows three signals (badge, dashed edge, tint); color is never the only signal (AC-9).
- Every number shown to a user goes through `formatQuantity` (AC-13).
- `ProposalCard` and `MicDock` do no I/O and hold no state beyond the inline edit draft; same props give the same output.
- No global keyboard shortcuts (AC-10).
- Movement only when motion is allowed (AC-15).

**Security model**: no data, no secrets, no new routes that read or write anything. `/dev/ui` shows only constant sample data and is 404 in production; once the access gate (feature 19) lands it sits behind it like every other page. No compliance scope applies.

**Configuration required**: no new environment variables. `VERCEL_ENV` is set automatically by Vercel. New web dependencies: `radix-ui` and the shadcn runtime helpers (`class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`), `lucide-react`, `sonner`, `motion`; dev: `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `vitest-axe`. Files you provide later: `web/public/brand/logo.svg` and the three icons under `web/public/icons/`.

**Critical test scenarios** (Vitest + Testing Library + vitest-axe, tests colocated as `*.test.ts(x)` beside the code, plus a manual pass on `/dev/ui`). What jsdom cannot check, and is therefore manual: contrast as rendered (the token test covers it), layout and horizontal scroll, the animations themselves, and dark mode rendering.
- Happy path: render `ProposalCard` in `proposed` with the trial 3 sample, check that focus lands on Confirmar, press Enter, `onConfirm` is called once, and axe finds nothing; verifies **AC-8**, **AC-10**, **AC-6**.
- Unsaved vs saved: `proposed` has the Sin guardar badge and the dashed class; `saved` has neither and shows "Guardado"; verifies **AC-9**.
- Edit failure: in `editing`, type `abc`; the Field shows an error and `onCommitEdit` is not called; Esc calls `onCancelEdit` and focus returns to Editar; verifies **AC-8**, **AC-10**.
- No stray saves: with a card in `proposed`, typing "sí" plus Enter in the dock's text field calls `onSubmitText`, never `onConfirm`; verifies **AC-10**, **AC-12**.
- Mic unavailable: `MicDock` in `unavailable` (`denied`) shows the reason, focus moves to the text field, and the field accepts typing; verifies **AC-12**.
- Contrast: the token test fails if any listed pair is below its threshold, in light and dark; verifies **AC-4**.
- Formatting: `formatQuantity(73.5, "%")` is `73,5 %`, `(7.2, null)` is `7,2`, `(0.12345, "g")` is `0,123 g`; `parseDecimal("73,5")` is 73.5 and `parseDecimal("x")` is an error result; verifies **AC-13**.
- Focus guard: with the dock's text field focused, mounting a `proposed` card leaves focus in the text field; from `editing`, Esc returns focus to Editar, not Confirmar; verifies **AC-10**.
- Live region: the card's region is empty on mount and reads "Ensayo 3 guardado" after rerendering with `saved`; `onSettled` fires once (fake timers, or immediately with reduced motion stubbed); verifies **AC-11**, **AC-15**.
- Reduced motion: with `matchMedia('(prefers-reduced-motion: reduce)')` stubbed true, the card and dock render `data-motion="reduced"`; verifies **AC-15**.
- No raw colors: the scan test finds no hex, color function, or palette class in components; verifies **AC-1**.
- Gate: `isDevUiEnabled("production")` is false, `("preview")` and `(undefined)` are true; the page calls `notFound()` with `vi.stubEnv("VERCEL_ENV", "production")`; verifies **AC-16**.
- Manifest: its color constants equal the `globals.css` light tokens; verifies **AC-18**.
- Manual (`/check verify`): tab through `/dev/ui` with the keyboard only, toggle the system dark mode, turn on reduced motion, and resize from 320px to 1920px; verifies **AC-5**, **AC-7**, **AC-14**, **AC-15**.

## Build plan

Skateboard: the smallest usable whole first. Tokens, fonts, and the core components go in before the proposal card and mic dock, so features 5 and 6 can start on Thursday even if the motion work slips. Expressive motion comes last, because it is the most likely to slip and nothing else depends on it.

1. Set up tests in `web/`: add Vitest, `@vitejs/plugin-react`, jsdom, Testing Library (react, user-event, jest-dom), and `vitest-axe`; add `web/vitest.config.ts` (jsdom; the `@/` alias via `vite-tsconfig-paths`; a setup file that registers the jest-dom and vitest-axe matchers with their TypeScript types, and polyfills what jsdom lacks for Radix and Motion: `window.matchMedia`, `ResizeObserver`, `Element.prototype.scrollIntoView`, `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`), a `test` script in `package.json`, and the test step to `lefthook.yml`, `.github/workflows/ci.yml`, and `make check`. Satisfies **AC-6**.
2. Inside `web/`, run `pnpm dlx shadcn@latest init --base radix --no-monorepo -y` (always pass `--base radix`: the shadcn skill's design system flow defaults to Base UI and to scaffolding a new app, and neither applies here; without `--base` the command stops at an interactive prompt). Check with `pnpm dlx shadcn@latest info --json` that `base` is `radix`, `tailwindVersion` is `v4`, and the aliases are `@/components/ui` and `@/lib/utils`. Then rewrite `globals.css` per *Token plumbing*: tokens in `@theme static`, dark overrides in the media query, fonts in `@theme inline`, shadcn's variables aliased to the tokens, its `.dark` block deleted, `color-scheme: light dark`, the old Arial rule removed. Load Instrument Serif (`weight: "400"`), Geist, and Geist Mono in `layout.tsx`. Add the contrast test (`web/src/app/tokens.test.ts`), the no raw colors scan test (`web/src/app/no-raw-colors.test.ts`), and a first `web/design.md` with direction, tokens, and type. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-2**.
3. Add the shadcn components (`button`, `input`, `textarea`, `label`, `field`, `select`, `card`, `badge`, `table`, `tabs`, `dialog`, `sonner`, `skeleton`), restyle each to the tokens, sizes, and focus ring, convert any default export to a named export, and write `EmptyState`. Add a keyboard and axe test for each interactive one. Satisfies **AC-5**, **AC-6**, **AC-7**, **AC-1**.
4. Write `formatQuantity` and `parseDecimal` in `web/src/lib/format.ts` with unit tests. Satisfies **AC-13**.
5. Build `AppShell`, `PageHeader`, `BrandMark`, and `WorkspaceLayout`; mount `AppShell`, `Toaster`, and `MotionConfig` in the root layout; restyle the home page (wordmark, serif greeting, API status as a Badge); add `app/manifest.ts` and its color test. Satisfies **AC-14**, **AC-17**, **AC-18**.
6. Build `ProposalCard` with all seven states, the warning row, the unsaved signals, focus handling, and the `aria-live` region, plus tests for each state. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-6**.
7. Build `MicDock` with all six states, level bars, the timer, the always usable text field, and `aria-live`, plus tests. Satisfies **AC-12**, **AC-7**, **AC-6**.
8. Add `motion` and `web/src/lib/motion.ts`; animate the card (enter, state changes, saved collapse) and the dock morph; build the card to table flight with `layoutIdPrefix`, `layout="position"` plus a size crossfade, in one `LayoutGroup` (the table row mounts at `saved`, the card collapses after the flight, then `onSettled`); make every animation fall back under reduced motion and set `data-motion="reduced"`. If this step runs late, ship the card's fade and collapse without the flight; nothing else depends on it. Satisfies **AC-15**.
9. Write `isDevUiEnabled` in `web/src/lib/dev-ui.ts` with its unit test, then build `/dev/ui` (`web/src/app/dev/ui/page.tsx` plus `sample-data.ts`), showing every component and state with interactive demos and the flight, calling `notFound()` when the gate is off. Before writing it, read `node_modules/next/dist/docs/` on `notFound()` during static prerender with `cacheComponents`. Finish `web/design.md` (card anatomy, dock states, layout, motion, references). Satisfies **AC-16**, **AC-2**.
10. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` in `web/`. Satisfies **AC-1** to **AC-20** (regression gate).
11. (Amendment, 2026-10-28) Restyle to the reviewed direction: the new token values, `Sidebar`, `MobileNav`, the content sheet, `PanelHeading`, the borderless table, button and badge variants per AC-20, the transcript and composer on `/dev/ui/workspace`, and a hydration safe `useReducedMotion` in `web/src/hooks/`. Build `PushToTalk` with its press rule and tests, and the `/dev/ui/home` preview of spec 0004. Satisfies **AC-17**, **AC-19**, **AC-20**.

## Consequences

**Positive**:
- Features 5 to 11 build screens by putting existing pieces together; the card and dock contracts are already fixed, so feature 6 and feature 8 only wire data and events.
- The trust principle is visible: unsaved values carry three signals, readable on a projector and in grayscale.
- Accessibility is checked automatically from day one (axe and contrast tests), not audited at the end.
- Both themes work through system preference with no toggle to maintain.

**Negative / tradeoffs**:
- Four runtime libraries join the web app (Radix, Motion, sonner, lucide). Motion adds roughly 30 to 40 KB gzipped to client pages that animate.
- Expressive motion costs build time three days before the demo, and every animation needs a reduced motion path and a manual check.
- shadcn code is copied into the repo, so its upstream fixes do not arrive automatically; you own about a dozen component files.
- Both themes double the contrast pairs to tune and the states to look at in `/dev/ui`.
- Until your logo and icons arrive, the PWA install shows missing icons (404s in the console).

**Neutral**:
- The test stack (Vitest, Testing Library) arrives here instead of in `/test`; `/test` builds on it later.
- `next/font` downloads Instrument Serif at build time; no runtime font requests.
- Next.js 16 has `cacheComponents` on; `/dev/ui` reads `VERCEL_ENV` at build, so it is static. Read `node_modules/next/dist/docs/` before writing it (web/AGENTS.md).

## Follow-up

- [ ] Add your logo as `web/public/brand/logo.svg` and the PWA icons `web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`; then switch `BrandMark` to the logo (AC-18).
- [ ] Feature 9 (chart) builds the Plotly template from the `--color-chart-*` tokens, reading them with `getComputedStyle` in the browser.
- [ ] Root `AGENTS.md` should record: shadcn/ui components live in `web/src/components/ui/`, tokens only (no raw colors), `formatQuantity` for every displayed number, and `web/design.md` as the visual source of truth (`/sync` owns that file).
- [ ] Root `AGENTS.md` `## Agent skills` should list `shadcn` (`.claude/skills/shadcn/`, `shadcn-ui/ui`, installed during this design), and its `Declined:` line should add the shadcn and Motion MCP servers and the Motion, Sonner, Radix, lucide, and a11y testing skills (`/sync`).
- [ ] Root `AGENTS.md` "Test" line says `/test` sets up Vitest; after this feature it is already installed (`/sync`).

## Rationale

Reasoning, the options weighed, and the Mobbin references: see [rationale.md](rationale.md).
