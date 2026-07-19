import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { exportMarkdown, exportPdf } from "../services/export.js";
import {
  attachRecordingAndEnqueue,
  createMeeting,
  getMeeting,
  listMeetings,
  renameMeeting,
} from "../services/meetings.js";
import {
  generateMinutesForMeeting,
  getMinutes,
  saveMinutesMarkdown,
} from "../services/minutes.js";
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
  const body = z
    .object({ markdown: z.string() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const user = c.get("user");
  const minutes = await saveMinutesMarkdown(
    user.id,
    c.req.param("id"),
    body.data.markdown,
  );
  return c.json({ minutes });
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
