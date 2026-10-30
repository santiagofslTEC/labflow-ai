# 0009 rationale: results page

**Why now**: "Ver resultados" is in the notebook header and does nothing useful. The team chose all three pieces (chart, summary, best trial) and a page of its own.

**Page vs dialog**: the other quick actions open dialogs because they are small lists. A chart needs width to be read, and the selections are worth keeping in a link a student can reload or send to a teammate.

**SQL for the summary**: spec 0001 decided that exact aggregates (max, min, average, count) run as SQL that returns the source trial with the number. Doing it here first gives feature 10 (questions about the data) a tested route to call, instead of a browser copy of the same math.

**Best trial reuses the summary**: picking the best trial is the max or min with its trials. Taking it from `max_trials` or `min_trials` means the summary and the best trial can never name different trials; ties resolve to the lowest trial number and the rest are listed.

**Plotly basic bundle**: spec 0001 chose Plotly for its zoom and hover. The basic distribution has scatter plots and is about a third of the full bundle. Loading it with `next/dynamic` on this page only keeps the notebook page as light as it is.

**Points, not a fitted line**: a fitted line is a model of the data, not the data. It can come later, clearly labeled; the first chart shows only what was measured.
