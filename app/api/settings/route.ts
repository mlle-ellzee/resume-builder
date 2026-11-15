import { fileName, HttpError, requireSession } from "@/lib/google";
import { handle } from "@/lib/http";
import { saveSettings } from "@/lib/session";

export async function POST(req: Request) {
  return handle(async () => {
    const { accessToken } = await requireSession();
    const body = (await req.json()) as { templateId?: string; sheetId?: string };
    if (!body.templateId || !body.sheetId) throw new HttpError(400, "Pick both the template and the bullet bank.");
    // Reading the names confirms the app can open both files.
    const [templateName, sheetName] = await Promise.all([
      fileName(accessToken, body.templateId),
      fileName(accessToken, body.sheetId),
    ]);
    const settings = { templateId: body.templateId, sheetId: body.sheetId, templateName, sheetName };
    await saveSettings(settings);
    return settings;
  });
}
