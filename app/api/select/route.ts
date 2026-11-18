import { bankProblems } from "@/lib/bank";
import { HttpError, readBank, requireSession } from "@/lib/google";
import { handle } from "@/lib/http";
import { selectContent } from "@/lib/select";
import { getSettings } from "@/lib/session";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(async () => {
    const { accessToken } = await requireSession();
    const settings = await getSettings();
    if (!settings) throw new HttpError(400, "Pick your template and bullet bank first.");
    const body = (await req.json()) as { company?: string; role?: string; jobDescription?: string; notes?: string };
    const jobDescription = (body.jobDescription ?? "").trim();
    if (jobDescription.length < 50) throw new HttpError(400, "Paste the full job description.");
    if (jobDescription.length > 60000) throw new HttpError(400, "That job description is very long. Paste just the posting.");
    const bank = await readBank(accessToken, settings.sheetId);
    if (!bank.bullets.length) throw new HttpError(400, "The Bullets tab is empty.");
    const result = await selectContent(bank, {
      company: (body.company ?? "").trim(),
      role: (body.role ?? "").trim(),
      jobDescription,
      notes: (body.notes ?? "").trim().slice(0, 4000),
    });
    return { bank, bankProblems: bankProblems(bank), result };
  });
}
