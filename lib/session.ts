import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";

export interface Session {
  email: string;
  refreshToken: string;
  accessToken: string;
  /** Epoch ms when accessToken expires. */
  expiresAt: number;
}

export interface Settings {
  templateId: string;
  templateName: string;
  sheetId: string;
  sheetName: string;
}

const SESSION_COOKIE = "rb_session";
const SETTINGS_COOKIE = "rb_settings";
const YEAR = 60 * 60 * 24 * 365;

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

async function seal(data: object, maxAge: number): Promise<string> {
  return new EncryptJWT({ d: data })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .encrypt(key());
}

async function unseal<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key());
    return (payload.d as T) ?? null;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function getSession(): Promise<Session | null> {
  return unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function saveSession(s: Session): Promise<void> {
  // 30 days; Google's refresh token keeps working as long as the OAuth app is in production.
  const maxAge = 60 * 60 * 24 * 30;
  (await cookies()).set(SESSION_COOKIE, await seal(s, maxAge), cookieOptions(maxAge));
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSettings(): Promise<Settings | null> {
  const fromCookie = await unseal<Settings>((await cookies()).get(SETTINGS_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  // Optional defaults from the environment.
  const templateId = process.env.TEMPLATE_DOC_ID;
  const sheetId = process.env.BANK_SHEET_ID;
  if (templateId && sheetId) return { templateId, sheetId, templateName: "Template", sheetName: "Bullet bank" };
  return null;
}

export async function saveSettings(s: Settings): Promise<void> {
  (await cookies()).set(SETTINGS_COOKIE, await seal(s, YEAR), cookieOptions(YEAR));
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
