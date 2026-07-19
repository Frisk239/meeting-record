import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  attachRecordingAndEnqueue,
  createMeeting,
  getMeeting,
  listMeetings,
  renameMeeting,
} from "../services/meetings.js";
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

/**
 * Multipart upload:
 * - file: audio blob (required)
 * - meetingId: optional existing meeting
 * - title: optional title when creating new meeting
 * - source: upload | browser
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
    filename: blob.name || (source === "browser" ? "browser-recording.webm" : "upload.bin"),
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
