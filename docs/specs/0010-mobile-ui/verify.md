# Verify: mobile version · spec 0010 · updated 2026-10-30
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (an iPhone and an Android phone, on the Vercel preview)
- [ ] The tab bar shows Inicio, Cuadernos, Nuevo, Ajustes; each opens its page and is marked; the mic dock sits above it; nothing hides under it or the home indicator → AC-1, AC-11
- [ ] Open a notebook → the compact header and the Capturar, Ensayos, Variables tabs; switch to Ensayos, reload → still Ensayos; dictate a trial on Capturar while Ensayos was open → the dot on Capturar → AC-2
- [ ] Más → a sheet with the goal and context, and Exportar datos and Ver resultados work → AC-2
- [ ] Ensayos → Tabla completa opens full screen; swipe back (or the back button) → it closes and the notebook stays → AC-3
- [ ] Variables → Revisar variables → each variable is a row; edit one, then delete one, with the sheet's bottom buttons → AC-4
- [ ] The trials table scrolls sideways inside its box with Ensayo fixed; the page does not move sideways → AC-5
- [ ] Ver resultados → stacked selects, a full width chart; tap a point → its text; drag on the chart → the page scrolls; the summary is one card per variable → AC-6
- [ ] Nuevo → the variable rows stack; Crear cuaderno is at the bottom → AC-7
- [ ] Tap any text field on the iPhone → no zoom; the capture field's keyboard says Enviar → AC-8
- [ ] Start a voice conversation and wait 2 minutes without touching the phone → the screen stays on; end it → the screen sleeps as usual → AC-9
- [ ] Add to Home Screen (iOS) and Install app (Android) → the LabFlow icon; it opens with no browser bar and the top bar clears the notch → AC-10
- [ ] At 1280px the desktop layout looks as it did before this spec → AC-11

## Commands
- [ ] `cd web && pnpm test` → tab bar, notebook tabs, sheets, wake lock, manifest icons, axe → AC-1 to AC-10, AC-12
- [ ] `cd web && pnpm test:e2e` → the phone suite at 390 by 844 and 412 by 915 → AC-11, AC-13

## Acceptance-criteria coverage
- AC-1 to AC-10 · UI steps and Vitest
- AC-11, AC-13 · Playwright and the 1280px hand check
- AC-12 · vitest-axe
