# 0006. Text capture and the confirm card: rationale

## Context

This is the heart of LabFlow: a sentence in Spanish becomes a trial, variables, values, and units on a card the student confirms. The product promise is trust: nothing reaches the table before a confirm (RF-05), and no number is invented (RNF-04), including on trap sentences. The demo is Friday, Oct 30, and the extraction quality must reach 90 % of the eval set (RNF-03) within 5 s (RNF-02).

Spec 0001 already fixed the frame: an `LLMProvider` returning one validated tool call, Ollama Cloud first with Claude as fallback inside a 4 s deadline, and the rule that code, not the model, owns state and saving. Spec 0002 already built the proposal lifecycle (start, set value, confirm, discard) with its locks and typed errors. What was open is everything between the sentence and the lifecycle: how the model's output is checked, how units become canonical, how the system decides when to ask, what the user reads, and what the API and the web expose.

Spoken Spanish numbers are messy ("setenta y tres coma cinco", "mil doscientos"), units come as words ("grados", "por ciento"), and students dictate in pieces, correct themselves, repeat a trial number, or start the next trial before saving. Each of these is a place where a model could quietly guess. There are no API keys yet, so most of the behavior must be testable without a model.

## Options considered

### Option 1: The model picks a tool and quotes its words; code checks, converts, decides, and replies

The model returns one tool call whose values carry the exact words read (`number_text`) and the unit words. Pure Python grounds each number in the sentence, converts units, plans the lifecycle operations, and picks a reply reason rendered from a template.

**Pros**:
- Invented numbers are impossible by construction, which is the demo's strongest claim.
- Almost all behavior is pure and testable without keys.
- The same planner serves voice (feature 8) and the eval set (feature 12).

**Cons**:
- More code to write now: a Spanish number reader, a unit table, a planner.
- Templates sound stiffer than free text.
- A model that paraphrases numbers gets its values dropped (safe, but more questions).

### Option 2: Structured extraction only, no tools

The model fills one JSON object (trial, values, units, intent) for every sentence; code does the rest. No grounding check.

**Pros**:
- One schema, simple to prompt.
- Fewer moving parts than tools.

**Cons**:
- Intent (confirm, discard, correction) is mixed into an extraction schema, which gets awkward as features 9 and 10 add questions and charts.
- Without grounding, an invented number reaches the card; only the eval set would notice.
- Departs from spec 0001's tool contract.

### Option 3: The model runs the conversation

The model calls tools freely, several per turn, and writes its own replies and questions.

**Pros**:
- Most natural conversation.
- Least code in the planner.

**Cons**:
- The model writes text the user reads, so it can state a number; the trust rule rests on prompting.
- Multi step tool loops blow the 5 s budget with a fallback in the path.
- Hard to test without keys, and nothing to test without them.

## Rationale

Option 1 fits the forces in Context. The product's promise is trust, and the only way to show zero invented numbers on Friday, not just measure it, is a check that refuses any value the sentence does not contain. Asking the model to quote its words (`number_text`) makes that check cheap and exact; a value that cannot be grounded becomes a question, which is the behavior RF-07 already asks for. Templates close the other leak: if the model never writes reply text, it can never put a number in it.

It also fits the calendar. With no keys today, Option 1 lets milestones 1 to 4 be built and tested against a `FakeProvider`, leaving only prompt tuning for when keys arrive. Options 2 and 3 can't be judged at all without a model. Option 3's tool loop also adds model round trips that the 4 s deadline can't afford.

Smaller calls: the waiting sentence of AC-8 lives in the browser, which sends it again once card 6 is resolved. A server side replay would need turn history inference, id validation, and a second model call; the cross check showed all of that buys nothing the user can see. A code side fallback for grounding (accept a value when exactly one number in the sentence equals it) keeps the zero invented guarantee while forgiving a model that paraphrases. Claude starts in parallel after 1.5 s instead of after a full Ollama timeout, because a strict sequence left Claude about 1.5 s, too little for a tool call. Operations commit one repository call at a time because spec 0002's functions already lock and commit; a combined transaction would mean rewriting them, and the worst partial outcome is a card with fewer values, never a wrong save. `elegir_ensayo` gets its own tool because overloading `corregir` for "es corrección" would make one tool mean two things and confuse both models.

## Amendment: pitch feedback (2026-10-28)

### Context

The pitch feedback (`docs/product/ai-risk-mitigation.pdf`) named confirmation fatigue: when every measurement gets the same "¿Lo guardo?" with a plain Confirmar button, students tap yes without reading, and the AI gets blamed for numbers the student approved. The answer is to confirm less and make each confirm count: show what was said next to what was understood, put the value on the button, and interrupt only when something looks off. Friday's priorities are the grounding check, the value on the button with said vs understood, and the provenance view on tap (feature 7). Three decisions were open: where the "said" words come from, the button wording, and which cards count as light or flagged.

### Options considered

**Said words.** (a) Store `said_text` on `proposal_value` and `measurement`, cut from the user's sentence at the span grounding matched. (b) Recompute from `original_phrase` with `find_numbers` at read time. Chosen: (a). Grounding already knows the exact span; throwing it away and guessing it again later can land on a different number in a sentence with several, and the provenance view on saved trials would carry the same guess. The cost is one additive migration of nullable columns. The slice comes from the user's sentence, not the model's `number_text`, so "what you said" can never be the model's words.

**Button.** (a) Values, then a count from three on. (b) Always every value. (c) Trial number only. Chosen: (a). One or two values fit a phone button and name exactly what is saved; from three on the card rows already show every value next to the said words, so the button names the trial and the count. (b) wraps at four or more variables; (c) drops the value from the button, which is what the feedback asked to fix.

**Light vs flagged.** (a) Flag on converted units, code side grounding, and out of range, with a tap to check each flagged value enforced by the API. (b) The same flags, a different look only, one tap saves. (c) Like (a) without range. Chosen: (a). The flags are the cases where LabFlow did more than read digits back (a conversion, a guess about which variable, a value outside what the teacher expects, overwriting saved data), so they are where a blind tap does damage. A look alone (b) still lets habit win. The range check is one comparison against columns spec 0002 already has, so waiting for feature 11 buys nothing; feature 11 keeps unit fit and trend warnings. Numbers in words are highlighted but not flagged, because with voice nearly every value is in words and flagging them would bring the fatigue back. Replacing saved values was first on the flag list too; the cross check showed a three value correction would then need three checks after the user had already chosen "Corregir" and seen saved against new, so a correction's extra step is that choice, not a check per value. A value can hold several reasons at once (932 °F is both converted and out of range), so all are shown under one check rather than the first hiding the rest.

### Rationale

The check is enforced on the server (`checked_at`, 409 `unchecked_values`, the `check_values` reply) because a typed "sí" or, later, a spoken one would otherwise skip a check that lives only in the browser. `grounding` is stored because `code_match` cannot be worked out again after the sentence is gone; every other flag reason is derived from data already stored, so it cannot drift. A sentence sets the value again and clears its check, and a target change clears every check, so a check always applies to the value and the card on screen. Code, not the model, finds the unit words after the number, so the stored said words and the conversion can never disagree.
