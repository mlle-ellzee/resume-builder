import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { conflictMap } from "./bank";
import type { Bank, Pick, SelectResult, Selection } from "./types";
import { checkSelection, repairSelection } from "./validate";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM = `You choose resume content for one person from their bank of pre-written items. You pick items by ID. You never write, edit or reword resume text: your output is IDs, short reasons, and a match report.

How to choose:
- First identify the requirements in the job description that matter most for this hire (responsibilities, functional skills, domain, seniority and scope signals), roughly 6 to 12 of them, most important first.
- For each job, pick the bullets that give the strongest evidence for those requirements, within that job's minimum and maximum count. Use more bullets when the bank has relevant material for the role and fewer when the extra bullets would be filler.
- Bullets that exclude each other are versions of the same material. Exclusion works both ways: never pick two bullets where either one lists the other in Excludes. Use Depth and Emphasis to choose the version. Prefer a detailed version when that function is central to the role. Prefer a summary or combined version when the function is secondary but worth showing, or when it frees room for more relevant bullets.
- Only pick a bullet for the job listed in its Job field.
- Pick exactly one tagline, one summary, and a set of skills lines. Pick at most one skills line per label (the text before the colon). Follow the person's rules.
- Past recipes show what the person chose for earlier applications. Treat them as examples of their judgment, not as templates to copy.
- Each reason is one short sentence linking the item to something specific in the job description.

The person's notes:
- A request may include <person_notes>: the person's own thinking about this job, often from discussing the posting with Claude. They may say what to emphasize, which experience should lead, or how to order bullets.
- Treat the notes as informed input from the person, and weigh them together with your own reading of the posting. Follow them where they hold up. Where you depart from them, for example because a suggested bullet would break a rule or a stronger option exists, say so in the report notes.

Ordering bullets within each job:
- Recruiters and hiring managers often read only the first one or two bullets under each job. Order for that reader. Do not follow the order in which the posting lists its duties or requirements.
- First decide what this hiring manager most needs to believe about the person to move them forward: usually that they can do the core of the role, at the scope and level of ownership it calls for, plus anything that sets them apart from other applicants. The first two bullets under each job should make that case on their own.
- Lead with bullets that show ownership, scope, and results tied to the role's central function. Put supporting, routine, or narrower duties after them, even when the posting lists those first.
- In lead_rationale, state in one sentence what the first bullets are meant to establish for this role.

Match report:
- requirements: each important requirement, the picked IDs that cover it (only IDs you picked), and how well: strong, partial, or none.
- gaps: requirements that nothing in the bank covers well, written so the person can address them in a cover letter or a new bullet. Empty if there are none.
- notes: one to three sentences on trade-offs worth knowing, such as a strong bullet left out for space. Empty if there is nothing to add.`;

function bankText(bank: Bank): string {
  const conflicts = conflictMap(bank);
  const lines: string[] = [];
  lines.push("<jobs>");
  for (const j of bank.jobs) lines.push(`${j.name}: ${j.min} to ${j.max} bullets`);
  lines.push("</jobs>", "", "<bullets>");
  for (const b of bank.bullets.filter((x) => x.active)) {
    const meta = [
      `job: ${b.job}`,
      b.depth && `depth: ${b.depth}`,
      b.tags.length && `tags: ${b.tags.join(", ")}`,
      conflicts.get(b.id)?.size && `excludes: ${[...conflicts.get(b.id)!].join(", ")}`,
      b.emphasis && `emphasis: ${b.emphasis}`,
    ].filter(Boolean);
    lines.push(`[${b.id}] (${meta.join(" | ")})`, b.text, "");
  }
  lines.push("</bullets>", "");
  for (const type of ["Tagline", "Summary", "Skills"] as const) {
    lines.push(`<${type.toLowerCase()}_options>`);
    for (const v of bank.variants.filter((x) => x.active && x.type === type))
      lines.push(`[${v.id}]${v.notes ? ` (notes: ${v.notes})` : ""} ${v.text}`);
    lines.push(`</${type.toLowerCase()}_options>`, "");
  }
  if (bank.recipes.length) {
    lines.push("<past_recipes>");
    for (const r of bank.recipes)
      lines.push(
        `${r.name}: ` +
          Object.entries(r.parts)
            .map(([part, ids]) => `${part} = ${ids.join(", ")}`)
            .join("; "),
      );
    lines.push("</past_recipes>", "");
  }
  if (bank.rules.length) {
    lines.push("<rules>", ...bank.rules.map((r) => `- ${r}`), "</rules>");
  }
  return lines.join("\n");
}

function idEnum(ids: string[]) {
  return ids.length ? z.enum(ids as [string, ...string[]]) : z.string();
}

function outputSchema(bank: Bank) {
  const active = (type: string) => bank.variants.filter((v) => v.active && v.type === type).map((v) => v.id);
  const bulletIds = bank.bullets.filter((b) => b.active).map((b) => b.id);
  const allIds = [...bulletIds, ...bank.variants.filter((v) => v.active).map((v) => v.id)];
  const pick = (ids: string[]) => z.object({ id: idEnum(ids), reason: z.string() });
  return z.object({
    requirements: z.array(
      z.object({
        requirement: z.string(),
        covered_by: z.array(idEnum(allIds)),
        strength: z.enum(["strong", "partial", "none"]),
      }),
    ),
    tagline: pick(active("Tagline")),
    summary: pick(active("Summary")),
    skills: z.array(pick(active("Skills"))),
    jobs: z.array(
      z.object({
        job: idEnum(bank.jobs.map((j) => j.name)),
        // Before the bullets, so the ordering is decided first.
        lead_rationale: z.string(),
        bullets: z.array(pick(bulletIds)),
      }),
    ),
    gaps: z.array(z.string()),
    notes: z.string(),
  });
}

type Output = z.infer<ReturnType<typeof outputSchema>>;

function toSelection(bank: Bank, out: Output): Selection {
  const jobs: Record<string, Pick[]> = {};
  for (const j of bank.jobs) jobs[j.name] = [];
  for (const j of out.jobs) jobs[j.job] = [...(jobs[j.job] ?? []), ...j.bullets];
  return { tagline: out.tagline, summary: out.summary, skills: out.skills, jobs };
}

export interface SelectInput {
  company: string;
  role: string;
  jobDescription: string;
  /** The person's own notes, often from a fit discussion in Claude chat. */
  notes?: string;
}

export async function selectContent(bank: Bank, input: SelectInput): Promise<SelectResult> {
  const client = new Anthropic();
  const format = zodOutputFormat(outputSchema(bank));
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM },
    // The bank changes rarely, so cache it with the instructions.
    { type: "text", text: bankText(bank), cache_control: { type: "ephemeral" } },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content:
        `<application>\nCompany: ${input.company || "(not given)"}\nRole: ${input.role || "(not given)"}\n</application>\n\n<job_description>\n${input.jobDescription}\n</job_description>` +
        (input.notes?.trim() ? `\n\n<person_notes>\n${input.notes.trim()}\n</person_notes>` : ""),
    },
  ];

  const call = async () => {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format },
      system,
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("Claude declined this request. Try again, or edit the job description.");
    if (res.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off. Try again.");
    if (!res.parsed_output) throw new Error("Claude's answer couldn't be read. Try again.");
    return res;
  };

  let res = await call();
  let out = res.parsed_output!;
  let { selection, changes } = repairSelection(bank, toSelection(bank, out));
  let remaining = checkSelection(bank, selection);

  // One follow-up turn if the picks still break a rule the app can't fix itself
  // (usually a bullet count outside the job's range).
  if (changes.length || remaining.length) {
    const problems = [...changes, ...remaining.map((i) => `${i.where}: ${i.message}`)];
    messages.push(
      {
        role: "assistant",
        // Send the blocks back unchanged, minus the SDK's parsed copy on text blocks.
        content: res.content.map((b) =>
          b.type === "text" ? { type: "text" as const, text: b.text } : (b as Anthropic.Beta.BetaContentBlockParam),
        ),
      },
      {
        role: "user",
        content: `Your selection broke these rules:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nReturn the full corrected selection and report.`,
      },
    );
    try {
      res = await call();
      out = res.parsed_output!;
      ({ selection, changes } = repairSelection(bank, toSelection(bank, out)));
      remaining = checkSelection(bank, selection);
    } catch {
      // Keep the first, repaired answer; the review screen shows what's left.
    }
  }

  const picked = new Set([
    ...Object.values(selection.jobs).flat().map((p) => p.id),
    ...selection.skills.map((p) => p.id),
    selection.tagline?.id,
    selection.summary?.id,
  ]);
  return {
    selection,
    report: {
      requirements: out.requirements.map((r) => ({ ...r, covered_by: r.covered_by.filter((id) => picked.has(id)) })),
      gaps: out.gaps,
      notes: out.notes,
      ordering: Object.fromEntries(out.jobs.map((j) => [j.job, j.lead_rationale])),
    },
    warnings: [...changes, ...remaining.map((i) => `${i.where}: ${i.message}`)],
  };
}
