import createClient from "openapi-fetch";

import type { paths } from "./schema";

// Same origin: Next.js rewrites /api/* to FastAPI, so the access cookie just works.
export const api = createClient<paths>({ baseUrl: "" });
