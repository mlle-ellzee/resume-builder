import { describe, expect, it } from "vitest";
import { parseBank, bankProblems } from "../lib/bank";
import { checkSelection, repairSelection } from "../lib/validate";
import type { Selection } from "../lib/types";

const bank = parseBank({
  Bullets: [
    ["ID", "Bullet", "Skills/Tags", "Depth", "Emphasis", "Job", "Excludes", "Active"],
    ["A-1", "Acme one", "finance", "detailed", "", "Acme", "", "Y"],
    ["A-2", "Acme two", "people", "summary", "", "Acme", "", "Y"],
    ["C-BUD", "Budget detail", "finance", "detailed", "", "City", "C-COMBO", "Y"],
    ["C-COMBO", "Budget combined", "finance", "summary", "", "City", "", "Y"],
    ["C-HR", "HR", "people", "detailed", "", "City", "", "Y"],
    ["C-OLD", "Old", "people", "detailed", "", "City", "", "N"],
  ],
  Variants: [
    ["ID", "Type", "Text", "Notes", "Active"],
    ["T-1", "Tagline", "Ops Leader", "", "Y"],
    ["S-1", "Summary", "Summary", "", "Y"],
    ["SK-OPS-A", "Skills", "Operations: a, b", "", "Y"],
    ["SK-OPS-B", "Skills", "Operations: c, d", "", "Y"],
    ["SK-TOOLS", "Skills", "Tools: Excel", "", "Y"],
  ],
  Jobs: [
    ["Job", "Employer in template", "Min bullets", "Max bullets"],
    ["Acme", "Acme Corp", "1", "2"],
    ["City", "City of X", "2", "3"],
  ],
  Recipes: [
    ["Recipe", "Part", "IDs"],
    ["Old app", "Acme", "A-1, A-2"],
    ["Old app", "Tagline", "T-1"],
  ],
  Rules: [["Rule"], ["Be concise."]],
});

const pick = (id: string) => ({ id, reason: "" });

describe("parseBank", () => {
  it("reads every tab", () => {
    expect(bank.bullets).toHaveLength(6);
    expect(bank.bullets[2].excludes).toEqual(["C-COMBO"]);
    expect(bank.bullets[5].active).toBe(false);
    expect(bank.variants.map((v) => v.type)).toEqual(["Tagline", "Summary", "Skills", "Skills", "Skills"]);
    expect(bank.jobs[1]).toEqual({ name: "City", employer: "City of X", min: 2, max: 3 });
    expect(bank.recipes[0].parts).toEqual({ Acme: ["A-1", "A-2"], Tagline: ["T-1"] });
    expect(bank.rules).toEqual(["Be concise."]);
    expect(bankProblems(bank)).toEqual([]);
  });
});

describe("checkSelection", () => {
  const good: Selection = {
    tagline: pick("T-1"),
    summary: pick("S-1"),
    skills: [pick("SK-OPS-A"), pick("SK-TOOLS")],
    jobs: { Acme: [pick("A-1")], City: [pick("C-BUD"), pick("C-HR")] },
  };

  it("passes a valid selection", () => {
    expect(checkSelection(bank, good)).toEqual([]);
  });

  it("treats Excludes as two-way", () => {
    const sel = { ...good, jobs: { ...good.jobs, City: [pick("C-COMBO"), pick("C-BUD")] } };
    const issues = checkSelection(bank, sel);
    expect(issues.some((i) => i.blocking && i.message.includes("can't be used together"))).toBe(true);
  });

  it("flags wrong job, duplicates, counts and two skills lines with the same label", () => {
    const sel: Selection = {
      ...good,
      skills: [pick("SK-OPS-A"), pick("SK-OPS-B")],
      jobs: { Acme: [pick("A-1"), pick("C-HR")], City: [pick("C-HR")] },
    };
    const msgs = checkSelection(bank, sel).map((i) => i.message);
    expect(msgs.some((m) => m.includes("belongs to City"))).toBe(true);
    expect(msgs.some((m) => m.includes("used twice"))).toBe(true);
    expect(msgs.some((m) => m.includes("allows 2 to 3"))).toBe(true);
    expect(msgs.some((m) => m.includes('both "Operations"'))).toBe(true);
  });
});

describe("repairSelection", () => {
  it("drops the later bullet of a conflict and invalid picks, keeping order", () => {
    const { selection, changes } = repairSelection(bank, {
      tagline: pick("T-1"),
      summary: pick("NOPE"),
      skills: [pick("SK-OPS-B"), pick("SK-OPS-A"), pick("SK-TOOLS")],
      jobs: { Acme: [pick("A-2"), pick("C-HR")], City: [pick("C-COMBO"), pick("C-OLD"), pick("C-BUD"), pick("C-HR")] },
    });
    expect(selection.jobs.Acme.map((p) => p.id)).toEqual(["A-2"]);
    expect(selection.jobs.City.map((p) => p.id)).toEqual(["C-COMBO", "C-HR"]);
    expect(selection.skills.map((p) => p.id)).toEqual(["SK-OPS-B", "SK-TOOLS"]);
    expect(selection.summary).toBeNull();
    expect(changes).toHaveLength(5);
  });
});
