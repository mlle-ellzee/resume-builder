import { planFill } from "@/lib/docgen";
import { appendRows, batchUpdateDoc, copyFile, getDoc, HttpError, readBank, requireSession } from "@/lib/google";
import { handle } from "@/lib/http";
import { getSettings } from "@/lib/session";
import type { Selection } from "@/lib/types";
import { checkSelection } from "@/lib/validate";

export const maxDuration = 60;

interface Body {
  selection: Selection;
  docName: string;
  saveRecipe: boolean;
  recipeName: string;
  notes: string;
}

export async function POST(req: Request) {
  return handle(async () => {
    const { accessToken } = await requireSession();
    const settings = await getSettings();
    if (!settings) throw new HttpError(400, "Pick your template and bullet bank first.");
    const body = (await req.json()) as Body;
    const sel = body.selection;

    // Re-read the bank so the doc uses the Sheet's current text, and re-check the rules.
    const bank = await readBank(accessToken, settings.sheetId);
    const blocking = checkSelection(bank, sel).filter((i) => i.blocking);
    if (blocking.length) throw new HttpError(400, blocking.map((i) => `${i.where}: ${i.message}`).join(" "));

    const bulletText = new Map(bank.bullets.map((b) => [b.id, b.text]));
    const variantText = new Map(bank.variants.map((v) => [v.id, v.text]));
    const jobs: Record<string, string[]> = {};
    for (const j of bank.jobs) jobs[j.name] = (sel.jobs[j.name] ?? []).map((p) => bulletText.get(p.id) ?? "");

    const name = (body.docName || "Resume").slice(0, 200);
    const copy = await copyFile(accessToken, settings.templateId, name);
    let plan;
    try {
      const doc = await getDoc(accessToken, copy.id);
      plan = planFill(doc, bank.jobs, {
        tagline: variantText.get(sel.tagline?.id ?? "") ?? "",
        summary: variantText.get(sel.summary?.id ?? "") ?? "",
        skills: sel.skills.map((p) => variantText.get(p.id) ?? ""),
        jobs,
      });
      await batchUpdateDoc(accessToken, copy.id, plan.requests, doc.revisionId);
    } catch (e) {
      throw new HttpError(
        502,
        `A copy of the template was made (${copy.webViewLink}) but filling it failed: ${e instanceof Error ? e.message : e}`,
      );
    }

    const warnings = [...plan.warnings];
    if (body.saveRecipe) {
      const date = new Date().toISOString().slice(0, 10);
      const recipe = (body.recipeName || name).slice(0, 200);
      const notes = (body.notes || "").slice(0, 2000);
      const rows: string[][] = [
        [recipe, "Tagline", sel.tagline?.id ?? "", date, copy.webViewLink, notes],
        [recipe, "Summary", sel.summary?.id ?? "", date, copy.webViewLink, ""],
        ...bank.jobs.map((j) => [recipe, j.name, (sel.jobs[j.name] ?? []).map((p) => p.id).join(", "), date, copy.webViewLink, ""]),
        [recipe, "Skills", sel.skills.map((p) => p.id).join(", "), date, copy.webViewLink, ""],
      ];
      try {
        await appendRows(accessToken, settings.sheetId, "Recipes", rows);
      } catch (e) {
        warnings.push(`The resume was created, but saving the recipe failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { url: copy.webViewLink, id: copy.id, warnings };
  });
}
