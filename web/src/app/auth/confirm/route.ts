import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/access";
import { serverClient } from "@/lib/supabase/server";

const TYPES: readonly EmailOtpType[] = [
  "signup",
  "recovery",
  "email",
  "email_change",
  "invite",
  "magiclink",
];

const isOtpType = (raw: string | null): raw is EmailOtpType =>
  TYPES.some((type) => type === raw);

// Email links built with {{ .TokenHash }} (Supabase's email templates) land
// here; unlike the code flow they also work when opened on another device.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const supabase = await serverClient();
  if (tokenHash && isOtpType(type) && supabase) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      const next =
        type === "recovery"
          ? "/access/nueva-contrasena"
          : safeNextPath(searchParams.get("next"));
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/access?error=link", origin));
}
