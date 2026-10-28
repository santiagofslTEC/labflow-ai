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
