# 0003. Rationale: design system and UI foundation

The decision record for [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

> ⚠️ Premise note: this feature is large for the time left. The demo is Friday, October 30, and today is Tuesday the 27th. Expressive motion, two themes, a new test stack, and seven card states add up to more than a day of work, and features 5 to 11 all wait on it. The build plan is ordered so the tokens, core components, card, and dock land first (enough for features 5 and 6 to start), and motion lands last, where it can slip without blocking anyone. If Thursday morning arrives with step 8 unfinished, ship without the flight and keep the plain fades.

LabFlow is used at a lab bench. Hands are busy, often gloved; the screen is a laptop beside the equipment or a phone propped up, and on Friday it is also a projector in a bright room. The product's core promise is trust: nothing is saved until you confirm, and no number is invented. The proposal card (the "¿Lo guardo?" moment) is where that promise becomes visible, so it is the star of the demo.

Today the web app is the Next.js scaffold: Geist fonts loaded but overridden by an Arial body rule, two color variables, and no components. Spec 0001 chose Tailwind CSS and left the component library to this feature. Every Release 1 to 4 feature (experiments list, capture card, trials table, voice, chart, answers, warnings) will build screens, and without a shared language each would invent its own buttons, colors, spacing, and number formatting. Numbers are a special risk: users dictate "setenta y tres coma cinco", the database stores 73.5, and the screen must show the same value in a consistent Spanish format everywhere.

Constraints: TypeScript strict with named exports and immutable data (AGENTS.md); the app must work on laptop and phone equally and follow the system light or dark setting (engineer's choices); WCAG 2.2 AA; touch targets that work with gloves; Spanish UI copy; a demo in three days by a three person team where one person owns the web.

## Options considered

### Visual direction

The engineer asked for the look to come from Mobbin references, so each direction below is anchored in real screens.

**Option 1: Warm paper with instrument readouts.** A cream canvas and near black primary like [Microsoft Copilot's research plan card](https://mobbin.com/screens/5e05dc5f-b40b-4df7-8c69-c81e71d20fcf), a serif greeting like [SchoolAI](https://mobbin.com/screens/8f1c26d3-5f7a-4a37-96cf-abacae6803f0), the black record pill of [Voicenotes](https://mobbin.com/screens/211de9a0-4191-42e6-b07e-93bbf3b548c8), and the huge numbers of [Runna](https://mobbin.com/screens/130e6491-d1f2-4543-864a-f90b54a216e7) and [Withings](https://mobbin.com/screens/12f23b7b-3a36-42a6-b031-68b0d7605589) inside the card. One deep teal (from [Elicit](https://mobbin.com/screens/1966eb67-a99c-47d1-a18f-4cc633d258ee)) means saved.
- Pros: calm and premium through restraint; numbers are the loudest element; light canvas projects well; amber and teal map cleanly onto unsaved and saved.
- Cons: warm neutrals need careful contrast tuning; a quiet palette can feel plain if spacing and type are not precise.

**Option 2: Elicit scholarly teal.** White canvas, teal as the brand and primary color, serif notebook titles, research table styling.
- Pros: instantly reads as a science tool; simple palette.
- Cons: with teal everywhere, "saved" loses its own color and needs another signal; colder than a notebook.

**Option 3: Instrument readout.** Stark black or white, condensed numerals, monospace caps labels, one hot red for listening ([Any Distance](https://mobbin.com/screens/7c5a60da-ba02-4112-b07f-5ad5b8ef39ec), adidas Running).
- Pros: the most striking when projected.
- Cons: reads as a fitness gadget, not a notebook; serif titles clash with it.

**Option 4: Dark studio.** Dark first panels like [Gemini Notebook](https://mobbin.com/screens/55612d89-063b-46b8-82f9-407d14476330).
- Pros: modern and dramatic.
- Cons: weak in a bright lab and on a projector; three panels get cramped below 1280px.

### Component foundation

**Option A: shadcn/ui on Radix (chosen).** Components copied into the repo and styled with Tailwind; Radix handles focus, keyboard, and ARIA.
- Pros: fastest path to accessible Dialog, Select, and Tabs; Tailwind v4 native; you own and restyle the code; named exports.
- Cons: you maintain the copied files; upstream fixes need a manual update.

**Option B: Base UI primitives with hand written styles.** Pros: full control, unstyled from the start. Cons: every component styled from zero before Friday.

**Option C: React Aria Components.** Pros: the strongest accessibility and internationalization. Cons: a heavier API and slower to assemble.

**Option D: Tailwind only, no library.** Pros: no dependency. Cons: focus trapping, Select keyboard behavior, and Dialog semantics must be written and tested by hand.

### Motion

**Expressive with Motion (chosen)**, **subtle CSS only**, or **almost none**. CSS only would cover fades and a rise, but not spring physics or shared layout animation (a value flying from the card into the table). The engineer chose expressive.

## Rationale

The trust principle decides the palette. Unsaved and saved must look different at a glance, from across a room, and for people who cannot tell colors apart. Option 1 keeps the main palette neutral (ink on paper), which leaves two colors free to carry meaning: amber for unsaved and teal for saved. Then each state gets three signals (badge, dashed edge, tint), not just a color. Option 2 spends teal on the brand, so saved would need yet another hue. Options 3 and 4 fight the bright room and the projector. Big Geist Mono numbers with tabular figures come straight from the instrument references. They make "63 %" (the demo's intentional error) jump out, which is exactly the moment the audience has to see.

shadcn/ui is the reuse choice for a one person web team with three days left. Radix already solves the parts that are expensive to get right (focus traps, Select keyboard rules, Tabs semantics), and the copy in model means restyling to the warm tokens is editing class names, not fighting a theme API. React Aria is the better accessibility engine on paper, but its API would cost the time the card and dock need.

Motion was the engineer's call over the recommended CSS only approach. It is a sound call for a demo whose story is "your value goes where you expect", as long as it cannot hurt anyone: `MotionConfig reducedMotion="user"` plus explicit fades keep it within WCAG, and putting it last in the build plan keeps it from blocking Release 1. The card and dock stay pure (props in, markup out) so features 6 and 8 own every side effect, which matches the AGENTS.md rule that I/O lives in hooks at the edge.

Number formatting gets its own function now, not in feature 7, because three features show the same numbers. A decimal comma matches how users dictate ("coma") and how Spanish lab notebooks are written. One `Intl.NumberFormat("es")` call keeps the card, table, and answers consistent.

### Mobbin references used

| Pattern | Screens |
|---|---|
| Approve before applying | [Delphi](https://mobbin.com/screens/f224b7d4-a925-45a8-b0b0-26b0eb74f3ec), [Higgsfield](https://mobbin.com/screens/f0ee7046-b34e-415a-a830-564baf6f902d), [Microsoft Copilot](https://mobbin.com/screens/5e05dc5f-b40b-4df7-8c69-c81e71d20fcf), [Clay](https://mobbin.com/screens/2f118fde-6fe3-4327-a6b5-98f495f50fbb) |
| Bottom record dock and live level | [Voicenotes](https://mobbin.com/screens/211de9a0-4191-42e6-b07e-93bbf3b548c8), [Granola](https://mobbin.com/screens/e96bd18e-eec7-49cf-87c3-ff38ab46a47e), [Mistral](https://mobbin.com/screens/7411b9f0-68ad-4585-98bb-d3b13384de4b), [Grok](https://mobbin.com/screens/f751d849-26a0-4ae4-a8e2-0a751def512c) |
| Serif titles on warm neutrals | [SchoolAI](https://mobbin.com/screens/8f1c26d3-5f7a-4a37-96cf-abacae6803f0), [Elicit](https://mobbin.com/screens/1966eb67-a99c-47d1-a18f-4cc633d258ee) |
| Large measured numbers | [Runna](https://mobbin.com/screens/130e6491-d1f2-4543-864a-f90b54a216e7), [Withings Health Mate](https://mobbin.com/screens/12f23b7b-3a36-42a6-b031-68b0d7605589), [Any Distance](https://mobbin.com/screens/7c5a60da-ba02-4112-b07f-5ad5b8ef39ec) |
| Data tables with numbers | [Hex](https://mobbin.com/screens/ad002fd9-8709-4128-9ad3-dcc85a2fef10), [Peec AI](https://mobbin.com/screens/0711fee8-0de2-4f0e-8b7c-16387d22f091) |
