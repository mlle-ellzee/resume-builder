/**
 * Job descriptions sent from Claude chat through the connector, kept in Redis
 * (Upstash, added through Vercel) for 30 days.
 */
import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";

export interface JobDraft {
  id: string;
  company: string;
  role: string;
  jobDescription: string;
  /** Short notes from the chat about fit, shown in the app. */
  notes: string;
  createdAt: number;
  /** The most recent resume generated for this job. */
  lastResume?: { url: string; at: number };
}

const TTL_SECONDS = 60 * 60 * 24 * 30;
const INDEX = "drafts";
const key = (id: string) => `draft:${id}`;

export function draftsEnabled(): boolean {
  return !!(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

let client: Redis | null = null;
function redis(): Redis {
  if (!draftsEnabled()) throw new Error("Draft storage isn't set up. Add a Redis database to the Vercel project.");
  client ??= Redis.fromEnv();
  return client;
}

/** Draft IDs are short so Claude can copy the link exactly. */
const ID_RE = /^[a-z0-9]{10}$/;
function newId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function createDraft(input: Omit<JobDraft, "id" | "createdAt">): Promise<JobDraft> {
  const draft: JobDraft = { ...input, id: newId(), createdAt: Date.now() };
  const r = redis();
  await r.set(key(draft.id), draft, { ex: TTL_SECONDS });
  await r.zadd(INDEX, { score: draft.createdAt, member: draft.id });
  await r.zremrangebyscore(INDEX, 0, Date.now() - TTL_SECONDS * 1000);
  return draft;
}

export async function getDraft(id: string): Promise<JobDraft | null> {
  if (!ID_RE.test(id)) return null;
  return (await redis().get<JobDraft>(key(id))) ?? null;
}

export async function listDrafts(limit = 25): Promise<JobDraft[]> {
  const r = redis();
  const ids = await r.zrange<string[]>(INDEX, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const drafts = await r.mget<(JobDraft | null)[]>(...ids.map(key));
  const gone = ids.filter((_, i) => !drafts[i]);
  if (gone.length) await r.zrem(INDEX, ...gone);
  return drafts.filter((d): d is JobDraft => !!d);
}

/** Record the latest resume for a job, keeping the job's original 30-day expiry. */
export async function markResumeMade(id: string, url: string): Promise<void> {
  const draft = await getDraft(id);
  if (!draft) return;
  await redis().set(key(id), { ...draft, lastResume: { url, at: Date.now() } }, { keepTtl: true });
}

export async function deleteDraft(id: string): Promise<void> {
  if (!ID_RE.test(id)) return;
  const r = redis();
  await r.del(key(id));
  await r.zrem(INDEX, id);
}
