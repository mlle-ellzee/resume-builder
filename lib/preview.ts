import type { Bank, Selection } from "./types";

export interface PreviewOptions {
  company?: string;
  role?: string;
  /** Put each item's bank ID in brackets after it, for discussing swaps. */
  includeIds?: boolean;
}

/** The current draft as plain text, in resume order, for pasting into a chat. */
export function draftText(bank: Bank, sel: Selection, opts: PreviewOptions = {}): string {
  const bullets = new Map(bank.bullets.map((b) => [b.id, b.text]));
  const variants = new Map(bank.variants.map((v) => [v.id, v.text]));
  const tag = (id: string) => (opts.includeIds ? ` [${id}]` : "");
  const lines: string[] = [];

  const target = [opts.role?.trim(), opts.company?.trim()].filter(Boolean).join(" at ");
  lines.push(target ? `Resume draft for ${target}` : "Resume draft", "");

  if (sel.tagline) lines.push("TAGLINE", (variants.get(sel.tagline.id) ?? "") + tag(sel.tagline.id), "");
  if (sel.summary) lines.push("SUMMARY", (variants.get(sel.summary.id) ?? "") + tag(sel.summary.id), "");

  lines.push("WORK EXPERIENCE");
  for (const job of bank.jobs) {
    const picks = sel.jobs[job.name] ?? [];
    lines.push("", job.employer || job.name);
    for (const p of picks) lines.push(`- ${bullets.get(p.id) ?? p.id}${tag(p.id)}`);
  }
  lines.push("");

  if (sel.skills.length) {
    lines.push("SKILLS");
    for (const p of sel.skills) lines.push((variants.get(p.id) ?? p.id) + tag(p.id));
  }

  return lines.join("\n").trimEnd() + "\n";
}
