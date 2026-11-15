import { allowedEmails, getSession, getSettings } from "@/lib/session";
import App from "./ui/App";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await getSession();
  const signedIn = !!session && allowedEmails().includes(session.email);

  if (!signedIn) {
    return (
      <main className="signin">
        <h1>Resume Builder</h1>
        <p className="muted">Builds a tailored resume from your template and bullet bank.</p>
        {error && <p className="error">{error}</p>}
        <a className="button primary" href="/api/auth/login">
          Sign in with Google
        </a>
      </main>
    );
  }

  return (
    <App
      email={session!.email}
      initialSettings={await getSettings()}
      picker={{ apiKey: process.env.GOOGLE_API_KEY ?? "", appId: process.env.GOOGLE_PROJECT_NUMBER ?? "" }}
      error={error}
    />
  );
}
