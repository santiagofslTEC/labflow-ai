import createClient, { type Middleware } from "openapi-fetch";

import { ACCESS_PATH, accessPathFor } from "@/lib/access";

import type { paths } from "./schema";

// A 401 from any route but /api/access means the session is gone (expired or
// revoked): send the browser to /access, then back here once the code is in.
export const redirectOnUnauthorized: Middleware = {
  onResponse({ request, response }) {
    if (response.status !== 401 || typeof window === "undefined") {
      return response;
    }
    const { pathname } = new URL(request.url, window.location.origin);
    if (pathname !== `/api${ACCESS_PATH}`) {
      const { pathname: page, search } = window.location;
      window.location.assign(accessPathFor(`${page}${search}`));
    }
    return response;
  },
};

// Same origin: Next.js rewrites /api/* to FastAPI, so the access cookie just works.
export const api = createClient<paths>({ baseUrl: "" });
api.use(redirectOnUnauthorized);
