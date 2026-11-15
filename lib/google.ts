import { parseBank, TABS } from "./bank";
import type { DocsDocument, DocsRequest } from "./docgen";
import { allowedEmails, getSession, saveSession, type Session } from "./session";
import type { Bank } from "./types";

export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  return { id, secret };
}

export function authUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: clientCreds().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new HttpError(401, json.error_description || json.error || "Google sign-in failed.");
  return json;
}

/** Finish sign-in. The ID token comes straight from Google's token endpoint over TLS, so its claims can be read directly. */
export async function exchangeCode(code: string, redirectUri: string): Promise<Session> {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.id_token || !t.refresh_token) throw new HttpError(401, "Google didn't return the expected tokens. Try signing in again.");
  const claims = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString("utf8"));
  const email = String(claims.email ?? "").toLowerCase();
  if (!claims.email_verified || !allowedEmails().includes(email))
    throw new HttpError(403, `${email || "That account"} isn't allowed to use this app.`);
  return { email, refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
}

/** The signed-in, allowed user's session with a fresh access token, or a 401. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s || !allowedEmails().includes(s.email)) throw new HttpError(401, "Please sign in.");
  if (s.expiresAt - Date.now() > 60_000) return s;
  try {
    const t = await tokenRequest({ refresh_token: s.refreshToken, grant_type: "refresh_token" });
    const next = { ...s, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
    await saveSession(next);
    return next;
  } catch {
    throw new HttpError(401, "Your Google sign-in expired. Please sign in again.");
  }
}

async function g<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `Google API error ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error?.message ?? msg;
    } catch {}
    if (res.status === 404 || res.status === 403)
      msg = msg.replace(/\.+$/, "") + ". If this is the template or bullet bank, pick it again in Settings so the app has access.";
    throw new HttpError(res.status === 401 ? 401 : 502, msg);
  }
  return (await res.json()) as T;
}

export async function fileName(token: string, id: string): Promise<string> {
  const f = await g<{ name: string }>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name`);
  return f.name;
}

export async function readBank(token: string, sheetId: string): Promise<Bank> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const meta = await g<{ sheets: { properties: { title: string } }[] }>(token, `${base}?fields=sheets.properties.title`);
  const titles = new Set(meta.sheets.map((s) => s.properties.title));
  const present = TABS.filter((t) => titles.has(t));
  if (!present.includes("Bullets")) throw new HttpError(400, 'The bullet bank Sheet has no "Bullets" tab.');
  const qs = present.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&");
  const data = await g<{ valueRanges: { values?: string[][] }[] }>(
    token,
    `${base}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`,
  );
  const tabs: Record<string, string[][]> = {};
  present.forEach((t, i) => (tabs[t] = data.valueRanges[i]?.values ?? []));
  return parseBank(tabs);
}

export async function appendRows(token: string, sheetId: string, tab: string, rows: string[][]): Promise<void> {
  const range = encodeURIComponent(`'${tab}'!A:F`);
  await g(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: rows }) },
  );
}

export async function copyFile(token: string, id: string, name: string): Promise<{ id: string; webViewLink: string }> {
  return g(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/copy?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getDoc(token: string, id: string): Promise<DocsDocument> {
  return g(token, `https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}`);
}

export async function batchUpdateDoc(token: string, id: string, requests: DocsRequest[], revisionId?: string): Promise<void> {
  if (!requests.length) return;
  await g(token, `https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests, ...(revisionId ? { writeControl: { requiredRevisionId: revisionId } } : {}) }),
  });
}
