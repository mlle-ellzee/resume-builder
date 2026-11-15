import { NextResponse } from "next/server";
import { HttpError } from "./google";

/** Run a route handler and turn thrown errors into JSON { error } responses. */
export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Something went wrong.";
    if (status >= 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export function redirectUri(origin: string): string {
  return `${process.env.APP_URL?.replace(/\/$/, "") || origin}/api/auth/callback`;
}
