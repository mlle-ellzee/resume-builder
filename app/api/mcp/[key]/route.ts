/**
 * Connector for Claude chat (remote MCP server). The URL includes MCP_SECRET:
 *   https://<app>/api/mcp/<MCP_SECRET>
 * Its one tool saves a job description and returns a link that opens the app
 * with the fields filled in and bullet picking started.
 */
import { createMcpHandler } from "mcp-handler";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createDraft, draftsEnabled } from "@/lib/drafts";

function keyMatches(given: string): boolean {
  const secret = process.env.MCP_SECRET ?? "";
  if (secret.length < 24) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function appOrigin(req: Request): string {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

function buildHandler(origin: string) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "send_job_to_resume_builder",
        {
          title: "Send job to Resume Builder",
          description:
            "Save a job posting to the user's Resume Builder app and get a link that opens the app with the posting filled in and starts picking resume bullets. Use only when the user asks to send a job to the resume builder or to start a resume for it. Pass the job description as the complete original posting text, not a summary. After calling, give the user the returned link exactly as written.",
          inputSchema: z.object({
            company: z.string().max(200).describe("Company name"),
            role: z.string().max(200).describe("Job title as written in the posting"),
            job_description: z
              .string()
              .min(50)
              .max(60000)
              .describe("The full job posting text, verbatim, including responsibilities and qualifications"),
            fit_notes: z
              .string()
              .max(2000)
              .optional()
              .describe("Optional: one to three sentences from the conversation about fit or what to emphasize"),
          }),
        },
        async ({ company, role, job_description, fit_notes }) => {
          const draft = await createDraft({
            company: company.trim(),
            role: role.trim(),
            jobDescription: job_description.trim(),
            notes: (fit_notes ?? "").trim(),
          });
          const link = `${origin}/?draft=${draft.id}`;
          return {
            content: [
              {
                type: "text",
                text: `Saved "${draft.role || "job"}" at ${draft.company || "the company"} to Resume Builder. Open this link to review the picks: ${link}\nThe job also waits in the app's Inbox for 30 days.`,
              },
            ],
          };
        },
      );
    },
    { serverInfo: { name: "resume-builder", version: "1.0.0" } },
  );
}

async function handle(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!keyMatches(key)) return new Response("Not found", { status: 404 });
  if (!draftsEnabled()) return new Response("Draft storage isn't set up.", { status: 503 });
  return buildHandler(appOrigin(req))(req);
}

export { handle as GET, handle as POST, handle as DELETE };
