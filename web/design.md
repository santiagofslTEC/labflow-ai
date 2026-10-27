# LabFlow design system

**Character**: warm paper with instrument readouts. A cream lab notebook page, near black ink, serif titles, and big monospaced numbers like a bench instrument's display. Calm everywhere, except one thing: a value that is not saved yet always looks unsaved.

**Source**: spec [0003](../docs/specs/0003-design-system-ui-foundation/index.md). Token values live in [`src/app/globals.css`](src/app/globals.css) and nowhere else; this file explains what they mean. `src/app/tokens.test.ts` checks every contrast pair below, in both themes.

## Build mandate

- **Trust first.** Unsaved values carry three signals at once: the `SIN GUARDAR` badge, a dashed `unsaved-border` edge, and the `unsaved` tint. Saved values get a solid border, the teal check, and "Guardado". Color is never the only signal, so the two still read apart in grayscale.
- **Tokens only.** Components never write a hex, `rgb()`, `oklch()`, or a Tailwind palette class like `bg-zinc-100`. Use the token classes (`bg-canvas`, `text-ink-muted`, `border-unsaved-border`). `src/app/no-raw-colors.test.ts` fails the build otherwise.
- **Every number through `formatQuantity`** (`src/lib/format.ts`): decimal comma, up to 3 decimals, no padding, a space before the unit (`73,5 %`, `50 °C`, `7,2` for pH).
- **Gloves and projectors.** Card actions and the mic pill are 48px tall; every other control is at least 40px. Measured numbers are large.
- **Keyboard always.** Every control shows the same 2px `focus` ring with a 2px offset (the `focus-ring` utility). No global shortcuts.
- **Both themes, no toggle.** Light on `:root`, warm charcoal under `prefers-color-scheme: dark`. Never write `dark:` color classes; the tokens switch on their own.
- **Use the pieces.** Build screens from `src/components/ui/`, `app-shell/`, `proposal-card/`, and `mic-dock/`. Do not restyle them per page with `className` colors.

## References (Mobbin)

| Idea                              | Screens                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approve before applying           | [Delphi](https://mobbin.com/screens/f224b7d4-a925-45a8-b0b0-26b0eb74f3ec), [Higgsfield](https://mobbin.com/screens/f0ee7046-b34e-415a-a830-564baf6f902d), [Microsoft Copilot](https://mobbin.com/screens/5e05dc5f-b40b-4df7-8c69-c81e71d20fcf), [Clay](https://mobbin.com/screens/2f118fde-6fe3-4327-a6b5-98f495f50fbb) |
| Bottom record dock and live level | [Voicenotes](https://mobbin.com/screens/211de9a0-4191-42e6-b07e-93bbf3b548c8), [Granola](https://mobbin.com/screens/e96bd18e-eec7-49cf-87c3-ff38ab46a47e), [Mistral](https://mobbin.com/screens/7411b9f0-68ad-4585-98bb-d3b13384de4b), [Grok](https://mobbin.com/screens/f751d849-26a0-4ae4-a8e2-0a751def512c)          |
| Serif titles on warm neutrals     | [SchoolAI](https://mobbin.com/screens/8f1c26d3-5f7a-4a37-96cf-abacae6803f0), [Elicit](https://mobbin.com/screens/1966eb67-a99c-47d1-a18f-4cc633d258ee)                                                                                                                                                                  |
| Large measured numbers            | [Runna](https://mobbin.com/screens/130e6491-d1f2-4543-864a-f90b54a216e7), [Withings Health Mate](https://mobbin.com/screens/12f23b7b-3a36-42a6-b031-68b0d7605589), [Any Distance](https://mobbin.com/screens/7c5a60da-ba02-4112-b07f-5ad5b8ef39ec)                                                                      |
| Data tables with numbers          | [Hex](https://mobbin.com/screens/ad002fd9-8709-4128-9ad3-dcc85a2fef10), [Peec AI](https://mobbin.com/screens/0711fee8-0de2-4f0e-8b7c-16387d22f091)                                                                                                                                                                      |

## Color tokens

Class names follow the token: `--color-ink-muted` gives `text-ink-muted`, `bg-ink-muted`, `border-ink-muted`.

| Token                  | Meaning                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `canvas`               | page background (cream paper, warm charcoal in dark)         |
| `surface`              | cards, dock, table, dialogs                                  |
| `sunken`               | inputs at rest, table header, tabs track                     |
| `ink`                  | text, and the primary button fill                            |
| `ink-muted`            | secondary text, labels, placeholders                         |
| `on-ink`               | text on the primary button                                   |
| `line`                 | decorative dividers only, never a control edge               |
| `control`              | input and select borders (at least 3:1)                      |
| `saved`                | the saved check and saved accents (teal)                     |
| `unsaved`              | the unsaved card tint                                        |
| `unsaved-border`       | the dashed unsaved edge and the `SIN GUARDAR` badge          |
| `warning-ink`          | range warning text                                           |
| `danger`               | Descartar emphasis, save errors                              |
| `focus`                | the focus ring                                               |
| `chart-1` to `chart-4` | Plotly series (feature 9 reads them with `getComputedStyle`) |

shadcn's own names (`bg-background`, `text-muted-foreground`, `bg-primary`, `border-input`, `ring-ring`) still work; they are aliases of the tokens above. Prefer the token names in new code.

**Do not lighten** `control`, `unsaved-border`, or `ink-muted`: their tightest pairs (`control` on `sunken` 3.12:1, `unsaved-border` on `canvas` 3.29:1, `ink-muted` on `sunken` 4.94:1) barely pass. Disabled controls use 50% opacity, which WCAG exempts.

### Badge variants

| Variant   | Text          | Background | Border           | Use                                |
| --------- | ------------- | ---------- | ---------------- | ---------------------------------- |
| `neutral` | `ink-muted`   | `sunken`   | none             | connecting, counts                 |
| `saved`   | `saved`       | `surface`  | `saved`          | Guardado, API connected            |
| `unsaved` | `warning-ink` | `unsaved`  | `unsaved-border` | SIN GUARDAR                        |
| `warning` | `warning-ink` | `unsaved`  | `unsaved-border` | out of range (with a warning icon) |
| `danger`  | `danger`      | `surface`  | `danger`         | errors, API down                   |

## Type

| Role                                                                                  | Font                                       | Size / line          | Class                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------- | -------------------------------------------------------- |
| Display (page and experiment titles, home greeting, `BrandMark`, `EmptyState` titles) | Instrument Serif 400, never bold           | 32/36, 40/44 at `lg` | `font-serif text-display lg:text-display-lg`             |
| Title                                                                                 | Instrument Serif 400                       | 28/32                | `font-serif text-title`                                  |
| Body                                                                                  | Geist                                      | 16/24                | `text-base`                                              |
| Small                                                                                 | Geist                                      | 14/20                | `text-sm`                                                |
| Label                                                                                 | Geist, uppercase, 0.06em tracking          | 12/16                | `text-label uppercase`                                   |
| Readout (card values)                                                                 | Geist Mono, tabular figures                | 28/32, 32/36 at `lg` | `font-mono text-readout lg:text-readout-lg tabular-nums` |
| Table numbers                                                                         | Geist Mono, tabular figures, right aligned | 15/20                | `TableNumberCell`                                        |

Serif is for display text only. Every measured value and its unit is Geist Mono with `tabular-nums`, in the card and in the table.

## Space, radius, shadow

- Spacing: Tailwind's 4px scale (`gap-3` is 12px). Use `flex` or `grid` with `gap`, not `space-y`.
- Radius: `rounded-card` 20px for cards, the table, and dialogs; `rounded-control` 12px for buttons, inputs, selects; `rounded-full` for pills and badges.
- Shadow: `shadow-card` for cards and popovers; `shadow-dock` (stronger, cast upward) for the mic dock.

## Touch targets

| Control                                                            | Height                                        |
| ------------------------------------------------------------------ | --------------------------------------------- |
| Confirmar, Editar, Descartar, Reemplazar, Reintentar, the mic pill | 48px (`Button size="lg"` or `size="icon-lg"`) |
| Every other button, input, select, tab                             | at least 40px (`size="md"`, the default)      |
