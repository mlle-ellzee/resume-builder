import { describe, expect, it } from "vitest";
import { parseBank } from "../lib/bank";
import { draftText } from "../lib/preview";

const bank = parseBank({
  Bullets: [
    ["ID", "Bullet", "Skills/Tags", "Depth", "Emphasis", "Job", "Excludes", "Active"],
    ["A-1", "Acme one.", "", "", "", "Acme", "", "Y"],
    ["C-1", "City one.", "", "", "", "City", "", "Y"],
    ["C-2", "City two.", "", "", "", "City", "", "Y"],
  ],
  Variants: [
    ["ID", "Type", "Text"],
    ["T-1", "Tagline", "Ops Leader | Finance"],
    ["S-1", "Summary", "Summary text."],
    ["SK-1", "Skills", "Tools: Excel"],
  ],
  Jobs: [
    ["Job", "Employer in template", "Min bullets", "Max bullets"],
    ["Acme", "Acme Corp", "1", "3"],
    ["City", "City of X", "1", "3"],
  ],
});

const sel = {
  tagline: { id: "T-1", reason: "" },
  summary: { id: "S-1", reason: "" },
  skills: [{ id: "SK-1", reason: "" }],
  jobs: { Acme: [{ id: "A-1", reason: "" }], City: [{ id: "C-2", reason: "" }, { id: "C-1", reason: "" }] },
};

describe("draftText", () => {
  it("lists sections in resume order with bullets in the chosen order", () => {
    expect(draftText(bank, sel, { company: "Example Co", role: "Ops Manager" })).toBe(
      [
        "Resume draft for Ops Manager at Example Co",
        "",
        "TAGLINE",
        "Ops Leader | Finance",
        "",
        "SUMMARY",
        "Summary text.",
        "",
        "WORK EXPERIENCE",
        "",
        "Acme Corp",
        "- Acme one.",
        "",
        "City of X",
        "- City two.",
        "- City one.",
        "",
        "SKILLS",
        "Tools: Excel",
        "",
      ].join("\n"),
    );
  });

  it("adds IDs when asked", () => {
    const t = draftText(bank, sel, { includeIds: true });
    expect(t).toContain("- City two. [C-2]");
    expect(t).toContain("Ops Leader | Finance [T-1]");
    expect(t.startsWith("Resume draft\n")).toBe(true);
  });
});
