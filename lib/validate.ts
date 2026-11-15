import { conflictMap, skillLabel } from "./bank";
import type { Bank, Pick, Selection } from "./types";

export interface Issue {
  /** Section the issue is in: "Tagline", "Summary", "Skills", or a job name. */
  where: string;
  message: string;
  /** True if the doc can't be generated until this is fixed. */
  blocking: boolean;
}

/** Every rule the app enforces in code. The review screen shows these live. */
export function checkSelection(bank: Bank, sel: Selection): Issue[] {
  const issues: Issue[] = [];
  const bullets = new Map(bank.bullets.map((b) => [b.id, b]));
  const variants = new Map(bank.variants.map((v) => [v.id, v]));
  const conflicts = conflictMap(bank);

  for (const [part, pick] of [
    ["Tagline", sel.tagline],
    ["Summary", sel.summary],
  ] as const) {
    if (!pick) {
      issues.push({ where: part, message: `No ${part.toLowerCase()} chosen.`, blocking: true });
      continue;
    }
    const v = variants.get(pick.id);
    if (!v || v.type !== part) issues.push({ where: part, message: `${pick.id} is not a ${part} on the Variants tab.`, blocking: true });
  }

  const labels = new Map<string, string>();
  for (const p of sel.skills) {
    const v = variants.get(p.id);
    if (!v || v.type !== "Skills") {
      issues.push({ where: "Skills", message: `${p.id} is not a Skills line on the Variants tab.`, blocking: true });
      continue;
    }
    const label = skillLabel(v.text);
    if (label && labels.has(label))
      issues.push({ where: "Skills", message: `${p.id} and ${labels.get(label)} are both "${label}" lines. Keep one.`, blocking: true });
    else if (label) labels.set(label, p.id);
  }
  if (sel.skills.length === 0) issues.push({ where: "Skills", message: "No skills lines chosen.", blocking: false });

  const seen = new Map<string, string>();
  const all: string[] = [];
  for (const job of bank.jobs) {
    const picks = sel.jobs[job.name] ?? [];
    for (const p of picks) {
      const b = bullets.get(p.id);
      if (!b) {
        issues.push({ where: job.name, message: `${p.id} is not on the Bullets tab.`, blocking: true });
        continue;
      }
      if (b.job !== job.name)
        issues.push({ where: job.name, message: `${p.id} belongs to ${b.job}, not ${job.name}.`, blocking: true });
      if (!b.active) issues.push({ where: job.name, message: `${p.id} is marked inactive.`, blocking: false });
      if (seen.has(p.id)) issues.push({ where: job.name, message: `${p.id} is used twice.`, blocking: true });
      seen.set(p.id, job.name);
      all.push(p.id);
    }
    if (picks.length < job.min || picks.length > job.max)
      issues.push({
        where: job.name,
        message: `${picks.length} bullets; the Jobs tab allows ${job.min} to ${job.max}.`,
        blocking: false,
      });
  }
  for (const job of Object.keys(sel.jobs))
    if (!bank.jobs.some((j) => j.name === job))
      issues.push({ where: job, message: `"${job}" is not on the Jobs tab.`, blocking: true });

  const reported = new Set<string>();
  for (const a of all)
    for (const b of all) {
      if (a === b || !conflicts.get(a)?.has(b)) continue;
      const key = [a, b].sort().join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({ where: seen.get(a)!, message: `${a} and ${b} can't be used together (Excludes).`, blocking: true });
    }

  return issues;
}

/**
 * Fix what can be fixed without judgment: drop unknown, wrong-job, inactive and
 * duplicate bullets, and drop the later bullet of any conflicting pair (Claude
 * lists bullets in priority order). Returns notes describing each change.
 */
export function repairSelection(bank: Bank, sel: Selection): { selection: Selection; changes: string[] } {
  const changes: string[] = [];
  const bullets = new Map(bank.bullets.map((b) => [b.id, b]));
  const variants = new Map(bank.variants.map((v) => [v.id, v]));
  const conflicts = conflictMap(bank);
  const kept = new Set<string>();
  const jobs: Record<string, Pick[]> = {};

  for (const job of bank.jobs) {
    jobs[job.name] = [];
    for (const p of sel.jobs[job.name] ?? []) {
      const b = bullets.get(p.id);
      let why = "";
      if (!b) why = "it isn't on the Bullets tab";
      else if (b.job !== job.name) why = `it belongs to ${b.job}`;
      else if (!b.active) why = "it is marked inactive";
      else if (kept.has(p.id)) why = "it was already used";
      else {
        const clash = [...kept].find((k) => conflicts.get(p.id)?.has(k));
        if (clash) why = `it can't be used with ${clash}`;
      }
      if (why) {
        changes.push(`Removed ${p.id} from ${job.name}: ${why}.`);
        continue;
      }
      kept.add(p.id);
      jobs[job.name].push(p);
    }
  }

  const skills: Pick[] = [];
  const labels = new Set<string>();
  for (const p of sel.skills) {
    const v = variants.get(p.id);
    if (!v || v.type !== "Skills" || !v.active) {
      changes.push(`Removed skills line ${p.id}: not an active Skills line.`);
      continue;
    }
    const label = skillLabel(v.text);
    if (label && labels.has(label)) {
      changes.push(`Removed skills line ${p.id}: another "${label}" line was already chosen.`);
      continue;
    }
    if (label) labels.add(label);
    skills.push(p);
  }

  const okVariant = (p: Pick | null, type: string) => {
    if (!p) return null;
    const v = variants.get(p.id);
    if (v && v.type === type && v.active) return p;
    changes.push(`Cleared ${type.toLowerCase()} ${p.id}: not an active ${type} on the Variants tab.`);
    return null;
  };

  return {
    selection: {
      tagline: okVariant(sel.tagline, "Tagline"),
      summary: okVariant(sel.summary, "Summary"),
      skills,
      jobs,
    },
    changes,
  };
}
