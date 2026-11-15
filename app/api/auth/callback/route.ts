import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, HttpError } from "@/lib/google";
import { redirectUri } from "@/lib/http";
import { saveSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const home = new URL("/", req.nextUrl.origin);
  const fail = (msg: string) => {
    home.searchParams.set("error", msg);
    return NextResponse.redirect(home);
  };
  const { searchParams } = req.nextUrl;
  if (searchParams.get("error")) return fail("Google sign-in was cancelled.");
  const state = req.cookies.get("rb_state")?.value;
  if (!state || state !== searchParams.get("state")) return fail("Sign-in expired. Please try again.");
  try {
    const session = await exchangeCode(searchParams.get("code") ?? "", redirectUri(req.nextUrl.origin));
    await saveSession(session);
  } catch (e) {
    return fail(e instanceof HttpError ? e.message : "Sign-in failed.");
  }
  const next = req.cookies.get("rb_next")?.value;
  const dest = next && /^\/(?![\/\\])/.test(next) ? new URL(next, req.nextUrl.origin) : home;
  const res = NextResponse.redirect(dest);
  res.cookies.delete("rb_state");
  res.cookies.delete("rb_next");
  return res;
}
