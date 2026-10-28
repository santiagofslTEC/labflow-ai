# LabFlow design system

**Character**: a quiet document app with instrument readouts. Near white warm paper, near black ink, serif titles, and big monospaced numbers like a bench instrument's display. It is laid out like the web apps people already trust (a sidebar, a content sheet, borderless tables, a transcript, a floating composer). Calm everywhere, except one thing: a value that is not saved yet always looks unsaved.

**Source**: spec [0003](../docs/specs/0003-design-system-ui-foundation/index.md). Token values live in [`src/app/globals.css`](src/app/globals.css) and nowhere else; this file explains what they mean. `src/app/tokens.test.ts` checks every contrast pair below, in both themes.

## Build mandate

- **Trust first.** Unsaved values carry three signals at once: the "Sin guardar" badge, a dashed `unsaved-border` edge, and the `unsaved` tint. Saved values get a solid border, the teal check, and "Guardado". Color is never the only signal, so the two still read apart in grayscale.
- **Tokens only.** Components never write a hex, `rgb()`, `oklch()`, or a Tailwind palette class like `bg-zinc-100`. Use the token classes (`bg-canvas`, `text-ink-muted`, `border-unsaved-border`). `src/app/no-raw-colors.test.ts` fails the build otherwise.
- **Every number through `formatQuantity`** (`src/lib/format.ts`): decimal comma, up to 3 decimals, no padding, a space before the unit (`73,5 %`, `50 °C`, `7,2` for pH).
- **Gloves and projectors.** Card actions and the mic pill are 48px tall; every other control is at least 40px. Measured numbers are large.
- **Keyboard always.** Every control shows the same 2px `focus` ring with a 2px offset (the `focus-ring` utility). No global shortcuts.
- **Both themes, no toggle.** Light on `:root`, warm charcoal under `prefers-color-scheme: dark`. Never write `dark:` color classes; the tokens switch on their own.
- **No loud color.** Buttons are ink, outline, or plain text, never red or brightly filled. Red appears only as a small icon on errors and destructive actions. Status reads through a soft pill with a colored dot. Sentence case everywhere; no letter spaced caps.
- **Use the pieces.** Build screens from `src/components/ui/`, `app-shell/`, `proposal-card/`, and `mic-dock/`. Do not restyle them per page with `className` colors.

## References (Mobbin)

| Idea                                 | Screens                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approve before applying              | [Delphi](https://mobbin.com/screens/f224b7d4-a925-45a8-b0b0-26b0eb74f3ec), [Higgsfield](https://mobbin.com/screens/f0ee7046-b34e-415a-a830-564baf6f902d), [Microsoft Copilot](https://mobbin.com/screens/5e05dc5f-b40b-4df7-8c69-c81e71d20fcf), [Clay](https://mobbin.com/screens/2f118fde-6fe3-4327-a6b5-98f495f50fbb) |
| Bottom record dock and live level    | [Voicenotes](https://mobbin.com/screens/211de9a0-4191-42e6-b07e-93bbf3b548c8), [Granola](https://mobbin.com/screens/e96bd18e-eec7-49cf-87c3-ff38ab46a47e), [Mistral](https://mobbin.com/screens/7411b9f0-68ad-4585-98bb-d3b13384de4b), [Grok](https://mobbin.com/screens/f751d849-26a0-4ae4-a8e2-0a751def512c)          |
| Serif titles on warm neutrals        | [SchoolAI](https://mobbin.com/screens/8f1c26d3-5f7a-4a37-96cf-abacae6803f0), [Elicit](https://mobbin.com/screens/1966eb67-a99c-47d1-a18f-4cc633d258ee)                                                                                                                                                                  |
| Large measured numbers               | [Runna](https://mobbin.com/screens/130e6491-d1f2-4543-864a-f90b54a216e7), [Withings Health Mate](https://mobbin.com/screens/12f23b7b-3a36-42a6-b031-68b0d7605589), [Any Distance](https://mobbin.com/screens/7c5a60da-ba02-4112-b07f-5ad5b8ef39ec)                                                                      |
| App shell: sidebar and content sheet | [Linear](https://mobbin.com/screens/3af45bee-f669-4dc7-afaf-e3fb099161f9), [Plane](https://mobbin.com/screens/784636a9-ff00-4a9b-a9b7-3c95a9169ab5), [Obvious](https://mobbin.com/screens/bbc85fe0-d486-459d-b838-e79e1ce3d4a3), [Notion](https://mobbin.com/screens/bb37c98b-4f9a-4fef-967c-40225bc2e9b6)              |
| Transcript instead of chat bubbles   | [OpenAI audio](https://mobbin.com/screens/8a37ccd1-bb31-48df-9e4f-47c6e366014d), [Otter](https://mobbin.com/screens/d770d880-e9c3-4b63-a009-a568d821aff3)                                                                                                                                                               |
| Floating composer                    | [Microsoft Copilot](https://mobbin.com/screens/402c35af-6cfa-43c8-9dd6-31d1c52f0e21), [Hume](https://mobbin.com/screens/3c0a2b67-2468-44c6-8fee-ca7b1b0078bd)                                                                                                                                                           |
| Quiet buttons, no red fills          | [Qatalog](https://mobbin.com/screens/87535ac9-5efd-4412-a6a3-262ba9009e9c), [AirOps](https://mobbin.com/screens/2b08206b-9f55-4d93-968e-fee1b3f04dc8)                                                                                                                                                                   |
| Summary figures over a chart         | [Plane](https://mobbin.com/screens/2862f98d-7923-44d7-afcf-198527997849), [Vercel](https://mobbin.com/screens/172f9834-0e6a-4fa8-abd4-6e91b02b5ef4)                                                                                                                                                                     |
| Data tables with numbers             | [Hex](https://mobbin.com/screens/ad002fd9-8709-4128-9ad3-dcc85a2fef10), [Peec AI](https://mobbin.com/screens/0711fee8-0de2-4f0e-8b7c-16387d22f091)                                                                                                                                                                      |

## Color tokens

Class names follow the token: `--color-ink-muted` gives `text-ink-muted`, `bg-ink-muted`, `border-ink-muted`.

| Token                  | Meaning                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `canvas`               | the sidebar and window behind the sheet (warm near white, soft charcoal in dark) |
| `surface`              | the content sheet, cards, composer, dialogs                                      |
| `sunken`               | hover, view chips, badges, tabs track, error rows                                |
| `ink`                  | text, and the primary button fill                                                |
| `ink-muted`            | secondary text, labels, placeholders                                             |
| `on-ink`               | text on the primary button                                                       |
| `line`                 | decorative dividers only, never a control edge                                   |
| `control`              | input and select borders (at least 3:1)                                          |
| `saved`                | the saved check and saved accents (teal)                                         |
| `unsaved`              | the unsaved card tint                                                            |
| `unsaved-border`       | the dashed unsaved edge and the unsaved badge dot                                |
| `warning-ink`          | range warning text                                                               |
| `danger`               | error and destructive icons, badge dots (never a fill)                           |
| `focus`                | the focus ring                                                                   |
| `chart-1` to `chart-4` | Plotly series (feature 9 reads them with `getComputedStyle`)                     |

shadcn's own names (`bg-background`, `text-muted-foreground`, `bg-primary`, `border-input`, `ring-ring`) still work; they are aliases of the tokens above. Prefer the token names in new code.

**Do not lighten** `control`, `unsaved-border`, or `ink-muted`: their tightest pairs (`control` on `sunken` 3.12:1, `unsaved-border` on `canvas` 3.29:1, `ink-muted` on `sunken` 4.94:1) barely pass. Disabled controls use 50% opacity, which WCAG exempts.

### Badge variants

Soft pills in sentence case, no outline. A small dot carries the status color; it hides when the badge leads with an icon (the icon takes the color instead).

| Variant   | Text          | Background | Dot / icon       | Use                                |
| --------- | ------------- | ---------- | ---------------- | ---------------------------------- |
| `neutral` | `ink-muted`   | `sunken`   | `control`        | connecting, counts                 |
| `saved`   | `ink`         | `sunken`   | `saved`          | Guardado, API connected            |
| `unsaved` | `warning-ink` | `unsaved`  | `unsaved-border` | Sin guardar                        |
| `warning` | `warning-ink` | `unsaved`  | `unsaved-border` | out of range (with a warning icon) |
| `danger`  | `ink`         | `sunken`   | `danger`         | errors, API down                   |

### Buttons

| Variant     | Look                                                | Use                                        |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| `primary`   | `ink` fill, `on-ink` text                           | the one main action (Confirmar, Dictar)    |
| `secondary` | `surface`, hairline `line` border, `shadow-control` | other actions                              |
| `ghost`     | `ink-muted` text, `sunken` on hover                 | quiet actions (Descartar, Cancelar, icons) |
| `danger`    | same as secondary; only its icon is `danger`        | destructive actions; never a red fill      |

## Type

| Role                                                                                  | Font                                       | Size / line          | Class                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------- | -------------------------------------------------------- |
| Display (page and experiment titles, home greeting, `BrandMark`, `EmptyState` titles) | Instrument Serif 400, never bold           | 32/36, 40/44 at `lg` | `font-serif text-display lg:text-display-lg`             |
| Title                                                                                 | Instrument Serif 400                       | 28/32                | `font-serif text-title`                                  |
| Body                                                                                  | Geist                                      | 16/24                | `text-base`                                              |
| Small                                                                                 | Geist                                      | 14/20                | `text-sm`                                                |
| Label                                                                                 | Geist, sentence case                       | 12/16 or 14/20       | `text-xs text-ink-muted` or `text-sm text-ink-muted`     |
| Readout (card values)                                                                 | Geist Mono, tabular figures                | 28/32, 32/36 at `lg` | `font-mono text-readout lg:text-readout-lg tabular-nums` |
| Table numbers                                                                         | Geist Mono, tabular figures, right aligned | 15/20                | `TableNumberCell`                                        |

Serif is for display text only. Every measured value and its unit is Geist Mono with `tabular-nums`, in the card and in the table.

## Space, radius, shadow

- Spacing: Tailwind's 4px scale (`gap-3` is 12px). Use `flex` or `grid` with `gap`, not `space-y`.
- Radius: `rounded-card` 14px for the content sheet, cards, the composer, and dialogs; `rounded-control` 10px for buttons, inputs, selects; `rounded-full` for pills and badges.
- Shadow: `shadow-control` (a 1px lift) for buttons, inputs, and the sheet; `shadow-card` for cards and popovers; `shadow-dock` (stronger) for the floating composer.

## Touch targets

| Control                                                            | Height                                        |
| ------------------------------------------------------------------ | --------------------------------------------- |
| Confirmar, Editar, Descartar, Reemplazar, Reintentar, the mic pill | 48px (`Button size="lg"` or `size="icon-lg"`) |
| Every other button, input, select, tab                             | at least 40px (`size="md"`, the default)      |

## Layout

- `AppShell` (root layout): at 1024px and up, a 240px `Sidebar` on the `canvas` (the `BrandMark` wordmark, Inicio, the Experimentos list, and the dev pages outside production) and the content on a `surface` sheet inset 8px from the window with a hairline border. Below 1024px, a 56px sticky top bar with a menu button (`MobileNav`, the sidebar as a sheet from the left) and the wordmark. Content is `max-w-6xl`, 16px side padding (40px at `lg`). A "Saltar al contenido" link appears on the first Tab.
- Full height uses `dvh`, never `vh`, so the phone keyboard does not hide the dock.
- `PageHeader` holds the page's one `<h1>` in the display serif, with an optional breadcrumb line above, one muted meta line below, and actions on the right.
- `PanelHeading` labels a view inside a page, Notion style: an icon chip ("Tabla", "Gráfico", "Experimentos") with quiet meta on the right (a count, a caption) and a hairline under it.
- `WorkspaceLayout` (the experiment page) takes `conversation`, `card`, `table`, `chart`, and `dock`, and renders each exactly once:
  - **1024px and wider**: two columns split by a hairline. Left: the transcript (speaker and time over plain text, no bubbles), with the card right under it and the composer below. Right: table, then chart with its summary figures. No tab list.
  - **Below 1024px**: one column with a tab list (Conversación · Tabla · Gráfico) pinned under the header. Every panel stays mounted (`forceMount`) and CSS hides the inactive ones. When a card is waiting and another tab is open, Conversación shows an amber dot labelled "Propuesta pendiente".
- The dock is `position: fixed` at the bottom, padded by `env(safe-area-inset-bottom)` (the root viewport sets `viewport-fit=cover`). `DockSlot` measures it and publishes `--dock-height`; the content area pads its bottom by that much, so nothing hides behind it. At 1024px and up the workspace aligns the dock with the transcript column, so it reads as that column's composer.
- No page scrolls sideways from 320px to 1920px. Wide tables scroll inside their own container.

## Proposal card

`src/components/proposal-card/`. Pure presentational: same props, same output. The parent owns the state; the card keeps only the draft text of a value being typed.

**Anatomy, top to bottom**

1. Header: "Ensayo {n}" (or "Ensayo ?" with the "?" as an empty slot) and the status badge on the right: "Sin guardar" (unsaved) or a teal check with "Guardado".
2. The source phrase in quotes behind a left rule, with a mic icon (dictated) or a keyboard icon (typed).
3. The prompt: "¿Lo guardo?", "¿Reemplazo el ensayo {n}?", or the clarifying question.
4. One row per variable, in `variable.position` order: the name on the left, then the value as a readout (`formatQuantity`, Geist Mono 28/32, 32/36 at `lg`), and a 48px Editar button. Missing values are a dashed empty slot ("—", read as "{name} sin valor"). A `warning` adds an amber line under its value.
5. The save error, when there is one, in a `role="alert"` row: a `sunken` fill, a small `danger` icon, the headline in ink, the message muted.
6. Actions, left to right with the primary last, all 48px.

**States**

| State                 | Looks                                                                                   | Actions                                                                          |
| --------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `proposed`            | unsaved, Editar on every row                                                            | Descartar · Confirmar (disabled while a value is missing)                        |
| `editing`             | the edited row becomes a field (`73,5`, no unit); Enter or Guardar commits, Esc cancels | Cancelar · Guardar                                                               |
| `saving`              | rows read only                                                                          | Descartar · "Guardando…" with a spinner, both `aria-disabled` so focus stays put |
| `saved`               | solid teal border, white surface, check and "Guardado"                                  | none; it collapses and calls `onSettled`                                         |
| `needs_clarification` | the question, and each missing value as a field (Enter commits)                         | Descartar · Confirmar (disabled until nothing is missing)                        |
| `correction`          | old value struck through, arrow, new value; equal values show once                      | Descartar · Reemplazar                                                           |
| `save_error`          | the alert: "No se pudo guardar" and the API message                                     | Descartar · Reintentar                                                           |

**Unsaved always shows three signals**: the "Sin guardar" badge, a 1px dashed `unsaved-border` edge, and the `unsaved` tint. Saved swaps all three for a solid `saved` border, the `surface` background, and the check. They read apart in grayscale.

**Focus**: on mount, or when the state kind changes (except out of `editing`), focus goes to the primary action (Confirmar, Reemplazar, Reintentar, or the first empty field in `needs_clarification`), but never if a text field already has focus. Leaving `editing` returns focus to that row's Editar. There are no global shortcuts; typing in the dock never touches the card.

**Announcements**: one polite live region, empty at first, then one line per state ("Propuesta del ensayo 3, sin guardar", "Ensayo 3 guardado"). The save error uses `role="alert"` instead.

## Mic dock

`src/components/mic-dock/`. Pure presentational. A floating composer pinned to the bottom: one rounded `surface` box with a hairline border and `shadow-dock`, holding a single line text field (48px, borderless, always usable), the Enviar icon button (disabled while the text is blank), and the black Dictar pill. Status lines (unavailable, service error) sit inside the box above the field.

| State                   | Pill                                                     | Above the row                                                        |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `idle`                  | black pill, mic icon, "Dictar"                           |                                                                      |
| `requesting_permission` | muted pill, "Permite el micrófono" (`aria-disabled`)     |                                                                      |
| `listening`             | black pill: 5 level bars, `mm:ss` timer, "Detener"       |                                                                      |
| `processing`            | muted pill, spinner, "Transcribiendo…" (`aria-disabled`) |                                                                      |
| `unavailable`           | no pill; focus moves to the text field                   | muted pill with the reason ("Micrófono bloqueado. Puedes escribir.") |
| `service_error`         | "Reintentar"                                             | `role="alert"`: "No te escuché bien" and the message                 |

The pill is one button element in every state, so keyboard focus stays on it as it morphs. Level bars are a fixed envelope `[0.5, 0.8, 1, 0.8, 0.5]` times `level` (clamped 0 to 1, floor 0.15); with no `level` they pulse gently. The timer comes from `elapsedMs`, clamped to `00:00`..`99:59`. The dock announces each state in its own polite region.

## Motion

Tokens in [`src/lib/motion.ts`](src/lib/motion.ts): `spring.snappy` for state changes and the dock morph, `spring.gentle` for the card entering and the flight, `duration.fade` 150ms for every reduced motion fallback.

- **Card enters**: rises 24px and fades in on `spring.gentle`.
- **State changes**: the card body resizes on `spring.snappy`; the saved check pops in.
- **Saved**: the check shows, the values fly to the table, then after 0.85s the card collapses over 0.35s and calls `onSettled` once (about 1.2s in all).
- **Card to table flight**: pass `layoutIdPrefix` (for example `trial-3`) to the card, wrap card and table in one `LayoutGroup`, and give each new table cell's number a `motion.span` with `layoutId={`${prefix}-${variableId}`}` and `layout="position"`. Mount the new row when the card reaches `saved`. Give the table `containerClassName="lg:overflow-visible"` so the scroll container does not clip the flying number. Only pass a prefix for a new row; a prefix that matches a row already on screen (a correction) would animate the card out of that row.
- **Dock**: the pill resizes on `spring.snappy` and its contents crossfade.
- **Reduced motion**: the root `MotionConfig reducedMotion="user"` turns off transforms and layout animation, and each animated component checks `useReducedMotion()` to swap movement for a fade of 150ms or less (the card then settles right after a 150ms fade). Animated components set `data-motion="reduced"` so tests can check it. CSS animations (spinner, skeleton, mic pulse) stop under `motion-reduce`.

## Preview

`/dev/ui` shows every token, base component, card state, dock state, and the flight, with the sample experiment. `/dev/ui/workspace` shows `WorkspaceLayout` with a live dock, for checking the layout from 320px to 1920px. Both return 404 when `VERCEL_ENV` is `production` (`isDevUiEnabled` in `src/lib/dev-ui.ts`).

## Assets still owed

`public/brand/logo.svg` (then `BrandMark` swaps its text for the logo in one line) and the PWA icons `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. Until they exist the install prompt shows missing icons.
