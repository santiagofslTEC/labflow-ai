import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/access";
import { serverClient } from "@/lib/supabase/server";

// Google and Supabase's email links come back here with a one time code, traded
// for a session on this device (spec 0014, AC-1 to AC-3). A failure goes back to
// /access with a reason the page explains.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const supabase = await serverClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const reason = searchParams.has("error") ? "google" : "link";
  return NextResponse.redirect(new URL(`/access?error=${reason}`, origin));
}
