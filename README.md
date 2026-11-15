# Resume Builder

A small web app that builds a tailored resume for a job description:

1. You paste a job description.
2. Claude picks a tagline, summary, skills lines, and Work Experience bullets from your bullet bank (a Google Sheet), word for word, and writes a match report.
3. You review: swap, reorder, add, or remove items. The app enforces your rules (Excludes, one bullet per ID, bullet counts per job, one skills line per label).
4. The app copies your Google Docs template, fills it in, and can log the picks to the Recipes tab of your Sheet.

Only the Google account in `ALLOWED_EMAIL` can sign in. The app uses Google's `drive.file` access, so it can only open the files you choose in its file picker and the resumes it creates.

## Your files

### Bullet bank (Google Sheet)

| Tab | Columns |
|---|---|
| Bullets | ID, Bullet, Skills/Tags, Depth, Emphasis, Job, Excludes, Active |
| Variants | ID, Type (Tagline, Summary or Skills), Text, Notes, Active |
| Jobs | Job, Employer in template, Min bullets, Max bullets |
| Recipes | Recipe, Part, IDs, Created, Doc link, Notes |
| Rules | Rule |

- **Excludes** lists IDs that can never appear with this bullet, comma-separated. It works both ways, so you only need to list it on one side.
- **Job** must match a row on the Jobs tab. **Employer in template** is text from the employer line just above that job's bullets in the template, such as `City of Cincinnati`.
- **Active** = `N` keeps a row in the Sheet but never uses it.
- For Skills lines, the text before the first colon is the label, and it is set in bold in the doc.
- Rows on Recipes are examples of past choices that Claude learns from. The app adds a set of rows each time you generate a resume with "Save these picks" checked.

### Template (Google Doc)

Put these markers in the template. Each marker can have any formatting; the text that replaces it keeps that formatting.

| Marker | Replaced with |
|---|---|
| `{{TAGLINE}}` | The chosen tagline |
| `{{SUMMARY}}` | The chosen summary |
| `{{SKILLS}}` on its own line | The chosen skills lines, one per line, with labels in bold |
| `Bullets go here.` under each job | That job's bullets, keeping the line's bullet style |

If a marker is missing, the app leaves that part as typed and tells you.

## One-time setup

This takes about 30 minutes. You need a Google Cloud project, an Anthropic API key, and a free Vercel account.

### 1. Deploy to Vercel (to get the app's address)

1. Sign in at [vercel.com](https://vercel.com) with your GitHub account (Hobby plan, free).
2. **Add New → Project**, import `resume-builder`, and click **Deploy**. The first deploy works but sign-in won't until the steps below are done.
3. Note the address Vercel gives you, such as `https://resume-builder-abc.vercel.app`. Below it's called `APP_URL`.

### 2. Google Cloud

In [console.cloud.google.com](https://console.cloud.google.com), with your project selected:

1. **APIs & Services → Library**: enable **Google Docs API**, **Google Sheets API**, **Google Drive API**, and **Google Picker API**.
2. **Google Auth Platform → Branding**: app name "Resume Builder", your email as support and developer contact.
3. **Audience**: User type **External**. Click **Publish app** so it's **In production**. With only the scopes below, Google doesn't require verification. In "Testing" mode, sign-ins expire every 7 days.
4. **Data Access → Add or remove scopes**: add `openid`, `.../auth/userinfo.email`, and `.../auth/drive.file`.
5. **Clients → Create client**: type **Web application**.
   - Authorized JavaScript origins: `APP_URL`
   - Authorized redirect URIs: `APP_URL/api/auth/callback`
   - Save, then copy the **Client ID** and **Client secret**.
6. **APIs & Services → Credentials → Create credentials → API key**. Edit it: under API restrictions choose **Google Picker API**; under Application restrictions choose **Websites** and add `APP_URL/*`.
7. Find the **Project number** on the project's Dashboard (Project info card). It's all digits.

### 3. Environment variables in Vercel

In Vercel: **Project → Settings → Environment Variables**. Add each of these, then **Deployments → ⋯ → Redeploy**.

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | From step 2.5 |
| `GOOGLE_CLIENT_SECRET` | From step 2.5 |
| `GOOGLE_API_KEY` | From step 2.6 |
| `GOOGLE_PROJECT_NUMBER` | From step 2.7 |
| `ANTHROPIC_API_KEY` | From [platform.claude.com](https://platform.claude.com) → API keys |
| `ALLOWED_EMAIL` | The Google account allowed to sign in |
| `SESSION_SECRET` | A random string of 32+ characters (use a password generator) |
| `APP_URL` | Optional. Your address, if you add a custom domain |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5` |

Never put these values in the repository.

### 4. First run

Open `APP_URL`, sign in, then choose your template and bullet bank in the file picker.

## Costs

- Vercel Hobby: free for personal use.
- Google APIs: free at this volume.
- Claude API: each job description is one request, sometimes two if the first picks break a rule. Expect roughly 10 to 20 cents per run; the Anthropic console shows actual usage.

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

For local sign-in, add `http://localhost:3000` and `http://localhost:3000/api/auth/callback` to the OAuth client, and put the variables above in `.env.local`.

### How it's built

- Next.js on Vercel. No database: the session (Google refresh token) and the chosen file IDs are stored in encrypted, HTTP-only cookies.
- `lib/select.ts`: one Claude request with structured output. The bank is sent with every request, and the IDs Claude can return are limited to IDs in the bank. Server-side refusal fallback is turned on.
- `lib/validate.ts`: the rules, enforced in code on the server and in the review screen.
- `lib/docgen.ts`: the Google Docs edits that fill the template copy, applied in one batch.
