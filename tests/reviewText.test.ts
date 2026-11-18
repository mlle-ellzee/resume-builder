import { describe, expect, it } from "vitest";
import { parseBank } from "../lib/bank";
import { reviewForChat } from "../lib/reviewText";

const bank = parseBank({
  Bullets: [
    ["ID", "Bullet", "Skills/Tags", "Depth", "Emphasis", "Job", "Excludes", "Active"],
    ["C-LONG", "Long version.", "", "detailed", "leadership", "City", "C-SHORT", "Y"],
    ["C-SHORT", "Short version.", "", "summary", "", "City", "", "Y"],
    ["C-OTHER", "Other.", "", "", "", "City", "", "Y"],
    ["C-OFF", "Inactive.", "", "", "", "City", "", "N"],
  ],
  Variants: [
    ["ID", "Type", "Text"],
    ["T-1", "Tagline", "Tagline one"],
    ["T-2", "Tagline", "Tagline two"],
    ["S-1", "Summary", "Summary one"],
  ],
  Jobs: [["Job", "Employer in template", "Min bullets", "Max bullets"], ["City", "City of X", "1", "3"]],
  Rules: [["Rule"], ["Be concise."]],
});

const now = Date.UTC(2026, 10, 18, 12, 0);
const text = reviewForChat(
  {
    company: "Acme",
    role: "Chief of Staff",
    updatedAt: now - 5 * 60000,
    bank,
    selection: {
      tagline: { id: "T-1", reason: "" },
      summary: { id: "S-1", reason: "" },
      skills: [],
      jobs: { City: [{ id: "C-SHORT", reason: "" }, { id: "C-OTHER", reason: "" }] },
    },
    report: { requirements: [], gaps: ["Board reporting"], notes: "", ordering: { City: "Lead with scope." } },
  },
  now,
);

describe("reviewForChat", () => {
  it("shows the draft in order with IDs and how fresh it is", () => {
    expect(text).toContain("last changed 5 min ago");
    expect(text).toContain("- Short version. [C-SHORT]\n- Other. [C-OTHER]");
    expect(text).toContain("City: 2 bullets (allowed 1 to 3).");
    expect(text).toContain("- City: Lead with scope.");
    expect(text).toContain("- Board reporting");
  });

  it("lists unused active options with two-way excludes, and the rules", () => {
    expect(text).toContain("- [C-LONG] (detailed; emphasis: leadership; excludes C-SHORT) Long version.");
    expect(text).not.toContain("C-OFF");
    expect(text).toContain("- [T-2] Tagline two");
    expect(text).not.toContain("- [T-1]");
    expect(text).toContain("- Be concise.");
  });
});
