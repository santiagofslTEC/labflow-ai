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
