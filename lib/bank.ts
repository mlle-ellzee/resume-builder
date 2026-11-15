import type { Bank, Bullet, Job, Recipe, Variant, VariantType } from "./types";

/** Tab names in the bullet-bank Google Sheet. */
export const TABS = ["Bullets", "Variants", "Jobs", "Recipes", "Rules"] as const;

type Rows = string[][];

const splitList = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const isActive = (s: string | undefined) => {
  const v = (s ?? "").trim().toLowerCase();
  return v === "" || v === "y" || v === "yes" || v === "true";
};

/** Turn a tab's rows into objects keyed by lower-cased header text. */
function records(rows: Rows | undefined): Record<string, string>[] {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

/** Look up a column by any of several header spellings. */
function col(r: Record<string, string>, ...names: string[]): string {
  for (const n of names) if (r[n] !== undefined) return r[n];
  return "";
}

function normType(s: string): VariantType | null {
  const v = s.trim().toLowerCase();
  if (v === "tagline") return "Tagline";
  if (v === "summary") return "Summary";
  if (v === "skills" || v === "skill") return "Skills";
  return null;
}

export function parseBank(tabs: Partial<Record<(typeof TABS)[number], Rows>>): Bank {
  const bullets: Bullet[] = records(tabs.Bullets)
    .filter((r) => col(r, "id"))
    .map((r) => ({
      id: col(r, "id"),
      text: col(r, "bullet", "text"),
      tags: splitList(col(r, "skills/tags", "tags", "skills")),
      depth: col(r, "depth").toLowerCase(),
      emphasis: col(r, "emphasis"),
      job: col(r, "job"),
      excludes: splitList(col(r, "excludes")),
      active: isActive(col(r, "active", "active (y/n)")),
    }));

  const variants: Variant[] = [];
  for (const r of records(tabs.Variants)) {
    const type = normType(col(r, "type"));
    if (!col(r, "id") || !type) continue;
    variants.push({
      id: col(r, "id"),
      type,
      text: col(r, "text"),
      notes: col(r, "notes"),
      active: isActive(col(r, "active")),
    });
  }

  const jobs: Job[] = records(tabs.Jobs)
    .filter((r) => col(r, "job"))
    .map((r) => ({
      name: col(r, "job"),
      employer: col(r, "employer in template", "employer"),
      min: Number(col(r, "min bullets", "min")) || 1,
      max: Number(col(r, "max bullets", "max")) || 99,
    }));

  const recipeMap = new Map<string, Recipe>();
  for (const r of records(tabs.Recipes)) {
    const name = col(r, "recipe");
    const part = col(r, "part");
    if (!name || !part) continue;
    const rec = recipeMap.get(name) ?? { name, parts: {}, notes: "" };
    rec.parts[part] = splitList(col(r, "ids"));
    if (col(r, "notes")) rec.notes = col(r, "notes");
    recipeMap.set(name, rec);
  }

  const rules = records(tabs.Rules)
    .map((r) => col(r, "rule"))
    .filter(Boolean);

  return { bullets, variants, jobs, recipes: [...recipeMap.values()], rules };
}

/** Problems with the bank itself (bad references), shown on the review screen. */
export function bankProblems(bank: Bank): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const b of bank.bullets) {
    if (ids.has(b.id)) problems.push(`Bullet ID ${b.id} appears more than once on the Bullets tab.`);
    ids.add(b.id);
  }
  const jobNames = new Set(bank.jobs.map((j) => j.name));
  for (const b of bank.bullets) {
    if (!jobNames.has(b.job)) problems.push(`${b.id} has Job "${b.job}", which is not on the Jobs tab.`);
    for (const e of b.excludes) if (!ids.has(e)) problems.push(`${b.id} excludes ${e}, which is not a bullet ID.`);
  }
  return problems;
}

/** Excludes treated as two-way: id -> set of IDs it can't appear with. */
export function conflictMap(bank: Bank): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const b of bank.bullets)
    for (const e of b.excludes) {
      add(b.id, e);
      add(e, b.id);
    }
  return m;
}

/** "Operations: contracts, ..." -> "Operations". Empty if there is no colon. */
export function skillLabel(text: string): string {
  const i = text.indexOf(":");
  return i > 0 ? text.slice(0, i).trim() : "";
}
