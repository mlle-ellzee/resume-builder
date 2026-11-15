import { draftsEnabled, getDraft, type JobDraft } from "@/lib/drafts";
import { allowedEmails, getSession, getSettings } from "@/lib/session";
import App from "./ui/App";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; draft?: string }> }) {
  const { error, draft: draftId } = await searchParams;
  const session = await getSession();
  const signedIn = !!session && allowedEmails().includes(session.email);

  if (!signedIn) {
    const next = draftId ? `/?draft=${encodeURIComponent(draftId)}` : "/";
    return (
      <main className="signin">
        <h1>Resume Builder</h1>
        <p className="muted">Builds a tailored resume from your template and bullet bank.</p>
        {error && <p className="error">{error}</p>}
        <a className="button primary" href={`/api/auth/login?next=${encodeURIComponent(next)}`}>
          Sign in with Google
        </a>
      </main>
    );
  }

  let incoming: JobDraft | null = null;
  let incomingError: string | undefined;
  if (draftId) {
    if (!draftsEnabled()) incomingError = "This link needs draft storage, which isn't set up.";
    else {
      try {
        incoming = await getDraft(draftId);
        if (!incoming) incomingError = "That job link has expired or was already used. Check the Inbox below.";
      } catch {
        incomingError = "Couldn't load that job from storage. Try the link again.";
      }
    }
  }

  return (
    <App
      email={session!.email}
      initialSettings={await getSettings()}
      picker={{ apiKey: process.env.GOOGLE_API_KEY ?? "", appId: process.env.GOOGLE_PROJECT_NUMBER ?? "" }}
      error={error ?? incomingError}
      incoming={incoming}
      inboxEnabled={draftsEnabled()}
    />
  );
}
