import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { authUrl } from "@/lib/google";
import { redirectUri } from "@/lib/http";

export async function GET(req: NextRequest) {
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state, redirectUri(req.nextUrl.origin)));
  res.cookies.set("rb_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
