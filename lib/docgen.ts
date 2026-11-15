/**
 * Builds Google Docs API batchUpdate requests that fill a copy of the template.
 *
 * Template conventions:
 *  - A paragraph reading "Bullets go here." under each job. The job is found by
 *    looking upward for the nearest paragraph containing that job's employer text
 *    (Jobs tab). It is replaced by the job's bullets, which keep its formatting.
 *  - A paragraph reading {{SKILLS}}: replaced by the chosen skills lines, one per
 *    paragraph, with the label before the first colon in bold.
 *  - {{TAGLINE}} and {{SUMMARY}} anywhere in the text: replaced in place.
 */
import type { Job } from "./types";

/* Minimal shapes of the parts of a Docs API document we read. */
interface TextRun {
  content?: string;
  textStyle?: Record<string, unknown>;
}
interface ParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: TextRun;
}
interface StructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: { elements?: ParagraphElement[] };
  table?: { tableRows?: { tableCells?: { content?: StructuralElement[] }[] }[] };
}
export interface DocsDocument {
  documentId?: string;
  revisionId?: string;
  body?: { content?: StructuralElement[] };
}

interface Para {
  start: number;
  end: number;
  /** Text without the trailing newline. */
  text: string;
  style: Record<string, unknown>;
}

export interface FillContent {
  tagline: string;
  summary: string;
  skills: string[];
  /** Job name -> bullet texts in order. */
  jobs: Record<string, string[]>;
}

export type DocsRequest = Record<string, unknown>;

const PLACEHOLDER = /^\s*(bullets go here\.?|\{\{\s*bullets\s*\}\})\s*$/i;
const SKILLS_MARKER = /^\s*\{\{\s*skills\s*\}\}\s*$/i;

function paragraphs(content: StructuralElement[] | undefined, out: Para[] = []): Para[] {
  for (const el of content ?? []) {
    if (el.paragraph) {
      const els = el.paragraph.elements ?? [];
      const text = els.map((e) => e.textRun?.content ?? "").join("");
      const firstRun = els.find((e) => e.textRun && (e.textRun.content ?? "").trim() !== "");
      out.push({
        start: el.startIndex ?? 0,
        end: el.endIndex ?? 0,
        text: text.replace(/\n$/, ""),
        style: firstRun?.textRun?.textStyle ?? {},
      });
    } else if (el.table) {
      for (const row of el.table.tableRows ?? [])
        for (const cell of row.tableCells ?? []) paragraphs(cell.content, out);
    }
  }
  return out;
}

const clean = (s: string) => s.replace(/[\r\n\v]+/g, " ").trim();

interface Op {
  start: number;
  requests: DocsRequest[];
}

/**
 * Replace a whole paragraph's text with one or more lines. The first line takes
 * the paragraph's place; the rest become new paragraphs right after it with the
 * same paragraph style and bullet. Text style is reset to the original text's.
 */
function replaceParagraph(p: Para, lines: string[], boldLabels: boolean): Op {
  if (lines.length === 0) {
    // Nothing to put here: remove the paragraph completely.
    return { start: p.start, requests: [{ deleteContentRange: { range: { startIndex: p.start, endIndex: p.end } } }] };
  }
  const text = lines.join("\n");
  const requests: DocsRequest[] = [
    // Insert before the placeholder text; the newlines split the paragraph, and each
    // new paragraph copies its style and bullet.
    { insertText: { location: { index: p.start }, text } },
    // Remove the placeholder text, which now sits after the inserted text in the last paragraph.
    {
      deleteContentRange: {
        range: { startIndex: p.start + text.length, endIndex: p.start + text.length + p.text.length },
      },
    },
    {
      updateTextStyle: {
        range: { startIndex: p.start, endIndex: p.start + text.length },
        textStyle: p.style,
        fields: "*",
      },
    },
  ];
  if (boldLabels) {
    let offset = 0;
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0)
        requests.push({
          updateTextStyle: {
            range: { startIndex: p.start + offset, endIndex: p.start + offset + colon + 1 },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      offset += line.length + 1;
    }
  }
  return { start: p.start, requests };
}

export interface FillPlan {
  requests: DocsRequest[];
  warnings: string[];
}

export function planFill(doc: DocsDocument, jobs: Job[], content: FillContent): FillPlan {
  const paras = paragraphs(doc.body?.content);
  const warnings: string[] = [];
  const ops: Op[] = [];

  // Bullets.
  const placeholders = paras.map((p, i) => ({ p, i })).filter(({ p }) => PLACEHOLDER.test(p.text));
  const used = new Set<string>();
  placeholders.forEach(({ p, i }, n) => {
    let job: Job | undefined;
    for (let k = i - 1; k >= 0 && !job; k--) {
      const t = paras[k].text.toLowerCase();
      job = jobs.find((j) => j.employer && t.includes(j.employer.toLowerCase()) && !used.has(j.name));
    }
    if (!job) {
      job = jobs.filter((j) => !used.has(j.name))[0];
      if (job)
        warnings.push(
          `Couldn't find an employer line above placeholder ${n + 1}; filled it with ${job.name} bullets. Check "Employer in template" on the Jobs tab.`,
        );
    }
    if (!job) {
      warnings.push(`Placeholder ${n + 1} has no job left to fill it; it was left as is.`);
      return;
    }
    used.add(job.name);
    ops.push(replaceParagraph(p, (content.jobs[job.name] ?? []).map(clean), false));
  });
  for (const j of jobs)
    if (!used.has(j.name) && (content.jobs[j.name]?.length ?? 0) > 0)
      warnings.push(`No "Bullets go here." line found for ${j.name}; its bullets were not added.`);

  // Skills.
  const skillsPara = paras.find((p) => SKILLS_MARKER.test(p.text));
  if (skillsPara) ops.push(replaceParagraph(skillsPara, content.skills.map(clean), true));
  else if (content.skills.length) warnings.push("No {{SKILLS}} line in the template; skills were left as typed.");

  // Apply from the end of the document backward, so earlier positions stay valid.
  ops.sort((a, b) => b.start - a.start);
  const requests = ops.flatMap((o) => o.requests);

  const fullText = paras.map((p) => p.text).join("\n");
  for (const [marker, value, name] of [
    ["{{TAGLINE}}", content.tagline, "tagline"],
    ["{{SUMMARY}}", content.summary, "summary"],
  ] as const) {
    if (!fullText.includes(marker)) {
      if (value) warnings.push(`No ${marker} in the template; the ${name} was left as typed.`);
      continue;
    }
    requests.push({ replaceAllText: { containsText: { text: marker, matchCase: true }, replaceText: clean(value) } });
  }

  return { requests, warnings };
}
