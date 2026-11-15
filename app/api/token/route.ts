import { requireSession } from "@/lib/google";
import { handle } from "@/lib/http";

/** Access token for the Google Picker in the browser (drive.file scope only). */
export async function GET() {
  return handle(async () => ({ accessToken: (await requireSession()).accessToken }));
}
