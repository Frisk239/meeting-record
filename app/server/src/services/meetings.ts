import { and, desc, eq } from "drizzle-orm";
import { openDb } from "../db/client.js";
import {
  meetings,
  recordings,
  transcriptSegments,
  transcriptionJobs,
  type Meeting,
  type Recording,
  type TranscriptSegment,
  type TranscriptionJob,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { createJobForRecording } from "./queue.js";
import { extFromFilename, mediaPathFor, writeUpload } from "./storage.js";

export type MeetingListItem = {
  id: string;
  title: string;
  status: string;
  summary: string;
  minutesStatus: string;
  createdAt: string;
  updatedAt: string;
  latestJobStatus: string | null;
};

export type MeetingDetail = MeetingListItem & {
  recordings: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    source: string;
    createdAt: string;
    durationMs: number | null;
  }>;
  jobs: Array<{
    id: string;
    status: string;
    engine: string;
    errorMessage: string;
    progressPercent: number;
    progressStage: string;
    progressMessage: string;
    recordingId: string;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  transcript: Array<{
    id: string;
    idx: number;
    speaker: string;
    startMs: number;
    endMs: number;
    text: string;
  }>;
  /** Latest recording for playback UI */
  primaryRecordingId: string | null;
  durationMs: number | null;
  minutesMarkdown: string;
  minutes: unknown | null;
  insightsStatus: string;
  insightsMarkdown: string;
};

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function toListItem(m: Meeting, latestJobStatus: string | null): MeetingListItem {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    summary: m.summary,
    minutesStatus: m.minutesStatus ?? "none",
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    latestJobStatus,
  };
}

async function latestJobStatus(meetingId: string): Promise<string | null> {
  const db = openDb();
  const rows = await db
    .select()
    .from(transcriptionJobs)
    .where(eq(transcriptionJobs.meetingId, meetingId))
    .orderBy(desc(transcriptionJobs.createdAt))
    .limit(1);
  return rows[0]?.status ?? null;
}

export async function listMeetings(userId: string): Promise<MeetingListItem[]> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(eq(meetings.userId, userId))
    .orderBy(desc(meetings.createdAt));
  const out: MeetingListItem[] = [];
  for (const m of rows) {
    out.push(toListItem(m, await latestJobStatus(m.id)));
  }
  return out;
}

export async function getMeeting(
  userId: string,
  meetingId: string,
): Promise<MeetingDetail> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");

  const recs = await db
    .select()
    .from(recordings)
    .where(eq(recordings.meetingId, meetingId))
    .orderBy(desc(recordings.createdAt));
  const jobs = await db
    .select()
    .from(transcriptionJobs)
    .where(eq(transcriptionJobs.meetingId, meetingId))
    .orderBy(desc(transcriptionJobs.createdAt));
  const segs = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meetingId))
    .orderBy(transcriptSegments.idx);

  const primary = recs[0] ?? null;
  const lastEnd =
    segs.length > 0
      ? Math.max(...segs.map((s: TranscriptSegment) => s.endMs || 0))
      : null;
  const durationMs =
    primary?.durationMs ??
    lastEnd ??
    (primary?.byteSize ? Math.max(1000, Math.round(primary.byteSize / 16)) : null);

  return {
    ...toListItem(m, jobs[0]?.status ?? null),
    recordings: recs.map((r: Recording) => ({
      id: r.id,
      originalFilename: r.originalFilename,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      durationMs: r.durationMs,
    })),
    jobs: jobs.map((j: TranscriptionJob) => ({
      id: j.id,
      status: j.status,
      engine: j.engine,
      errorMessage: j.errorMessage,
      progressPercent: j.progressPercent ?? 0,
      progressStage: j.progressStage || "",
      progressMessage: j.progressMessage || "",
      recordingId: j.recordingId,
      createdAt: j.createdAt.toISOString(),
      startedAt: iso(j.startedAt),
      finishedAt: iso(j.finishedAt),
    })),
    transcript: segs.map((s: TranscriptSegment) => ({
      id: s.id,
      idx: s.idx,
      speaker: s.speaker,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
    })),
    primaryRecordingId: primary?.id ?? null,
    durationMs,
    minutesMarkdown: m.minutesMarkdown || "",
    minutes: m.minutesJson
      ? (() => {
          try {
            return JSON.parse(m.minutesJson);
          } catch {
            return null;
          }
        })()
      : null,
    insightsStatus: m.insightsStatus || "none",
    insightsMarkdown: m.insightsMarkdown || "",
  };
}

/** Resolve owned recording file for streaming. */
export async function getOwnedRecordingFile(
  userId: string,
  meetingId: string,
  recordingId?: string,
): Promise<{ path: string; mimeType: string; filename: string }> {
  const db = openDb();
  await assertMeetingOwner(userId, meetingId);
  let rec: Recording | undefined;
  if (recordingId) {
    const rows = await db
      .select()
      .from(recordings)
      .where(
        and(
          eq(recordings.id, recordingId),
          eq(recordings.meetingId, meetingId),
          eq(recordings.userId, userId),
        ),
      )
      .limit(1);
    rec = rows[0];
  } else {
    const rows = await db
      .select()
      .from(recordings)
      .where(and(eq(recordings.meetingId, meetingId), eq(recordings.userId, userId)))
      .orderBy(desc(recordings.createdAt))
      .limit(1);
    rec = rows[0];
  }
  if (!rec) throw notFound("录音不存在");
  return {
    path: rec.storagePath,
    mimeType: rec.mimeType || "application/octet-stream",
    filename: rec.originalFilename || "audio",
  };
}

export async function createMeeting(
  userId: string,
  title?: string,
): Promise<MeetingListItem> {
  const db = openDb();
  const now = new Date();
  const id = newId("mtg");
  const t =
    title?.trim() ||
    `新录音 ${now.toLocaleString("zh-CN", { hour12: false })}`;
  await db.insert(meetings).values({
    id,
    userId,
    title: t,
    status: "draft",
    summary: "",
    minutesStatus: "none",
    minutesJson: null,
    minutesMarkdown: "",
    insightsStatus: "none",
    insightsMarkdown: "",
    createdAt: now,
    updatedAt: now,
  });
  return toListItem(
    {
      id,
      userId,
      title: t,
      status: "draft",
      summary: "",
      minutesStatus: "none",
      minutesJson: null,
      minutesMarkdown: "",
      insightsStatus: "none",
      insightsMarkdown: "",
      createdAt: now,
      updatedAt: now,
    },
    null,
  );
}

export async function renameMeeting(
  userId: string,
  meetingId: string,
  title: string,
): Promise<MeetingListItem> {
  const t = title.trim();
  if (!t) throw badRequest("标题不能为空");
  if (t.length > 200) throw badRequest("标题过长");
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("会议不存在");
  const now = new Date();
  await db
    .update(meetings)
    .set({ title: t, updatedAt: now })
    .where(eq(meetings.id, meetingId));
  return toListItem({ ...rows[0], title: t, updatedAt: now }, await latestJobStatus(meetingId));
}

export async function assertMeetingOwner(userId: string, meetingId: string): Promise<Meeting> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("会议不存在");
  return rows[0];
}

export async function attachRecordingAndEnqueue(input: {
  userId: string;
  meetingId?: string;
  title?: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  source: "upload" | "browser";
}): Promise<{ meeting: MeetingDetail; jobId: string }> {
  if (!input.bytes?.byteLength) throw badRequest("空文件");
  // Soft cap ~200MB for 4G box demos
  if (input.bytes.byteLength > 200 * 1024 * 1024) {
    throw badRequest("文件过大");
  }

  let meetingId = input.meetingId;
  if (meetingId) {
    await assertMeetingOwner(input.userId, meetingId);
  } else {
    const created = await createMeeting(input.userId, input.title);
    meetingId = created.id;
  }

  const recordingId = newId("rec");
  const ext = extFromFilename(input.filename, input.mimeType);
  const storagePath = mediaPathFor(input.userId, recordingId, ext);
  await writeUpload(storagePath, Buffer.from(input.bytes));

  const db = openDb();
  const now = new Date();
  await db.insert(recordings).values({
    id: recordingId,
    meetingId,
    userId: input.userId,
    storagePath,
    originalFilename: input.filename || `recording${ext}`,
    mimeType: input.mimeType || "application/octet-stream",
    byteSize: input.bytes.byteLength,
    durationMs: null,
    source: input.source,
    createdAt: now,
  });

  const jobId = await createJobForRecording({
    meetingId,
    recordingId,
    userId: input.userId,
  });

  const detail = await getMeeting(input.userId, meetingId);
  return { meeting: detail, jobId };
}

/** IDOR guard helper for tests / other routes */
export function denyCrossUser(): never {
  throw forbidden("无权访问该资源");
}

/**
 * Delete meeting + cascade DB rows; best-effort remove audio files on disk.
 * Cancels in-flight jobs first.
 */
export async function deleteMeeting(userId: string, meetingId: string): Promise<void> {
  const m = await assertMeetingOwner(userId, meetingId);
  const { cancelMeetingJobs } = await import("./queue.js");
  await cancelMeetingJobs(meetingId, userId);

  const db = openDb();
  const recs = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.meetingId, meetingId), eq(recordings.userId, userId)));

  await db.delete(meetings).where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)));

  for (const r of recs) {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(r.storagePath);
    } catch {
      // file may already be gone
    }
  }
  console.log(`[meetings] deleted ${m.id} user=${userId} files=${recs.length}`);
}
