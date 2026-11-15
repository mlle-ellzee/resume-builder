import { deleteDraft, draftsEnabled, listDrafts } from "@/lib/drafts";
import { requireSession } from "@/lib/google";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    await requireSession();
    if (!draftsEnabled()) return { enabled: false, drafts: [] };
    return { enabled: true, drafts: await listDrafts() };
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await requireSession();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    await deleteDraft(id);
    return { ok: true };
  });
}
