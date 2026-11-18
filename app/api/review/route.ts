import { draftsEnabled, saveReview, type ReviewSnapshot } from "@/lib/drafts";
import { HttpError, requireSession } from "@/lib/google";
import { handle } from "@/lib/http";

/** Save the draft on the review screen so Claude chat can read it through the connector. */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireSession();
    if (!draftsEnabled()) return { saved: false };
    const raw = await req.text();
    if (raw.length > 500_000) throw new HttpError(413, "Draft is too large to share.");
    const body = JSON.parse(raw) as Omit<ReviewSnapshot, "updatedAt">;
    if (!body?.bank?.bullets || !body?.selection?.jobs || !body?.report) throw new HttpError(400, "Incomplete draft.");
    const updatedAt = Date.now();
    await saveReview({
      company: String(body.company ?? "").slice(0, 200),
      role: String(body.role ?? "").slice(0, 200),
      draftId: body.draftId,
      bank: body.bank,
      selection: body.selection,
      report: body.report,
      updatedAt,
    });
    return { saved: true, updatedAt };
  });
}
