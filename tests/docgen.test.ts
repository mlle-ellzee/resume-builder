import { describe, expect, it } from "vitest";
import { planFill, type DocsDocument, type DocsRequest } from "../lib/docgen";
import type { Job } from "../lib/types";

/** Build a Docs-like document from paragraph strings (indexes start at 1, like Docs). */
function makeDoc(lines: string[]): DocsDocument {
  let i = 1;
  const content = lines.map((line) => {
    const text = line + "\n";
    const el = {
      startIndex: i,
      endIndex: i + text.length,
      paragraph: { elements: [{ startIndex: i, endIndex: i + text.length, textRun: { content: text, textStyle: { fontSize: { magnitude: 10, unit: "PT" } } } }] },
    };
    i += text.length;
    return el;
  });
  return { body: { content } };
}

/** Apply text-changing requests to the document text, the way Docs would. */
function apply(lines: string[], requests: DocsRequest[]): string {
  let s = "\u0000" + lines.map((l) => l + "\n").join(""); // index 0 is the section break
  for (const r of requests) {
    const req = r as Record<string, any>;
    if (req.insertText) {
      const at = req.insertText.location.index;
      s = s.slice(0, at) + req.insertText.text + s.slice(at);
    } else if (req.deleteContentRange) {
      const { startIndex, endIndex } = req.deleteContentRange.range;
      expect(endIndex).toBeGreaterThanOrEqual(startIndex);
      s = s.slice(0, startIndex) + s.slice(endIndex);
    } else if (req.replaceAllText) {
      s = s.split(req.replaceAllText.containsText.text).join(req.replaceAllText.replaceText);
    } else if (req.updateTextStyle) {
      const { startIndex, endIndex } = req.updateTextStyle.range;
      expect(startIndex).toBeGreaterThanOrEqual(1);
      expect(endIndex).toBeLessThanOrEqual(s.length);
    }
  }
  return s.slice(1);
}

const jobs: Job[] = [
  { name: "Acme", employer: "Acme Corp", min: 1, max: 5 },
  { name: "City", employer: "City of Springfield", min: 1, max: 5 },
];

const template = [
  "Pat Example",
  "{{TAGLINE}}",
  "PROFILE SUMMARY",
  "{{SUMMARY}}",
  "WORK EXPERIENCE",
  "SENIOR MANAGER",
  "Acme Corp | Remote | 2023 - 2025",
  "Bullets go here.",
  "",
  "OPERATIONS MANAGER",
  "City of Springfield | Springfield | 2017 - 2022",
  "Bullets go here.",
  "SKILLS",
  "{{SKILLS}}",
  "EDUCATION",
];

describe("planFill", () => {
  it("replaces each placeholder with that job's bullets, and fills markers", () => {
    const doc = makeDoc(template);
    const plan = planFill(doc, jobs, {
      tagline: "Operations Leader | Finance",
      summary: "Summary text.",
      skills: ["Operations: contracts, vendors", "Tools: Excel"],
      jobs: { Acme: ["A1 text.", "A2 text."], City: ["C1 text.", "C2 text.", "C3 text."] },
    });
    expect(plan.warnings).toEqual([]);
    const out = apply(template, plan.requests).split("\n");
    expect(out).toEqual([
      "Pat Example",
      "Operations Leader | Finance",
      "PROFILE SUMMARY",
      "Summary text.",
      "WORK EXPERIENCE",
      "SENIOR MANAGER",
      "Acme Corp | Remote | 2023 - 2025",
      "A1 text.",
      "A2 text.",
      "",
      "OPERATIONS MANAGER",
      "City of Springfield | Springfield | 2017 - 2022",
      "C1 text.",
      "C2 text.",
      "C3 text.",
      "SKILLS",
      "Operations: contracts, vendors",
      "Tools: Excel",
      "EDUCATION",
      "",
    ]);
  });

  it("bolds skill labels at the right positions", () => {
    const doc = makeDoc(template);
    const plan = planFill(doc, jobs, {
      tagline: "",
      summary: "",
      skills: ["Operations: contracts", "Tools: Excel"],
      jobs: { Acme: ["A1"], City: ["C1"] },
    });
    // The skills edit is last in the document, so it runs first. Check each bold
    // range against the text as it is when that request runs.
    let checked = 0;
    plan.requests.forEach((r: any, i) => {
      if (r.updateTextStyle?.fields !== "bold") return;
      const s = "\u0000" + apply(template, plan.requests.slice(0, i));
      const { startIndex, endIndex } = r.updateTextStyle.range;
      expect(["Operations:", "Tools:"]).toContain(s.slice(startIndex, endIndex));
      checked++;
    });
    expect(checked).toBe(2);
  });

  it("falls back to order and warns when an employer isn't found", () => {
    const t = template.map((l) => l.replace("Acme Corp", "Somewhere Else"));
    const plan = planFill(makeDoc(t), jobs, {
      tagline: "x",
      summary: "y",
      skills: [],
      jobs: { Acme: ["A1"], City: ["C1"] },
    });
    expect(plan.warnings.length).toBe(1);
    const out = apply(t, plan.requests);
    expect(out).toContain("Somewhere Else | Remote | 2023 - 2025\nA1\n");
    expect(out).toContain("2017 - 2022\nC1\n");
  });

  it("warns about missing markers instead of failing", () => {
    const t = template.filter((l) => !l.startsWith("{{"));
    const plan = planFill(makeDoc(t), jobs, {
      tagline: "x",
      summary: "y",
      skills: ["Tools: Excel"],
      jobs: { Acme: ["A1"], City: ["C1"] },
    });
    expect(plan.warnings).toHaveLength(3);
    expect(apply(t, plan.requests)).toContain("A1");
  });

  it("removes the placeholder paragraph when a job has no bullets", () => {
    const plan = planFill(makeDoc(template), jobs, { tagline: "", summary: "", skills: ["Tools: X"], jobs: { Acme: [], City: ["C1"] } });
    const out = apply(template, plan.requests);
    expect(out).not.toContain("Bullets go here.");
    expect(out).toContain("2023 - 2025\n\nOPERATIONS");
  });
});
