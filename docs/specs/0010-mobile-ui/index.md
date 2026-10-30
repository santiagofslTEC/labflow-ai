# 0010. Mobile version: the same app, built for the phone

**Date**: 2026-10-30
**Status**: Proposed

## Summary

LabFlow is used at the bench, and the bench has a phone, not a laptop. The web app already shrinks to a phone width (spec 0003's 1024px breakpoint, a slim top bar, a sheet menu), but every screen was laid out for a desk: the notebook page stacks a long header, the capture area, and the whole data panel in one scroll; "Tabla completa" and "Revisar variables" open desktop dialogs with wide tables; the results summary is a six column table; text fields are 15px, so iPhone Safari zooms in on every tap; the screen sleeps while you dictate; and the manifest points at icons that do not exist, so installing it gives a blank icon. This spec makes the same Next.js app, on the same API, a phone app below 1024px: a bottom tab bar instead of the hamburger, a notebook page with three tabs (Capturar, Ensayos, Variables), full screen sheets instead of dialogs, card lists instead of wide tables, phone sized results, a screen that stays on while LabFlow listens, and an app you can install on the home screen with its own icon. Every feature works the same on both; the desktop layout does not change. No API change and no migration.

## Requirements

**User stories**:
- As a student at the bench, I want to dictate and confirm a trial with one thumb, so that I do not walk to a laptop with gloves on.
- As a student, I want LabFlow on my home screen like an app, so that I open it in one tap during a practice.
- As a student, I want to read my trials, my variables, and my results on the phone, so that I can check a value without a laptop.
- As a team, we want one codebase for both, so that every fix lands on desktop and phone at once.

**Acceptance criteria** ("phone" means a viewport narrower than 1024px, spec 0003's breakpoint; "desktop" means 1024px and wider, which stays exactly as it is today):

- **AC-1**: Navigation. On the phone, a bottom tab bar replaces the hamburger menu (`MobileNav` is removed): Inicio (`/`), Cuadernos (`/cuadernos`), Nuevo (`/cuadernos/nuevo`), and Ajustes (`/configuracion`), each an icon over a short label, at least 48px tall, the current one marked (`aria-current="page"`, ink text and icon; the others muted). The bar is `position: fixed` to the bottom with `env(safe-area-inset-bottom)` padding, sits on `canvas` with a hairline top border, and sets `--tabbar-height`; page content pads by it, and the mic dock (spec 0003, AC-12) sits right above it. The top bar keeps the brand mark, plus a back arrow on pages below a notebook ("Volver" to the notebook, or to Cuadernos). The bar is not shown on `/access`. Desktop keeps the sidebar.
- **AC-2**: Notebook page, phone. A compact header: the back arrow, the title (two lines at most, then an ellipsis; the full title is the page's `h1`), the Abierto or Cerrado badge, and a "Más" menu (48px icon button) with Exportar datos, Ver resultados, and Ver objetivo y contexto (which opens the goal, context, author, date, and instructions in a sheet). Under it, a segmented control with three tabs: Capturar (the voice conversation, the typed capture, and the card, as today), Ensayos (the trial count, Mediciones recientes, the trials table of AC-5, and Exportar CSV), and Variables (the variable list and a full width Revisar variables button). The tab is kept in the URL (`?vista=capturar|ensayos|variables`, default `capturar`), so reload and back keep it. Each panel's content mounts once and is hidden with CSS, like spec 0003's `WorkspaceLayout`. When a card is pending and another tab is open, the Capturar tab shows a dot read as "Propuesta pendiente". A closed notebook shows the AC-10 empty state in Capturar.
- **AC-3**: Sheets. On the phone, every dialog in the app (Tabla completa, Revisar variables, Ver objetivo y contexto) opens as a full screen sheet that slides up: the title and a 48px close button in a sticky top row, its content scrolling, and its actions (Exportar CSV, Eliminar, Guardar) in a sticky bottom row above the safe area. Escape, the close button, and the browser back gesture close it (opening pushes a history entry; closing pops it), and focus returns to what opened it. Desktop keeps the centered dialog. This is one change in `components/ui/dialog.tsx`, not a second dialog.
- **AC-4**: Variables on the phone. In Revisar variables, each variable is a row of its own instead of a table row: a 44px checkbox, the name, then "{unit} · {range} · Requerida" and "{n} valores" under it in muted text, and a 48px Editar button. The form (spec 0008, AC-2, AC-3) is one column, Mín and Máx side by side, with Guardar and Cancelar in the sheet's bottom row. Selecting, the delete confirmation, the unit lock, the AC-10 and AC-11 messages of spec 0008 all work as on desktop.
- **AC-5**: Trials table on the phone. The table scrolls sideways inside its own box, never the page: the Ensayo column stays fixed on the left, each value column is at least 6rem, and a soft fade on the right edge shows there is more. Numbers use `formatQuantity` as today. The same table is in the Ensayos tab and in the Tabla completa sheet.
- **AC-6**: Results on the phone. The page is one column: Eje X and Eje Y as two full width selects, the chart full width and 18rem tall, "Ver puntos" under it, then Resumen por variable as one card per variable (name; Valores, Mínimo with its trials, Máximo with its trials, Promedio as label and value lines) instead of the six column table, then Mejor ensayo with its two selects stacked. On the chart, a tap on a point shows its hover text, dragging scrolls the page (Plotly `dragmode: false`, no zoom box), and the mode bar is hidden; a two finger pinch does nothing. The URL keeps the selection as today (spec 0009, AC-2).
- **AC-7**: Create a notebook on the phone. Each variable row (spec 0005, AC-3) stacks: Nombre full width, then Unidad, Mín, and Máx in one row, then Requerida and the remove button; Agregar variable is full width. The instructions panel (spec 0005, AC-19) keeps "Subir PDF" and "Pegar texto"; the file picker opens the phone's files. Crear cuaderno and Cancelar sit in a sticky bottom row above the tab bar.
- **AC-8**: Capture on the phone. Every text field, text area, and select in the app has a 16px font size on the phone (iOS Safari zooms into anything smaller), with the right keyboard: `inputmode="decimal"` for Mín, Máx, and values (as today), `enterkeyhint="send"` on the capture field, `autocapitalize="off"` and `autocorrect="off"` on the access code. The card's actions stay 48px (spec 0003). After a save or an undo, focus goes back to the capture field only on desktop, so the phone keyboard does not jump open by itself.
- **AC-9**: The screen stays on. While a voice conversation is live (spec 0007 voice, the mic is listening or LabFlow is answering), the app holds a screen wake lock (`navigator.wakeLock.request("screen")`), takes it again when the page becomes visible, and releases it when the conversation ends or the page is hidden. Where the API is missing (older iOS), nothing changes and nothing is shown. Typed capture does not hold it.
- **AC-10**: Install. The app installs to the home screen on Android (Chrome's install prompt) and iOS (Share, Add to Home Screen) and opens standalone with its own icon: `web/public/icons/` holds `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (the brand mark inside the maskable safe zone), and `apple-touch-icon.png` (180px), all from one `brand/icon.svg`; the root layout sets `appleWebApp` (`capable`, title "LabFlow", status bar `default`) and the light and dark `themeColor`. In standalone mode the top bar pads by `env(safe-area-inset-top)`. The proxy already lets `/icons/` and the manifest through without a session; a test checks that every icon the manifest names exists in `public/`. No offline mode and no service worker: LabFlow needs the API for everything, and the browser's own "no connection" page is clearer than a stale notebook.
- **AC-11**: Every page from 320px to 1023px wide (and in landscape at 667 by 375) shows no sideways page scroll, no content under the tab bar, the dock, or the notch, and no text below 12px. Every phone control is at least 44px (48px for the card actions, the mic pill, and the tab bar). The desktop layout at 1024px and wider is unchanged (checked by the existing tests and by hand at 1280px).
- **AC-12**: Accessibility: the tab bar is a `nav` labelled "Principal"; the notebook tabs are a Radix tab list labelled "Vistas del cuaderno"; sheets are dialogs with a title; vitest-axe reports no violations on the phone notebook page (each tab), a sheet open, the phone variables list and form, the phone results page, and the tab bar. Reduced motion turns the sheet slide into a fade.
- **AC-13**: Phone checks in CI. Playwright runs a small suite at an iPhone (390 by 844) and an Android (412 by 915) viewport against `next build && next start`, with the API answered by route stubs (no real API, no model): each page has no sideways scroll and nothing under the tab bar; the tab bar navigates; the notebook tabs switch and keep `?vista`; Tabla completa opens as a full screen sheet and the back gesture (`page.goBack()`) closes it; a text field has a computed font size of 16px; the manifest's icons load. It runs in the `web` CI job after the unit tests.

## Decision

**Chosen option**: the same Next.js app with a phone layout below 1024px, built from the components that exist (one dialog, one table, one form, with responsive classes), plus install icons and a wake lock. The API does not change.

**Calls made in this spec** (team choice on 2026-10-30: "misma app, versión móvil"; reasoning in [rationale.md](rationale.md)):
- **One app, one breakpoint** (spec 0003's 1024px), so tablets get the phone layout. Runner up: a second Next.js app for phones, which doubles every feature.
- **A bottom tab bar** (Inicio, Cuadernos, Nuevo, Ajustes) instead of the hamburger, since a thumb reaches the bottom and every page is one tap away. Runner up: keep the sheet menu, two taps for everything.
- **Three tabs on the notebook page** (Capturar, Ensayos, Variables), so capture is not buried under the data panel. Runner up: one long scroll, as today.
- **Dialogs become full screen sheets** on the phone, in the one dialog component. Runner up: a bottom drawer (vaul), a new dependency for the same result.
- **Card lists instead of wide tables** for variables and the results summary; the trials table stays a table and scrolls inside its box, since comparing trials needs columns.
- **No offline mode, no service worker** (AC-10).
- **Playwright for the phone checks** (AC-13), since jsdom cannot measure layout and spec 0003 left "no sideways scroll" to a hand check. Runner up: keep checking by hand, which is how the 15px zoom and the missing icons got through.

**Implementation skills**: `vercel-react-best-practices` · `shadcn` (dialog and tabs).

## Feature design

**Data model**: none; no migration.

**API surface**: none new. Every screen uses the routes it uses today. The session lasts 30 days (`SESSION_MAX_AGE_S`), which already fits an installed app.

**Web structure**:
- `components/app-shell/tab-bar.tsx` (new, AC-1), `app-shell.tsx` (the tab bar below `lg`, `MobileNav` removed, safe area padding), `top-bar.tsx` (brand mark and back arrow).
- `hooks/use-is-desktop.ts`: `useSyncExternalStore` over `matchMedia("(min-width: 1024px)")`, for the two things CSS cannot do (AC-8's focus return, AC-6's Plotly config); `false` on the server. Layout itself stays CSS only.
- `components/notebooks/notebook-view.tsx`: the phone header and `NotebookTabs` (AC-2), reusing the inspector's sections (`VariablesSection`, `TrialsSection`, split out of `notebook-inspector.tsx` so desktop and phone render the same pieces).
- `components/ui/dialog.tsx`: the sheet classes below `lg` and the history entry (AC-3), in a `useDialogHistory` hook.
- `components/notebooks/variables-dialog.tsx`, `trials-table` (AC-4, AC-5), `components/results/*` (AC-6), `notebook-form.tsx` and `variable-rows.tsx` (AC-7): responsive classes, no second component.
- `components/ui/input.tsx`, `textarea.tsx`, `select.tsx`: `text-base lg:text-[0.9375rem]` (AC-8).
- `hooks/use-wake-lock.ts` (AC-9), used by `components/voice/voice-conversation.tsx`.
- `public/icons/*`, `public/brand/icon.svg`, `app/layout.tsx` metadata (AC-10); `scripts/icons.mjs` renders the PNGs from the SVG with `sharp` (already in the lockfile, as a Next.js dependency), and the PNGs are committed.
- `web/e2e/` with `playwright.config.ts`, the stubs, and the specs (AC-13); `@playwright/test` as a dev dependency; `pnpm test:e2e`.

**Key invariants**: each slot mounts once whatever the width; the desktop DOM order and look do not change; no raw colors (the tab bar and sheets use tokens); every feature reachable on desktop is reachable on the phone.

**Security model**: unchanged; the icons and manifest are public, as the proxy already allows.

**Critical test scenarios**: Vitest with `matchMedia` mocked to phone and desktop for the tab bar, the notebook tabs and `?vista`, the sheet's history entry, the wake lock (acquire, re-acquire on visible, release on end, missing API), and the manifest icons; Playwright for layout (AC-13).

## Build plan

1. Shell: `TabBar`, top bar, safe areas, `useIsDesktop`; remove `MobileNav`; tests, satisfies **AC-1**, part of **AC-11**, **AC-12**
2. Fields at 16px and the keyboards; the focus return; tests, satisfies **AC-8**
3. Sheets in `dialog.tsx` with the history entry; tests, satisfies **AC-3**
4. Notebook page: split the inspector sections, the phone header, "Más", `NotebookTabs` with `?vista`; tests, satisfies **AC-2**
5. Variables list and form, trials table scroll, create form, results page on the phone; tests and axe, satisfies **AC-4** to **AC-7**
6. `useWakeLock` in the voice conversation; tests, satisfies **AC-9**
7. Icons, `appleWebApp`, the manifest test, satisfies **AC-10**
8. Playwright, the stubs, the phone suite, and the CI step, satisfies **AC-11**, **AC-13**
9. Scope: feature 21 in progress, linked to this spec.

## Consequences

**Positive**: LabFlow works at the bench with one thumb; it installs like an app; every later feature lands on both layouts; layout bugs are caught in CI, not in a lab.

**Negative / tradeoffs**: a fourth tool in CI (Playwright, about a minute per run); the notebook page gets a second header for the phone; tablets get the phone layout.

## Follow-up

- [ ] Feature 8 (voice): read the save label back by voice on the phone (spec 0006 follow-up).
- [ ] Later: a native share for the CSV (Web Share API) instead of a download, which iOS stores in Files.
- [ ] Later: offline capture with a queue, if the labs have no signal.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
