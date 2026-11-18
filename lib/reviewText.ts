import { conflictMap } from "./bank";
import type { ReviewSnapshot } from "./drafts";
import { draftText } from "./preview";

/** What Claude chat sees when it reads the current draft through the connector. */
export function reviewForChat(r: ReviewSnapshot, now = Date.now()): string {
  const { bank, selection: sel, report } = r;
  const conflicts = conflictMap(bank);
  const used = new Set([
    ...Object.values(sel.jobs).flat().map((p) => p.id),
    ...sel.skills.map((p) => p.id),
    sel.tagline?.id ?? "",
    sel.summary?.id ?? "",
  ]);
  const mins = Math.max(0, Math.round((now - r.updatedAt) / 60000));
  const age = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;

  const out: string[] = [];
  out.push(
    `This is the resume draft currently open on the Resume Builder review screen (last changed ${age}, ${new Date(r.updatedAt).toISOString()}).`,
    "Every item is used word for word from the person's bank; IDs are in brackets. Suggest changes as swaps, removals, additions or reordering by ID. The person makes the changes in the app.",
    "",
    draftText(bank, sel, { company: r.company, role: r.role, includeIds: true }).trimEnd(),
  );

  for (const job of bank.jobs) {
    const picks = sel.jobs[job.name] ?? [];
    out.push("", `${job.name}: ${picks.length} bullets (allowed ${job.min} to ${job.max}).`);
  }

  const ordering = Object.entries(report.ordering ?? {}).filter(([, v]) => v);
  if (ordering.length) {
    out.push("", "What the opening bullets are meant to establish (from the bullet picker):");
    for (const [job, why] of ordering) out.push(`- ${job}: ${why}`);
  }
  if (report.gaps.length) {
    out.push("", "Requirements the bank doesn't cover well:");
    for (const g of report.gaps) out.push(`- ${g}`);
  }
  if (report.notes) out.push("", `Picker's notes: ${report.notes}`);

  out.push("", "Bullets in the bank not currently used, by job. Bullets that exclude each other are versions of the same material and can't be used together:");
  for (const job of bank.jobs) {
    const unused = bank.bullets.filter((b) => b.job === job.name && b.active && !used.has(b.id));
    if (!unused.length) continue;
    out.push("", `${job.employer || job.name} (${job.name}):`);
    for (const b of unused) {
      const meta = [b.depth, b.emphasis && `emphasis: ${b.emphasis}`, conflicts.get(b.id)?.size && `excludes ${[...conflicts.get(b.id)!].join(", ")}`]
        .filter(Boolean)
        .join("; ");
      out.push(`- [${b.id}]${meta ? ` (${meta})` : ""} ${b.text}`);
    }
  }

  for (const type of ["Tagline", "Summary", "Skills"] as const) {
    const unused = bank.variants.filter((v) => v.type === type && v.active && !used.has(v.id));
    if (!unused.length) continue;
    out.push("", `Other ${type.toLowerCase()} options:`);
    for (const v of unused) out.push(`- [${v.id}] ${v.text}`);
  }
  if (bank.rules.length) {
    out.push("", "The person's rules:");
    for (const rule of bank.rules) out.push(`- ${rule}`);
  }
  return out.join("\n") + "\n";
}
