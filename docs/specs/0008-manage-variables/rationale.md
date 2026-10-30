# 0008 rationale: review, add, edit, and delete variables

**Why a dialog**: the side panel is 22rem wide and the list needs a checkbox, six columns, and an inline form. "Tabla completa" already opens a dialog (spec 0007, AC-8), so "Revisar variables" doing the same keeps the panel's two quick actions alike.

**Deleting values with the variable**: decided with the team. A variable created by mistake and already used would otherwise stay forever. The confirmation names the variables and the number of values, and says it cannot be undone, which is the one extra step a destructive action needs.

**Locking the unit**: values are stored in the variable's unit (spec 0006). Changing °C to K without converting would relabel every saved number; converting would rewrite measured data and only works for the few conversions code knows. Locking it once a value exists is the only option that never changes what a saved number means. Name, range, required, and other names do not change what a number means, so they stay editable; a range change simply moves the flags (spec 0006 derives them).

**Counts from the trials query**: the panel already loads every trial's cells (spec 0010), so the dialog counts values per variable from that cache instead of adding a read route. The API counts again inside each write, so a stale count can only make the dialog's hint late, never let a locked unit change.

**Empty trials go too**: spec 0006's undo deletes a trial left with no values. Doing the same here keeps the table free of rows that hold nothing.
