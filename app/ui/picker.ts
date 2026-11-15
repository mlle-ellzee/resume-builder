/* Google Picker: lets the user grant this app access to one specific Drive file (drive.file scope). */

declare global {
  interface Window {
    gapi?: { load: (name: string, cb: () => void) => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

let loading: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const done = () => window.gapi!.load("picker", () => resolve());
    if (window.gapi) return done();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = done;
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the Google file picker."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface PickedFile {
  id: string;
  name: string;
}

export async function pickFile(kind: "doc" | "sheet", cfg: { apiKey: string; appId: string }): Promise<PickedFile | null> {
  const tokenRes = await fetch("/api/token");
  const { accessToken, error } = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(error || "Please sign in again.");
  await loadPicker();
  const gp = window.google.picker;
  const view = new gp.DocsView(kind === "doc" ? gp.ViewId.DOCUMENTS : gp.ViewId.SPREADSHEETS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false)
    .setMode(gp.DocsViewMode.LIST);
  return new Promise((resolve) => {
    const builder = new gp.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setAppId(cfg.appId)
      .setTitle(kind === "doc" ? "Choose your resume template" : "Choose your bullet bank")
      .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
        if (data.action === gp.Action.PICKED && data.docs?.[0]) resolve({ id: data.docs[0].id, name: data.docs[0].name });
        else if (data.action === gp.Action.CANCEL) resolve(null);
      });
    if (cfg.apiKey) builder.setDeveloperKey(cfg.apiKey);
    builder.build().setVisible(true);
  });
}
