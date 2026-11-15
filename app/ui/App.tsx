"use client";

import { useEffect, useMemo, useState } from "react";
import { conflictMap } from "@/lib/bank";
import type { Settings } from "@/lib/session";
import type { Bank, Bullet, MatchReport, Pick, SelectResult, Selection, Variant } from "@/lib/types";
import { checkSelection } from "@/lib/validate";
import { pickFile, type PickedFile } from "./picker";

type Step = "setup" | "input" | "review" | "done";

interface Props {
  email: string;
  initialSettings: Settings | null;
  picker: { apiKey: string; appId: string };
  error?: string;
}

interface Draft {
  company: string;
  role: string;
  jd: string;
  bank?: Bank;
  bankProblems?: string[];
  result?: SelectResult;
  selection?: Selection;
}

const DRAFT_KEY = "rb_draft_v1";

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { company: "", role: "", jd: "" };
}

function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {}
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data as T;
}

function defaultDocName(settings: Settings | null, company: string, role: string) {
  const base = (settings?.templateName || "Resume").replace(/\s*-?\s*(claude\s+)?template\s*$/i, "").trim() || "Resume";
  return [base, company.trim(), role.trim()].filter(Boolean).join(" - ");
}

export default function App({ email, initialSettings, picker, error }: Props) {
  const [settings, setSettings] = useState<Settings | null>(initialSettings);
  const [step, setStep] = useState<Step>(initialSettings ? "input" : "setup");
  const [draft, setDraft] = useState<Draft>({ company: "", role: "", jd: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(error ?? null);
  const [done, setDone] = useState<{ url: string; warnings: string[] } | null>(null);

  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    if (initialSettings && d.selection && d.bank && d.result) setStep("review");
  }, [initialSettings]);

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });

  async function runSelect() {
    setErr(null);
    setBusy(true);
    try {
      const data = await postJson<{ bank: Bank; bankProblems: string[]; result: SelectResult }>("/api/select", {
        company: draft.company,
        role: draft.role,
        jobDescription: draft.jd,
      });
      update({ bank: data.bank, bankProblems: data.bankProblems, result: data.result, selection: data.result.selection });
      setStep("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>Resume Builder</strong>
        <nav>
          {step !== "setup" && (
            <button className="link" onClick={() => setStep("setup")}>
              Files
            </button>
          )}
          <span className="muted small hide-narrow">{email}</span>
          <form action="/api/auth/logout" method="post">
            <button className="link" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      {err && (
        <div className="error banner" role="alert">
          {err}
          <button className="link" onClick={() => setErr(null)}>
            Dismiss
          </button>
        </div>
      )}

      {step === "setup" && (
        <Setup
          settings={settings}
          picker={picker}
          onSaved={(s) => {
            setSettings(s);
            setStep("input");
          }}
          onError={setErr}
        />
      )}

      {step === "input" && (
        <main className="narrow">
          <h1>New application</h1>
          <div className="row2">
            <label>
              Company
              <input value={draft.company} onChange={(e) => update({ company: e.target.value })} />
            </label>
            <label>
              Role
              <input value={draft.role} onChange={(e) => update({ role: e.target.value })} />
            </label>
          </div>
          <label>
            Job description
            <textarea rows={16} value={draft.jd} onChange={(e) => update({ jd: e.target.value })} placeholder="Paste the full posting" />
          </label>
          <div className="actions">
            <button className="primary" disabled={busy || draft.jd.trim().length < 50} onClick={runSelect}>
              {busy ? "Picking bullets…" : "Pick bullets"}
            </button>
            {draft.result && !busy && (
              <button onClick={() => setStep("review")}>Back to last review</button>
            )}
          </div>
          {busy && <p className="muted">Claude is reading the posting and your bank. This usually takes under a minute or two.</p>}
        </main>
      )}

      {step === "review" && draft.bank && draft.selection && draft.result && (
        <Review
          bank={draft.bank}
          bankProblems={draft.bankProblems ?? []}
          result={draft.result}
          selection={draft.selection}
          onChange={(selection) => update({ selection })}
          defaultName={defaultDocName(settings, draft.company, draft.role)}
          defaultRecipe={[draft.company, draft.role].filter((s) => s.trim()).join(" - ") || "Untitled"}
          onBack={() => setStep("input")}
          onError={setErr}
          onDone={(r) => {
            setDone(r);
            setStep("done");
          }}
        />
      )}

      {step === "done" && done && (
        <main className="narrow">
          <h1>Resume created</h1>
          <p>
            <a className="button primary" href={done.url} target="_blank" rel="noreferrer">
              Open in Google Docs
            </a>
          </p>
          {done.warnings.length > 0 && (
            <div className="warn">
              <strong>Check these in the doc:</strong>
              <ul>
                {done.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="actions">
            <button onClick={() => setStep("review")}>Back to review</button>
            <button
              onClick={() => {
                update({ company: "", role: "", jd: "", result: undefined, selection: undefined, bank: undefined });
                setStep("input");
              }}
            >
              Start another
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

/* ---------------- Setup ---------------- */

function Setup({
  settings,
  picker,
  onSaved,
  onError,
}: {
  settings: Settings | null;
  picker: { apiKey: string; appId: string };
  onSaved: (s: Settings) => void;
  onError: (m: string) => void;
}) {
  const [template, setTemplate] = useState<PickedFile | null>(
    settings ? { id: settings.templateId, name: settings.templateName } : null,
  );
  const [sheet, setSheet] = useState<PickedFile | null>(settings ? { id: settings.sheetId, name: settings.sheetName } : null);
  const [saving, setSaving] = useState(false);

  const choose = async (kind: "doc" | "sheet") => {
    try {
      const f = await pickFile(kind, picker);
      if (f) (kind === "doc" ? setTemplate : setSheet)(f);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="narrow">
      <h1>Your files</h1>
      {!/^\d+$/.test(picker.appId) && (
        <p className="error">
          GOOGLE_PROJECT_NUMBER is {picker.appId ? `"${picker.appId}", which isn't a project number` : "not set"}. Without the
          all-digits project number, picked files can't be opened. Fix it in Vercel and redeploy.
        </p>
      )}
      <p className="muted">
        Choose your template and bullet bank in Google's file picker. The app can only open files you choose here and the
        resumes it creates.
      </p>
      <div className="filepick">
        <div>
          <div className="label">Resume template (Google Doc)</div>
          <div>{template?.name ?? <span className="muted">Not chosen</span>}</div>
        </div>
        <button onClick={() => choose("doc")}>{template ? "Change" : "Choose"}</button>
      </div>
      <div className="filepick">
        <div>
          <div className="label">Bullet bank (Google Sheet)</div>
          <div>{sheet?.name ?? <span className="muted">Not chosen</span>}</div>
        </div>
        <button onClick={() => choose("sheet")}>{sheet ? "Change" : "Choose"}</button>
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={!template || !sheet || saving}
          onClick={async () => {
            setSaving(true);
            try {
              onSaved(await postJson<Settings>("/api/settings", { templateId: template!.id, sheetId: sheet!.id }));
            } catch (e) {
              onError(e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Checking access…" : "Save"}
        </button>
      </div>
    </main>
  );
}

/* ---------------- Review ---------------- */

function short(text: string, n = 90) {
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

function Review({
  bank,
  bankProblems,
  result,
  selection,
  onChange,
  defaultName,
  defaultRecipe,
  onBack,
  onError,
  onDone,
}: {
  bank: Bank;
  bankProblems: string[];
  result: SelectResult;
  selection: Selection;
  onChange: (s: Selection) => void;
  defaultName: string;
  defaultRecipe: string;
  onBack: () => void;
  onError: (m: string) => void;
  onDone: (r: { url: string; warnings: string[] }) => void;
}) {
  const [docName, setDocName] = useState(defaultName);
  const [saveRecipe, setSaveRecipe] = useState(true);
  const [generating, setGenerating] = useState(false);

  const bulletById = useMemo(() => new Map(bank.bullets.map((b) => [b.id, b])), [bank]);
  const variantById = useMemo(() => new Map(bank.variants.map((v) => [v.id, v])), [bank]);
  const conflicts = useMemo(() => conflictMap(bank), [bank]);
  const issues = useMemo(() => checkSelection(bank, selection), [bank, selection]);
  const blocking = issues.filter((i) => i.blocking);

  const pickedBullets = new Set(Object.values(selection.jobs).flat().map((p) => p.id));
  const pickedAll = new Set([
    ...pickedBullets,
    ...selection.skills.map((p) => p.id),
    selection.tagline?.id ?? "",
    selection.summary?.id ?? "",
  ]);

  const setJob = (job: string, picks: Pick[]) => onChange({ ...selection, jobs: { ...selection.jobs, [job]: picks } });

  /** Put a bullet into a job (replacing index `at`, or appending) and remove any picks it can't be used with. */
  const place = (job: string, id: string, at: number | null, reason: string) => {
    const clashes = conflicts.get(id) ?? new Set<string>();
    const jobs: Record<string, Pick[]> = {};
    for (const [name, picks] of Object.entries(selection.jobs)) {
      let next = [...picks];
      if (name === job) {
        if (at === null) next.push({ id, reason });
        else next[at] = { id, reason };
      }
      jobs[name] = next.filter((p) => p.id === id || !clashes.has(p.id));
    }
    onChange({ ...selection, jobs });
  };

  const replacesLabel = (id: string, ignore?: string) => {
    const r = [...pickedBullets].filter((o) => o !== ignore && conflicts.get(id)?.has(o));
    return r.length ? ` [also removes ${r.join(", ")}]` : "";
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const notes = [
        result.report.gaps.length ? `Gaps: ${result.report.gaps.join("; ")}` : "",
        result.report.notes,
      ]
        .filter(Boolean)
        .join(" ");
      const r = await postJson<{ url: string; warnings: string[] }>("/api/generate", {
        selection,
        docName,
        saveRecipe,
        recipeName: defaultRecipe,
        notes,
      });
      onDone(r);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="review">
      <section className="picks">
        <div className="section-head">
          <h1>Review</h1>
          <button className="link" onClick={onBack}>
            Edit job description
          </button>
        </div>

        {(result.warnings.length > 0 || bankProblems.length > 0) && (
          <details className="warn">
            <summary>
              {result.warnings.length + bankProblems.length} note{result.warnings.length + bankProblems.length === 1 ? "" : "s"} from
              checking the picks and the bank
            </summary>
            <ul>
              {[...result.warnings, ...bankProblems].map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        <VariantPicker
          title="Tagline"
          options={bank.variants.filter((v) => v.type === "Tagline" && v.active)}
          pick={selection.tagline}
          onPick={(p) => onChange({ ...selection, tagline: p })}
        />
        <VariantPicker
          title="Summary"
          options={bank.variants.filter((v) => v.type === "Summary" && v.active)}
          pick={selection.summary}
          onPick={(p) => onChange({ ...selection, summary: p })}
        />

        {bank.jobs.map((job) => {
          const picks = selection.jobs[job.name] ?? [];
          const jobIssues = issues.filter((i) => i.where === job.name);
          const pool = bank.bullets.filter((b) => b.job === job.name && b.active);
          return (
            <div className="card" key={job.name}>
              <div className="section-head">
                <h2>{job.name}</h2>
                <span className={picks.length < job.min || picks.length > job.max ? "count bad" : "count"}>
                  {picks.length} of {job.min} to {job.max}
                </span>
              </div>
              {jobIssues.map((i) => (
                <p key={i.message} className={i.blocking ? "error small" : "warn-text small"}>
                  {i.message}
                </p>
              ))}
              <ol className="bullets">
                {picks.map((p, idx) => {
                  const b = bulletById.get(p.id);
                  const others = new Set([...pickedBullets].filter((id) => id !== p.id));
                  const versions = conflicts.get(p.id) ?? new Set<string>();
                  const alts = pool
                    .filter((x) => x.id !== p.id && !others.has(x.id))
                    .sort((a, c) => Number(versions.has(c.id)) - Number(versions.has(a.id)));
                  return (
                    <li key={p.id}>
                      <BulletText b={b} id={p.id} reason={p.reason} />
                      <div className="controls">
                        <button className="icon" aria-label="Move up" disabled={idx === 0} onClick={() => setJob(job.name, move(picks, idx, -1))}>
                          ↑
                        </button>
                        <button
                          className="icon"
                          aria-label="Move down"
                          disabled={idx === picks.length - 1}
                          onClick={() => setJob(job.name, move(picks, idx, 1))}
                        >
                          ↓
                        </button>
                        <select
                          aria-label="Swap for another bullet"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) place(job.name, e.target.value, idx, "Chosen by you.");
                          }}
                        >
                          <option value="">Swap…</option>
                          {alts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {versions.has(a.id) ? "Other version: " : ""}
                              {a.id}
                              {a.depth ? ` (${a.depth})` : ""}: {short(a.text, 70)}
                              {replacesLabel(a.id, p.id)}
                            </option>
                          ))}
                        </select>
                        <button className="icon" aria-label="Remove" onClick={() => setJob(job.name, picks.filter((_, i) => i !== idx))}>
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <AddSelect
                label="Add a bullet…"
                options={pool
                  .filter((b) => !pickedBullets.has(b.id))
                  .map((b) => ({
                    id: b.id,
                    label: `${b.id}${b.depth ? ` (${b.depth})` : ""}: ${short(b.text, 70)}${replacesLabel(b.id)}`,
                    disabled: false,
                  }))}
                onAdd={(id) => place(job.name, id, null, "Added by you.")}
              />
            </div>
          );
        })}

        <div className="card">
          <h2>Skills</h2>
          {issues
            .filter((i) => i.where === "Skills")
            .map((i) => (
              <p key={i.message} className={i.blocking ? "error small" : "warn-text small"}>
                {i.message}
              </p>
            ))}
          <ol className="bullets">
            {selection.skills.map((p, idx) => (
              <li key={p.id}>
                <div className="text">{variantById.get(p.id)?.text ?? p.id}</div>
                <div className="meta">
                  {p.id}
                  {p.reason && <> · {p.reason}</>}
                </div>
                <div className="controls">
                  <button className="icon" aria-label="Move up" disabled={idx === 0} onClick={() => onChange({ ...selection, skills: move(selection.skills, idx, -1) })}>
                    ↑
                  </button>
                  <button
                    className="icon"
                    aria-label="Move down"
                    disabled={idx === selection.skills.length - 1}
                    onClick={() => onChange({ ...selection, skills: move(selection.skills, idx, 1) })}
                  >
                    ↓
                  </button>
                  <button className="icon" aria-label="Remove" onClick={() => onChange({ ...selection, skills: selection.skills.filter((_, i) => i !== idx) })}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <AddSelect
            label="Add a skills line…"
            options={bank.variants
              .filter((v) => v.type === "Skills" && v.active && !pickedAll.has(v.id))
              .map((v) => ({ id: v.id, label: `${v.id}: ${short(v.text, 80)}`, disabled: false }))}
            onAdd={(id) => onChange({ ...selection, skills: [...selection.skills, { id, reason: "Added by you." }] })}
          />
        </div>

        <div className="card generate">
          <label>
            New doc name
            <input value={docName} onChange={(e) => setDocName(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={saveRecipe} onChange={(e) => setSaveRecipe(e.target.checked)} />
            Save these picks to the Recipes tab
          </label>
          {blocking.length > 0 && <p className="error small">Fix the items marked in red before generating.</p>}
          <button className="primary" disabled={generating || blocking.length > 0} onClick={generate}>
            {generating ? "Creating doc…" : "Generate Google Doc"}
          </button>
        </div>
      </section>

      <aside className="report">
        <Report report={result.report} picked={pickedAll} />
      </aside>
    </main>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const next = [...arr];
  const j = i + d;
  if (j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function BulletText({ b, id, reason }: { b?: Bullet; id: string; reason: string }) {
  return (
    <>
      <div className="text">{b?.text ?? <span className="error">Unknown bullet {id}</span>}</div>
      <div className="meta">
        {id}
        {b?.depth && <> · {b.depth}</>}
        {b?.emphasis && <> · {b.emphasis}</>}
      </div>
      {reason && <div className="reason">{reason}</div>}
    </>
  );
}

function VariantPicker({
  title,
  options,
  pick,
  onPick,
}: {
  title: string;
  options: Variant[];
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
}) {
  const current = options.find((o) => o.id === pick?.id);
  return (
    <div className="card">
      <div className="section-head">
        <h2>{title}</h2>
        <select
          aria-label={`Choose ${title.toLowerCase()}`}
          value={pick?.id ?? ""}
          onChange={(e) => onPick(e.target.value ? { id: e.target.value, reason: "Chosen by you." } : null)}
        >
          <option value="">None</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id}
            </option>
          ))}
        </select>
      </div>
      <div className="text">{current?.text ?? <span className="muted">None chosen</span>}</div>
      {pick?.reason && <div className="reason">{pick.reason}</div>}
    </div>
  );
}

function AddSelect({
  label,
  options,
  onAdd,
}: {
  label: string;
  options: { id: string; label: string; disabled: boolean }[];
  onAdd: (id: string) => void;
}) {
  if (!options.length) return null;
  return (
    <select
      className="add"
      aria-label={label}
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
      }}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Report({ report, picked }: { report: MatchReport; picked: Set<string> }) {
  return (
    <div className="card">
      <h2>Match report</h2>
      <ul className="reqs">
        {report.requirements.map((r) => {
          const still = r.covered_by.filter((id) => picked.has(id));
          const strength = r.strength !== "none" && still.length === 0 ? "none" : r.strength;
          return (
            <li key={r.requirement}>
              <span className={`chip ${strength}`}>{strength}</span>
              <span>{r.requirement}</span>
              {still.length > 0 && <div className="meta">{still.join(", ")}</div>}
              {strength === "none" && r.strength !== "none" && <div className="meta">Covering bullets were removed.</div>}
            </li>
          );
        })}
      </ul>
      {report.gaps.length > 0 && (
        <>
          <h3>Not covered by your bank</h3>
          <ul>
            {report.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}
      {report.notes && (
        <>
          <h3>Notes</h3>
          <p>{report.notes}</p>
        </>
      )}
    </div>
  );
}
