import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { exportMarkdown, exportPdf } from "../services/export.js";
import {
  attachRecordingAndEnqueue,
  createMeeting,
  deleteMeeting,
  getMeeting,
  getOwnedRecordingFile,
  listMeetings,
  renameMeeting,
} from "../services/meetings.js";
import { cancelMeetingJobs, retranscribeMeeting } from "../services/queue.js";
import { generateInsights, getInsights } from "../services/insights.js";
import {
  generateMinutesForMeeting,
  getMinutes,
  saveMinutesDoc,
  saveMinutesMarkdown,
} from "../services/minutes.js";
import { askQuestion, createSession, getQaState } from "../services/qa.js";
import { ensureMediaDirs } from "../services/storage.js";

export const meetingRoutes = new Hono<{ Variables: AuthVariables }>();

meetingRoutes.use("*", requireAuth);

meetingRoutes.get("/", async (c) => {
  const user = c.get("user");
  const items = await listMeetings(user.id);
  return c.json({ meetings: items });
});

meetingRoutes.post("/", async (c) => {
  const body = z
    .object({ title: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const user = c.get("user");
  const meeting = await createMeeting(user.id, body.data.title);
  return c.json({ meeting }, 201);
});

/**
 * Multipart upload (static path before /:id)
 */
meetingRoutes.post("/upload", async (c) => {
  ensureMediaDirs();
  const user = c.get("user");
  const form = await c.req.parseBody({ all: true });
  const file = form["file"];
  if (!file || typeof file === "string") {
    throw badRequest("缺少音频文件 file");
  }
  const blob = file as File;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const meetingIdRaw = form["meetingId"];
  const titleRaw = form["title"];
  const sourceRaw = form["source"];
  const meetingId =
    typeof meetingIdRaw === "string" && meetingIdRaw.trim()
      ? meetingIdRaw.trim()
      : undefined;
  const title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : undefined;
  const source =
    sourceRaw === "browser" || sourceRaw === "upload" ? sourceRaw : "upload";

  const result = await attachRecordingAndEnqueue({
    userId: user.id,
    meetingId,
    title,
    filename:
      blob.name || (source === "browser" ? "browser-recording.webm" : "upload.bin"),
    mimeType: blob.type || "application/octet-stream",
    bytes: buf,
    source,
  });

  return c.json(
    {
      meeting: result.meeting,
      jobId: result.jobId,
    },
    201,
  );
});

meetingRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const meeting = await getMeeting(user.id, c.req.param("id"));
  return c.json({ meeting });
});

meetingRoutes.patch("/:id", async (c) => {
  const body = z
    .object({ title: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const user = c.get("user");
  const meeting = await renameMeeting(user.id, c.req.param("id"), body.data.title);
  return c.json({ meeting });
});

/** Delete meeting (and cancel any running/queued jobs). */
meetingRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  await deleteMeeting(user.id, c.req.param("id"));
  return c.json({ ok: true });
});

/**
 * Abort transcription for this meeting (queued → cancel; running → kill worker).
 * Meeting is kept; status becomes failed with message 用户已终止转写.
 */
meetingRoutes.post("/:id/jobs/cancel", async (c) => {
  const user = c.get("user");
  const meetingId = c.req.param("id");
  // ownership
  await getMeeting(user.id, meetingId);
  const result = await cancelMeetingJobs(meetingId, user.id);
  const meeting = await getMeeting(user.id, meetingId);
  return c.json({ ok: true, ...result, meeting });
});

/**
 * Re-run ASR on existing recording (e.g. after encoding fix).
 * Body optional: { recordingId?: string }. Defaults to latest recording.
 */
meetingRoutes.post("/:id/jobs/retranscribe", async (c) => {
  const user = c.get("user");
  const meetingId = c.req.param("id");
  const body = z
    .object({ recordingId: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  await getMeeting(user.id, meetingId);
  const result = await retranscribeMeeting(
    meetingId,
    user.id,
    body.data.recordingId,
  );
  const meeting = await getMeeting(user.id, meetingId);
  return c.json({ ok: true, ...result, meeting }, 201);
});

meetingRoutes.get("/:id/minutes", async (c) => {
  const user = c.get("user");
  const minutes = await getMinutes(user.id, c.req.param("id"));
  return c.json({ minutes });
});

meetingRoutes.post("/:id/minutes/generate", async (c) => {
  const user = c.get("user");
  const minutes = await generateMinutesForMeeting(c.req.param("id"), user.id);
  return c.json({ minutes });
});

meetingRoutes.put("/:id/minutes", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const user = c.get("user");
  const id = c.req.param("id");

  if (raw && typeof raw === "object" && "markdown" in raw && Object.keys(raw as object).length === 1) {
    const body = z.object({ markdown: z.string() }).safeParse(raw);
    if (!body.success) throw badRequest("请求体无效");
    const minutes = await saveMinutesMarkdown(user.id, id, body.data.markdown);
    return c.json({ minutes });
  }

  const structured = z
    .object({
      topic: z.string().optional(),
      time: z.string().optional(),
      place: z.string().optional(),
      participants: z.string().optional(),
      goal: z.string().optional(),
      topics: z
        .array(
          z.object({
            title: z.string(),
            bullets: z.array(z.string()).default([]),
            sub: z.string().optional(),
          }),
        )
        .optional(),
      disputes: z.array(z.string()).optional(),
      actionItems: z
        .array(z.object({ owner: z.string(), action: z.string() }))
        .optional(),
      timeline: z
        .array(
          z.union([
            z.string(),
            z.object({
              t: z.string().optional(),
              title: z.string().optional(),
              body: z.string().optional(),
            }),
          ]),
        )
        .optional(),
      markdown: z.string().optional(),
    })
    .safeParse(raw);
  if (!structured.success) throw badRequest("请求体无效");

  if (
    structured.data.markdown &&
    structured.data.topic === undefined &&
    structured.data.topics === undefined
  ) {
    const minutes = await saveMinutesMarkdown(user.id, id, structured.data.markdown);
    return c.json({ minutes });
  }

  const minutes = await saveMinutesDoc(user.id, id, {
    ...structured.data,
    timeline: structured.data.timeline as
      | string[]
      | Array<{ t?: string; title?: string; body?: string }>
      | undefined,
  });
  return c.json({ minutes });
});

/** Serve latest (or specified) recording audio for transcript player. */
meetingRoutes.get("/:id/audio", async (c) => {
  const user = c.get("user");
  const recordingId = c.req.query("recordingId") || undefined;
  const file = await getOwnedRecordingFile(user.id, c.req.param("id"), recordingId);
  const buf = await readFile(file.path);
  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": file.mimeType || "application/octet-stream",
      "content-length": String(buf.byteLength),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
    },
  });
});

meetingRoutes.get("/:id/qa", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.query("sessionId") || undefined;
  const state = await getQaState(user.id, c.req.param("id"), sessionId);
  return c.json(state);
});

meetingRoutes.post("/:id/qa/sessions", async (c) => {
  const user = c.get("user");
  const body = z
    .object({ title: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  const session = await createSession(
    user.id,
    c.req.param("id"),
    body.success ? body.data.title : undefined,
  );
  return c.json({ session, turns: [] as const }, 201);
});

meetingRoutes.post("/:id/qa", async (c) => {
  const body = z
    .object({
      question: z.string().min(1),
      sessionId: z.string().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const user = c.get("user");
  const result = await askQuestion(
    user.id,
    c.req.param("id"),
    body.data.question,
    body.data.sessionId,
  );
  return c.json(result, 201);
});

meetingRoutes.get("/:id/insights", async (c) => {
  const user = c.get("user");
  const insights = await getInsights(user.id, c.req.param("id"));
  return c.json({ insights });
});

meetingRoutes.post("/:id/insights/generate", async (c) => {
  const user = c.get("user");
  const insights = await generateInsights(user.id, c.req.param("id"));
  return c.json({ insights });
});

meetingRoutes.get("/:id/export.md", async (c) => {
  const user = c.get("user");
  const includeTranscript = c.req.query("transcript") === "1";
  const file = await exportMarkdown(user.id, c.req.param("id"), includeTranscript);
  return new Response(file.content, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
});

meetingRoutes.get("/:id/export.pdf", async (c) => {
  const user = c.get("user");
  const includeTranscript = c.req.query("transcript") === "1";
  const file = await exportPdf(user.id, c.req.param("id"), includeTranscript);
  return new Response(Buffer.from(file.bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
});
