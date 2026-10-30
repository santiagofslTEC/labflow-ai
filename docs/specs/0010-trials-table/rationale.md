# 0010 rationale: trials table, recent measurements, and CSV export

**Why now**: the side panel already draws the table, the recent list, and the export, so students see controls that never fill in even after they save. Features 7 and 16 are the smallest change that makes everything visible in the panel work.

**One route vs two**: the table and the recent list come from the same rows and are always shown together, so one request is enough. Two routes would add a request and a second loading state for five items.

**Server ordering**: spec 0005 already decided that the API orders lists and the browser never resorts them, so the notebook list and the sidebar never disagree. The same applies here, and to feature 9's chart later.

**Dot decimals in the CSV**: the people reading it are in Mexico, where Excel's Spanish locale uses a dot decimal. A comma decimal would need quotes around every value and would still be read as text in that locale. The screen keeps comma decimals through `formatQuantity`, the rule every number on screen follows.

**No pagination**: tens of trials per notebook. A cap or paging would add states (load more, partial CSV) for a size we do not expect; revisit past 500 trials.
