import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_PATH, accessPathFor, SESSION_COOKIE } from "@/lib/access";
import { supabaseConfig } from "@/lib/supabase/config";

type CookieToSet = {
  readonly name: string;
  readonly value: string;
  readonly options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

// Pages anyone may open: the sign in pages and the links in Supabase's emails.
export const isPublicPath = (pathname: string): boolean =>
  pathname === ACCESS_PATH ||
  pathname.startsWith(`${ACCESS_PATH}/`) ||
  pathname.startsWith("/auth/");

// Every page and /api request (spec 0014, AC-4):
// - refreshes the Supabase session, if any, writing its cookies back;
// - sends a page with neither a Supabase session nor a code cookie to /access
//   (presence only for the code cookie, spec 0001: the API checks it);
// - forwards /api requests with the account's access token as a bearer header,
//   and never with one the browser sent.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const auth = supabaseConfig();
  const refreshed: CookieToSet[] = [];
  let signedIn = false;
  let accessToken: string | null = null;

  if (auth) {
    const supabase = createServerClient(auth.url, auth.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const cookie of toSet) {
            request.cookies.set(cookie.name, cookie.value);
            refreshed.push(cookie);
          }
        },
      },
    });
    // getClaims checks the token's signature and refreshes it when it expired.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
    if (signedIn && isApi) {
      const { data: current } = await supabase.auth.getSession();
      accessToken = current.session?.access_token ?? null;
    }
  }

  const withCookies = (response: NextResponse) => {
    for (const { name, value, options } of refreshed)
      response.cookies.set(name, value, options);
    return response;
  };

  if (
    !isApi &&
    !isPublicPath(pathname) &&
    !signedIn &&
    !request.cookies.has(SESSION_COOKIE)
  ) {
    return withCookies(
      NextResponse.redirect(
        new URL(accessPathFor(`${pathname}${search}`), request.url),
      ),
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("authorization");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return withCookies(NextResponse.next({ request: { headers } }));
}

// Pages and /api; never Next's assets, the manifest, or the icons, which must
// load on /access too.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|brand/).*)",
  ],
};
