# 0005. Notebooks: create, list, and open · rationale

The decision record behind [index.md](index.md).

## Context

LabFlow is a voice first lab notebook, but nothing can be dictated until a notebook exists. Today the database has the `experiment` and `variable` tables (spec 0002) and a seed script, yet no route creates or lists notebooks, the sidebar shows a placeholder, and features 6 (capture), 7 (trials table), and 20 (push to talk page) all assume a notebook to work in. The product doc asks for this as RF-01 (create with title, goal, and variables) and RF-02 (list and open, intact after a reload), checked by PA-01 and PA-08.

The forces: the demo is on Friday, October 30, so the slice must be small and dependable. The project builds Skateboard style, the thinnest usable whole first. Spec 0001 says the browser only talks to `/api/*` on its own origin and names TanStack Query as the data layer, which is not installed yet, so this feature sets the pattern every later screen copies. The variable setup feeds the AI directly: a clean unit like `°C` is what lets "grados" be normalized (RN-01), so the form shapes extraction quality. Users write decimals with a comma. The interface must look like a professional tool (the engineer's saved preference: Notion, Linear, Plane, ink buttons, hairlines, no "AI made" look) and work on a phone.

Two earlier specs already pin parts of the answer: spec 0004 fixes the routes (`/cuadernos`, `/cuadernos/nuevo`, `/cuadernos/[id]`) and the list's ordering by `last_activity_at`, and spec 0002 fixes the columns, limits, and the unique variable name rule.

## Options considered

### Option 1: Browser rendered pages on a shared TanStack Query cache, with a full page form

Three API routes. Each `/cuadernos` page is a client component reading through TanStack Query; one `["experiments"]` query feeds the list, the sidebar, and later the push to talk picker. The form is its own route, holding state in a typed reducer with a pure validator, and the API repeats the checks with Pydantic.

**Pros**:
- Follows spec 0001 (browser calls `/api/*`, TanStack Query) and the access gate's existing 401 redirect works as is.
- One cache keeps the sidebar and list in sync; a create invalidates once and both update. Refetch on focus is built in, which spec 0004 needs.
- The reducer and validator are pure functions, easy to unit test, and add no form library.

**Cons**:
- A skeleton shows on each first visit before data arrives.
- Validation limits are written twice (browser and API).

### Option 2: Server components that fetch the API during render

Next.js renders the list and notebook pages on the server, forwarding the session cookie to `API_URL`, and the form posts through a server action.

**Pros**:
- Content in the first paint, no loading skeleton.
- Less client JavaScript.

**Cons**:
- Breaks spec 0001's rule that the browser is the only caller of `/api/*`, and needs cookie forwarding plus a second error path for 401 on the server.
- The sidebar lives in the client shell, so it would still need a client fetch and a way to refresh after a create; two data paths for one list.
- Cache Components and partial prefetching are on in this Next.js 16 app, which adds caching rules to reason about for per session data.

### Option 3: A dialog form over the list, with a minimal list

"Nuevo cuaderno" opens a modal (as in Plane or HoneyBook) and the list shows only titles.

**Pros**:
- Fewer routes, quick to build.
- You never leave the list.

**Cons**:
- A table of up to 12 variable rows is cramped in a dialog, worst on a phone.
- Spec 0004 already gave the form its own route (`/cuadernos/nuevo`), which the push to talk picker links to.
- P1 asks for activity date, trial count, and status, which a titles only list drops.

## Rationale

Option 1 is the one that fits the forces without new rules. Spec 0001 already chose browser calls to `/api/*` and TanStack Query, and feature 19's 401 redirect lives in the browser client, so the access gate keeps working with no extra code. The sidebar is the deciding detail: it lives in the client shell on every page and must update the moment a notebook is created, which one shared query handles and server rendering does not, short of building two data paths for the same list. The cost, a short skeleton on first load, is invisible behind a login style gate where nothing is indexed.

The form choices follow the same "simple beats clever" line. A typed reducer with a pure validator needs no library, matches the project's functional rules, and can be fully unit tested; react-hook-form with zod would add two dependencies and a second schema that can drift from Pydantic. Validating fully in the browser means the one error shape `{code, message}` stays untouched: the API's 422s are a safety net with readable Spanish messages, not the main path, so there is no need for a field level error format that every other route would then have to follow. Free text units with suggestions steer users to canonical units (which the AI normalizes against) without blocking unusual ones like `rpm`. Accepting a decimal comma avoids the most common Spanish input error.

The rest is about the Friday demo. No editing, no reordering, and no aliases keep the slice small, and each can be added later without reworking what ships now. "Usar ejemplo" makes PA-01 a two click check and shows a new user what a good setup looks like. No migration means spec 0002's verified schema is untouched. A cap of 200 rows instead of pagination is a conscious tradeoff: a class project will not come close, and paging can be added to the same endpoint later without changing its shape for the first page.

**Smaller calls made in the spec** (pick, why, runner up):
- List size: return at most 200 rows, no pagination, because a class project stays far below it and the shape can grow a cursor later; runner up, cursor pagination now.
- Create backstop: catch the unique index violation and return `duplicate_variable_name`, because the pure check covers normal use and the index guarantees it; runner up, a `SELECT` before insert (racy).
- Activity text: `Intl.RelativeTimeFormat` with a switch to "12 oct" after a week, because relative times stop being useful past a few days; runner up, always relative.
- Retries: TanStack Query `retry: 1`, because one quick retry hides a blip without hiding a real outage; runner up, the library default of 3.
- Visual references (Mobbin): the list follows Basecamp's hairline rows with a meta line, the form follows Square's calm full page "New project", and both use the existing `design.md` tokens with no new colors.

## Update 2026-10-29: notebook from instructions

### Context

> ⚠️ Premise note: this update joins the MVP line one day before the Friday demo, while features 6, 7, and 20 are still open. A late feature that touches the database, a new model call, and file uploads at once is how a demo breaks. The answer here is the slicing, not a smaller idea: pasted text works end to end first (build tasks 7 to 10), and the PDF (task 11) only adds to routes that already work, so it can slip to after Friday without leaving anything half built.

Setting up a notebook by hand means reading the lab handout and typing every variable, unit, and range. Students already have that handout, usually as a PDF from the course, sometimes long (a whole manual with several practices). The product's promise is "no invented numbers", so anything read from the handout has to be traceable to its words, and the student has to review it before it counts. Feature 17 (questions about the protocol PDF) needs the same document later, with page numbers, to cite its answers. Capture (spec 0006) reads each sentence knowing only the variables; it has no idea what the experiment is about.

The forces: the stack is fixed (FastAPI and SQLModel on Supabase Postgres, Railway, Vercel rewriting `/api/*`, the `LLMProvider` chain with Ollama first and Claude as the logged fallback). Nothing in the code stores files or parses PDFs yet. Spec 0002 AC-15 already says protocols arrive as a new table. The engineer's saved preferences ask to confirm less and to have code check what the model says. The Claude key has an hourly cap of 30 calls. Vercel's rewrite sits between the browser and the API for every upload.

### Options considered

**A. Stateless read plus a multipart create (chosen)**. The read returns a proposal and stores nothing; the browser keeps the file and sends it again with the create, which saves everything in one transaction.
- Pros: no orphan uploads to clean up; one transaction means a notebook never exists without the instructions it was made from; the read can be retried or cancelled freely.
- Cons: the PDF crosses the network twice; the server extracts the text twice.

**B. Read saves a draft upload**. The read stores the file and returns a `draft_id` that the create points to.
- Pros: one upload; the create request is small.
- Cons: abandoned drafts pile up and need a cleanup job, which this project has no scheduler for; a draft table is one more state to reason about.

**C. Create, then attach**. Create stays JSON; a second call uploads the protocol.
- Pros: the simplest routes; the JSON create does not change.
- Cons: the second call can fail after the notebook exists, leaving a notebook with no instructions and a retry path to build.

**Storage**: `bytea` in Postgres (chosen) against a private Supabase Storage bucket (needs the service role key in Railway, a storage client, and a second write outside the transaction) and keeping only the text (feature 17 could never show or parse the original again).

**PDF library**: pypdf (chosen: pure Python, BSD license, no system packages on Railway) against PyMuPDF (better layout and speed, but AGPL or a paid license) and pdfplumber (strong on tables, slow on 80 pages).

**Model path**: the existing chain with its own timings (chosen) against Claude only (most reliable on long text, but every read spends the paid key and the hourly cap) and Ollama only (no fallback, so a bad read leaves only the blank form).

### Rationale

Option A wins on the force that matters most this week: nothing can be half saved. A read that stores nothing can fail, time out, or be cancelled with no cleanup, and the single transaction on create means the notebook and its instructions always agree. Uploading twice is a real cost on a phone, but at 10 MB and class scale it is seconds, and it is far cheaper than a cleanup job or a retry path for a half made notebook. A separate route (`/with-instructions`) instead of content negotiation on `POST /api/experiments` keeps one body type per route, which FastAPI's validation and the generated `openapi-fetch` types both expect; the runner up, one route reading either body, would need hand written parsing on both sides.

Postgres `bytea` reuses what is running: no new key, no new client, and the file is deleted with its notebook by the cascade that already exists. Supabase Storage is the better home at scale and is the move once files grow past class size. The strict code check on ranges is what makes the feature honest: the model can propose, but a number only reaches the form when its words are in the document, and the page comes from code. This is the same idea as spec 0006's said vs understood grounding, applied once at setup. Reading whole documents up to a cap and asking for a page range beyond it gives one model call with a predictable time, where chunking and merging would multiply calls against the Claude cap and add merge bugs.

**Smaller calls made in the spec** (pick, why, runner up):
- Contexto on every form, manual included: capture benefits from context whatever the source, and it costs one field; runner up, only on notebooks from instructions.
- The model may list up to 30 variables and code cuts to 12: so `found_count` is honest and the cut is code's, not the model's; runner up, ask the model for 12 directly (it would then hide what it dropped).
- `needs_pages` is a 200 result, not an error: it is an expected step of the flow, so it is a typed value per AGENTS.md; runner up, a 422 code.
- Store every page, not only the read range: feature 17 may need the rest of the manual; runner up, store only the read pages (smaller, but loses context).
- Quote line hides for good once you edit Mín or Máx: the quote then no longer describes the number; runner up, keep it and mark it changed.
- Replace confirm only when the form is dirty: a pristine form has nothing to lose, matching "confirm less"; runner up, always confirm.
- Hedge 20 s, deadline 45 s: Ollama gets a fair chance on a long read before Claude spends the cap, and 45 s stays well under any proxy timeout; runner up, spec 0006's 1.5 s hedge (would almost always spend Claude).
- Context sentences with an unfound number are removed, not the whole context: keeps the useful part; runner up, drop the whole context.
