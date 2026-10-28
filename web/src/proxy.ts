import { type NextRequest, NextResponse } from "next/server";

import { accessPathFor, SESSION_COOKIE } from "@/lib/access";

// Presence check only (spec 0001): no cookie, go to /access. A bad or revoked
// cookie passes here, then the API answers 401 and the client redirects.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(
    new URL(accessPathFor(`${pathname}${search}`), request.url),
  );
}

// Pages only: the API answers its own 401s, and assets must load on /access.
export const config = {
  matcher: [
    "/((?!api/|access|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|brand/).*)",
  ],
};
