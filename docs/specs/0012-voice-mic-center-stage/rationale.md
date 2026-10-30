# 0012 rationale: the mic at center stage

## Context

Voice works in production, but on the notebook page it is a small "Hablar" button above the text field, and during a turn the screen says "Escuchando…" from the moment you stop talking until LabFlow speaks. Spec 0007's round 2 diagnosis showed what that costs: students waited in silence and tapped stop on turns that were about to answer. The page needs to show three different moments clearly (I hear you, I'm working, I'm answering) and make voice the obvious way in, while typing stays one step away.

The engineer's standing preferences apply: look at Mobbin first, show layout and colors before building, and no generic AI look.

## Options considered

### Option 1: Center stage (chosen)

The capture column becomes the mic: header, meter and mic, your words, the reply, the card and notice, then "o escribe" and the text field. Inspector unchanged.

**Pros**: voice is the page; your words sit where your eyes already are; the card shows right under the reply.
**Cons**: the header and context shrink; the column is taller, so the text field moves down.

### Option 2: Bottom dock

The page stays; a sticky dock holds the mic, meter, and stop, with words and reply above it.

**Pros**: smallest change to the page.
**Cons**: voice stays a tool at the edge; words and reply float between the card and the dock.

### Option 3: Focus sheet

Tapping the mic opens a full height sheet over the notebook.

**Pros**: most immersive.
**Cons**: hides the trials and inspector while you dictate, so you cannot see what was saved.

## Rationale

The engineer chose center stage, the green instrument palette, a summary line on stop, and one component for both pages. Center stage is the only layout that keeps your words, LabFlow's reply, and the saved notice in one reading line. The green instrument uses only existing tokens, so it matches the rest of the app in light and dark and avoids the orb and glow look that marks generic AI assistants.

## Mobbin references (seen 2026-10-30)

Borrowed:
- A bar level meter for listening: [CVS Health voice search](https://mobbin.com/screens/662cf573-e7fc-438b-bf03-5c74b5d9b4be), [ABY Journal](https://mobbin.com/screens/d818141b-7c83-40e2-b1ad-28e86e9cbc36).
- Live text growing under the meter: [ABY Journal](https://mobbin.com/screens/d818141b-7c83-40e2-b1ad-28e86e9cbc36), [Manus](https://mobbin.com/screens/0a45f7cc-5b5d-4b92-9cfc-a59e3c41d948).
- The reply shown with a "talk or type" field kept below: [Meta AI](https://mobbin.com/screens/a13d716b-b9dc-4775-9934-b5c881b221a3).

Avoided (the AI look): gradient orbs and glows, as in [Meta AI](https://mobbin.com/screens/a13d716b-b9dc-4775-9934-b5c881b221a3) and [Mesh](https://mobbin.com/screens/1cb80a8d-a3a2-48ce-bdb3-bbaa25276689).

## Approved layout and colors (engineer, 2026-10-30)

```
┌─ Cuaderno: Destilación · Abierto ────────┐┌ Inspector ┐
│        ▏▎▍▌▋▊▉█▉▊▋▌▍▎▏  0:12            ││ Variables │
│              ╭──────╮                    ││ Ensayos   │
│              │  ■   │  (mic 112 px)      ││ Acciones  │
│              ╰──────╯                    ││           │
│            Escuchando                    ││           │
│   "ensayo 3, temperatura 65 gra…"        ││           │
│   LabFlow: Guardado ensayo 3: 65 °C.     ││           │
│   ✓ Guardado ensayo 3 · 65 °C · Deshacer ││           │
│   ──────── o escribe ────────            ││           │
│   [ Ensayo 6, 65 grados…          ↵ ]    ││           │
└──────────────────────────────────────────┘└───────────┘

Escuchando  ▏▍▋▉█▉▋▍▏   brand #17734a on canvas #faf9f7
Pensando    ▁▁▂▅▂▁▁▁▁   ink-muted #676b71, pulse moves →
Hablando    ▂▃▅▃▂▃▅▃▂   brand-soft #e7f3ec bars, brand edge
Terminado   ─────────   line #e7e5e1 + ink text
Mic idle: brand fill, white icon · Mic live: white fill, brand ring + ■
```
