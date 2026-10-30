# 0008. Review, add, edit, and delete variables

**Date**: 2026-10-29
**Status**: In Progress

## Summary

"Revisar variables" in the side panel's Acciones rápidas only scrolls to the read only Variables list, and once a notebook exists there is no way to fix a variable: a wrong name, a missing range, a variable you no longer measure. This feature makes "Revisar variables" open a dialog, like "Tabla completa" (spec 0007, AC-8), where you can add a variable, edit one, or select several and delete them. Code keeps the saved data honest: a variable's unit is locked once it has saved values, because those numbers are stored in that unit, and deleting a variable deletes its saved values too, after a confirmation that says how many. It adds three API routes on spec 0002's tables, and no migration.

Fixed on 2026-10-30 (error pass on the variables API): an other name could repeat another variable's name ("pH" as an other name of a second variable), so the capture prompt listed two variables answering to "pH"; and narrowing a range that left saved values outside it gave no sign. AC-10 and AC-11.

## Requirements

**User stories**:
- As a student, I want to fix a variable's name or range after I created the notebook, so that a typo or a missing range does not stay forever.
- As a student, I want to add a variable I forgot, so that I can start measuring it without making a new notebook.
- As a student, I want to delete variables I will not measure, several at once, and know before I confirm how many saved values go with them.
- As a team, we want a saved value to never change meaning, so that a unit change can never relabel numbers already measured.

**Acceptance criteria**:
- **AC-1**: "Revisar variables" opens a dialog titled "Variables · {notebook title}" with "{n} variables" (or "1 variable") under it. It lists every variable in position order: a checkbox, the name, the unit ("—" when none), the range (`formatRange`), Requerida or Opcional, the number of saved values ("{n} valores", from the trials query of spec 0007), and an Editar button. Escape or Cerrar closes it and focus returns to "Revisar variables". The panel's own Variables list stays as it is and shows every change without a reload.
- **AC-2**: Agregar variable opens one empty variable form at the end of the list: Nombre, Unidad (with the unit suggestions of the create form), Mín, Máx, Requerida, and Otros nombres (comma separated, at most 8, each at most 40 characters). Guardar sends `POST /api/experiments/{id}/variables`; the new variable goes last (`position` = the highest + 1). Saved trials show "—" in its new column. With 12 variables the button is disabled with "Máximo 12 variables", and the API answers 409 `variables_full`.
- **AC-3**: Editar turns that row into the same form with its current values. Guardar sends `PUT /api/variables/{id}` with every field (a full replacement); Cancelar or Escape leaves the row unchanged. While the variable has saved values, Unidad is disabled with "No se puede cambiar: ya hay valores guardados en {unit or 'sin unidad'}", and the API answers 409 `unit_locked` to a unit change; everything else stays editable. A variable with no saved values can change its unit.
- **AC-4**: Every form uses the create form's rules and Spanish messages (spec 0005, AC-4 and AC-5): a name is required and at most 80 characters, unique in the notebook ignoring case ("Hay otra variable con este nombre"; 422 `duplicate_variable_name`); a unit at most 20 characters; Mín and Máx numbers with a comma or dot ("Escribe un número, por ejemplo 20 o 20,5"); Mín not above Máx ("El mínimo no puede ser mayor que el máximo"; 422 `invalid_range`). Errors show under their field and focus moves to the first one; nothing is sent while the form has an error.
- **AC-5**: Selecting rows with their checkboxes shows "Eliminar {n} variables" (or "Eliminar 1 variable") above the list, with a "Seleccionar todas" checkbox in the header. Selecting every variable disables Eliminar with "Deja al menos una variable"; the API answers 409 `last_variable` when a delete would leave none.
- **AC-6**: Eliminar asks first, inside the dialog: "Se borrarán {names} y {k} valores guardados. Esto no se puede deshacer." (with no saved values: "Se borrarán {names}."), with Cancelar and a destructive Eliminar (the danger button: an outline button whose icon is red). Confirming sends `POST /api/experiments/{id}/variables/delete` with the ids. In one transaction the API deletes those variables' saved values, any trial left with no values, and the variables; a pending card loses its values for them (the existing cascade). It returns the counts it deleted, and the dialog shows "Eliminé {n} variables y {k} valores." in a polite status line.
- **AC-7**: After any add, edit, or delete, the notebook, the panel's Variables list, the trials table and CSV (spec 0010), the trial count, and the capture prompt all use the new variables with no reload: the web invalidates `experimentKeys.all`, and the API reads variables fresh on every turn. A failed request keeps the form or the selection as it was and shows the API's message.
- **AC-8**: The three routes are behind the access session (401 without it) and answer 404 `experiment_not_found` or `variable_not_found` for an unknown id. On a closed notebook they answer 409 `experiment_closed` ("Este cuaderno está cerrado; no se pueden cambiar sus variables.") and the dialog shows the list without Agregar, Editar, or the checkboxes.
- **AC-10** (error pass, 2026-10-30): Names and other names are one set per notebook, compared after trimming and ignoring case: an other name cannot be another variable's name or other name, and a name cannot be another variable's other name. A clash is 422 `name_in_use`, from add and edit alike, with a message that names who has it: "«pH» ya es el nombre de otra variable." (the other variable's name) or "«temp» ya es otro nombre de Temperatura." (its other name). The form checks the same thing before sending and shows the message under Otros nombres or Nombre (a name equal to another name keeps AC-4's "Hay otra variable con este nombre"). An other name equal to the variable's own name is dropped, like a repeated one. Edit locks the notebook row as add does, so two saves cannot both pass the check. Notebooks that already hold a clash keep it until someone edits one of the two variables.
- **AC-11** (error pass, 2026-10-30): Editing the range of a variable with saved values shows a quiet note under Mín and Máx when the drafted range leaves some of them outside and differs from the saved range: "2 valores guardados quedan fuera de este rango (ensayos 1 y 2). No se cambian." ("1 valor guardado queda fuera…", "(ensayo 1)"). It is worked out in the browser from the trials query (spec 0007), updates as you type, is tied to Mín and Máx with `aria-describedby`, never blocks Guardar, and the API does not check it. Values already outside the saved range show no note while the range is unchanged.
- **AC-9**: vitest-axe reports no violations with the dialog open on the list, a form with errors, a selection, and the delete confirmation.

## Decision

**Chosen option**: a dialog on the panel, like "Tabla completa", with inline row forms, three API routes, and code side rules that keep saved values meaning what they meant.

**Calls made in this spec** (decided with the team on 2026-10-29; reasoning in [rationale.md](rationale.md)):
- **Deleting a variable deletes its saved values**, after a confirmation with the count. Runner up: refuse to delete a variable with values, which leaves no way to remove one created by mistake once it was used.
- **The unit locks once a value is saved**; name, range, required, and other names stay editable. Runner up: convert saved values on a unit change, which only works for the few known conversions and silently rewrites measured data.
- **Select means checkboxes for deleting several**; editing stays one row at a time. Runner up: select one row to see its detail.
- **Adding is in the same dialog**, since the form already exists for the create page.
- **Edit is a full replacement (`PUT`)**, so "clear the range" and "leave it" never get confused; the form always sends every field.
- **Delete is `POST …/variables/delete` with a body**, because a `DELETE` with a body is not reliably supported by proxies and clients, and several ids do not fit a path.
- **Saved value counts come from the trials query** (spec 0010) the panel already has, so the dialog needs no new read; the API checks the real count again on every write.
- **Names and other names share one set** (AC-10), because capture reads both the same way: two variables answering to one word make the model guess. Runner up: let the prompt sort it out, which is the guess we want to avoid.
- **A narrowed range warns and saves** (AC-11): the student may be fixing a range that was wrong, and saved values are what was measured, so nothing is refused or changed. Runner up: block the save, which stops a legitimate fix.
- **A trial left empty by a delete is deleted too**, the same rule spec 0006's undo uses, so the table never shows a row of dashes.

**Implementation skills**: `fastapi` · `sqlmodel` · `supabase-postgres-best-practices` · `vercel-react-best-practices`

## Feature design

**Data model**: no new tables or columns, no migration. Writes `variable`, `measurement`, and `trial` through a new `api/app/repositories/variables.py`. `measurement.variable_id` is `NO ACTION`, so the delete removes measurements first, then empty trials, then variables, in one transaction; `proposal_value` already cascades. The unit lock reads `EXISTS (SELECT 1 FROM measurement WHERE variable_id = …)` inside the same transaction as the update, with the variable row locked (`FOR UPDATE`) so a save cannot slip in between.

**API surface**:

| Route | Method | Body | Returns | Auth | Errors |
|---|---|---|---|---|---|
| `/api/experiments/{id}/variables` | POST | `VariableIn` | `VariableDetail`, 201 | session | 401, 404 `experiment_not_found`, 409 `variables_full` or `experiment_closed`, 422 `duplicate_variable_name`, `invalid_range`, `invalid_request` |
| `/api/variables/{id}` | PUT | `VariableIn` | `VariableDetail` | session | 401, 404 `variable_not_found`, 409 `unit_locked` or `experiment_closed`, 422 as above |
| `/api/experiments/{id}/variables/delete` | POST | `{ variable_ids: int[] }` (1 to 12, unique, all in this notebook) | `{ variables, measurements, trials }` deleted counts | session | 401, 404 `experiment_not_found` or `variable_not_found`, 409 `last_variable` or `experiment_closed`, 422 `invalid_request` |

`VariableDetail` (spec 0005) gains `aliases`, so the edit form shows the current other names; the field is additive. `VariableIn` is spec 0005's `NewVariable` plus `aliases: list[str]` (at most 8, each 1 to 40 characters after stripping, blanks dropped, unique ignoring case). The rules live in `services/experiment_rules.py` next to the create rules, so both paths share one implementation; the web mirrors the limits in `lib/experiment-form.ts`. Every write logs `variable added`, `variable updated`, or `variables deleted` at INFO with the experiment id, the variable ids, the holder, and the counts (never names).

**Web structure**:
- `web/src/api/experiments.ts`: `addVariable`, `updateVariable`, `deleteVariables` on the existing result union.
- `web/src/hooks/use-experiments.ts`: one mutation each, all invalidating `experimentKeys.all` on success.
- `web/src/lib/variable-form.ts` (pure): a one variable form state, `validateVariable` reusing the create form's `MESSAGES` and `LIMITS`, `toVariableIn`, `parseAliases`, `savedValueCounts(trials)`, and the confirmation text.
- `web/src/components/notebooks/variables-dialog.tsx`: the dialog, its list with checkboxes, the inline row form, the selection bar, and the confirmation. `NotebookInspector`'s "Revisar variables" becomes its trigger.

**Value sourcing**:

| Shown | Source |
|---|---|
| The list, the forms' current values | `experiment.variables` (spec 0005) |
| "{n} valores", the unit lock hint, the confirmation count | the trials query (spec 0010), counted per variable; the API checks again |
| "Eliminé …" | the counts the delete route returns |

**Key invariants**:
- A saved value always keeps the unit it was saved in: no route changes the unit of a variable with measurements.
- A notebook always has between 1 and 12 variables.
- Deleting variables never leaves a trial with no values, and never touches another notebook's rows.
- Names stay unique in a notebook ignoring case (the `lower(name)` index is the backstop).

**Security model**: behind the access gate; every code holder may edit every open notebook (spec 0002, no ownership). Ids from the body are checked to belong to the notebook in the path. Text is rendered as text.

**Critical test scenarios**:
- API: add goes last and refuses the 13th; edit renames, sets and clears a range, and refuses a duplicate name or min above max; a unit change with saved values is 409 `unit_locked`, without values it works; delete removes the values, the empty trials, and the variables, and returns the counts; deleting every variable is 409 `last_variable`; an id from another notebook is 404; a pending card loses only the deleted variable's value; a closed notebook refuses all three; no session 401, verifies **AC-2** to **AC-8**
- Web: the dialog lists the variables with their counts; add, edit, and cancel; field errors and focus; the unit locked hint; select some, select all disables, the confirmation text with the count, confirm and the status line; an API error keeps the form; Escape returns focus; axe in the four states, verifies **AC-1** to **AC-9**

## Build plan

1. API: `VariableIn` and its rules, `repositories/variables.py`, the three routes, tests; `make openapi`, satisfies **AC-2** to **AC-8**
2. Web: `lib/variable-form.ts` with unit tests, the three calls and mutations, satisfies **AC-4**, **AC-7**
3. Web: `variables-dialog.tsx` and the "Revisar variables" trigger, tests and axe, satisfies **AC-1** to **AC-3**, **AC-5**, **AC-6**, **AC-9**

## Consequences

**Positive**: a notebook can be fixed after it is created; deleting is explicit about what it costs; saved numbers never change meaning.

**Negative / tradeoffs**: a deleted variable's values cannot be brought back (the confirmation says so); changing the unit of a used variable needs a new variable.

## Follow-up

- [ ] Reorder variables (drag or up and down), which today follows creation order.
- [ ] Spec 0005: note that variables can change after creation (`/sync`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
