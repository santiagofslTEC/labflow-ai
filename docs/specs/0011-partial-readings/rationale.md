# 0011 rationale: partial readings

## Context

Spec 0006 was written for a sentence that carries a whole trial ("Ensayo 6: 65 grados, 20 minutos, 74 por ciento"). Its clean rule (AC-27) needs every required variable, its `missing_values` question asks for the rest, and a saved trial number triggers "¿Corregir ensayo 3 o es otro ensayo?". Real use is different: an experiment watches small changes in a few variables over time, so a student reads one gauge and says one value ("ensayo 3, temperatura 65 grados"), then another a minute later.

Under today's rules that student gets a question after every sentence, and nothing saves until they answer for variables they have not measured yet. By voice it is worse: each question is a spoken turn, adding seconds to every reading. The data model already allows a partial trial (spec 0002, AC-9); only the capture rules forbid it.

What still has to be protected is the saved data. A misheard number must not silently replace a value already in the table, and a value out of range or with a converted unit still deserves a look. Code (not the model) has to decide which is which, as spec 0006 already does for flags.

## Options considered

### Option 1: Relax the clean rule only

Drop the required check from `is_clean` and `card_reason`, keep everything else. A one value sentence for a new trial saves; anything touching a saved trial still goes through `choose_trial` and the card.

**Pros**: smallest change; no new reply reasons.
**Cons**: adding a second value to trial 3 still asks "¿Corregir ensayo 3 o es otro?", which is the main case of watching changes over time. A sentence with one flagged value holds back the clean ones too.

### Option 2: Split the sentence (chosen)

Code judges each value: it saves now when it fills an empty slot and needs no question, it waits on one card otherwise. Any saved trial number becomes the target; only a collision with a saved value asks.

**Pros**: matches "record what was said"; adding to a trial is silent; a question never holds back values that are fine; no schema change.
**Cons**: one turn may write two proposals and show a notice plus a card; undo must merge into a waiting card; more planner tests.

### Option 3: Readings over time (several values per variable per trial)

A trial keeps every reading with its time (65, then 68), and nothing is ever replaced.

**Pros**: true history of changes; no replacement question at all.
**Cons**: a data model change across `measurement`, the trials table, CSV, and the results chart (which value to plot?). The engineer chose "ask before replacing" instead, keeping one value per variable per trial.

## Rationale

The engineer picked each rule: required means expected and never blocks; a saved value is replaced only after asking; a sentence with no number goes to the last trial used; adding to a saved trial needs no question; a mixed sentence saves the new values and asks only about the change; a bare "ensayo 4" saves nothing. Option 2 is the only one that satisfies all of them together. Option 1 keeps the "corregir o es otro" question on exactly the sentences this change is about, and Option 3 answers a different need (history) at the cost of a migration the engineer did not want.

Two calls were made here rather than asked. First, the empty selection of "ensayo 4" lives on a pending proposal with no values rather than a new `turn.trial_number` column: the pending proposal already carries a trial number, already survives a reload, and already takes the next sentence's values (spec 0006 AC-3), so no migration is needed. Second, undo with a waiting card merges the undone values into that card, because the database allows one pending proposal per notebook and "deshacer" should take back the whole last sentence.
