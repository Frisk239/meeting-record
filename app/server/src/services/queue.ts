import { and, asc, eq, inArray } from "drizzle-orm";
import { openDb } from "../db/client.js";
import {
  meetings,
  recordings,
  transcriptSegments,
  transcriptionJobs,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { config } from "../config.js";
import { getAsrEngine } from "./asr/index.js";
import {
  clearCancelled,
  clearRunningJob,
  isJobCancelled,
  killRunningWorker,
  markJobCancelled,
} from "./jobControl.js";

/**
 * In-process serial transcription queue.
 * At most one job runs at a time (4C4G / ADR 0003).
 */

let running = false;
let kickScheduled = false;

export function enqueueKick(): void {
  if (kickScheduled) return;
  kickScheduled = true;
  setTimeout(() => {
    kickScheduled = false;
    void pump();
  }, 0);
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (true) {
      const db = openDb();
      const next = await db
        .select()
        .from(transcriptionJobs)
        .where(eq(transcriptionJobs.status, "queued"))
        .orderBy(asc(transcriptionJobs.createdAt))
        .limit(1);
      const job = next[0];
      if (!job) break;

      if (isJobCancelled(job.id)) {
        clearCancelled(job.id);
        await db
          .update(transcriptionJobs)
          .set({
            status: "failed",
            errorMessage: "用户已取消",
            finishedAt: new Date(),
          })
          .where(eq(transcriptionJobs.id, job.id));
        continue;
      }

      const now = new Date();
      await db
        .update(transcriptionJobs)
        .set({ status: "running", startedAt: now })
        .where(eq(transcriptionJobs.id, job.id));
      await db
        .update(meetings)
        .set({ status: "processing", updatedAt: now })
        .where(eq(meetings.id, job.meetingId));

      try {
        await runJob(job.id);
      } catch (err) {
        if (isJobCancelled(job.id)) {
          clearCancelled(job.id);
          clearRunningJob(job.id);
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        const failedAt = new Date();
        await db
          .update(transcriptionJobs)
          .set({
            status: "failed",
            errorMessage: message.slice(0, 500),
            finishedAt: failedAt,
          })
          .where(eq(transcriptionJobs.id, job.id));
        await db
          .update(meetings)
          .set({ status: "failed", updatedAt: failedAt })
          .where(eq(meetings.id, job.meetingId));
      }
    }
  } finally {
    running = false;
  }
}

async function runJob(jobId: string): Promise<void> {
  const db = openDb();
  const jobRows = await db
    .select()
    .from(transcriptionJobs)
    .where(eq(transcriptionJobs.id, jobId))
    .limit(1);
  const job = jobRows[0];
  if (!job) return;

  if (isJobCancelled(jobId)) {
    clearCancelled(jobId);
    return;
  }

  const recRows = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, job.recordingId))
    .limit(1);
  const rec = recRows[0];
  const meetRows = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, job.meetingId))
    .limit(1);
  const meeting = meetRows[0];
  if (!rec || !meeting) {
    throw new Error("录音或会议不存在");
  }

  const engine = getAsrEngine();
  console.log(
    `[queue] job ${jobId} start engine=${engine.name} meeting=${job.meetingId} file=${rec.originalFilename || rec.storagePath}`,
  );
  await db
    .update(transcriptionJobs)
    .set({
      progressPercent: 1,
      progressStage: "queued",
      progressMessage: "开始转写",
    })
    .where(eq(transcriptionJobs.id, jobId));

  const t0 = Date.now();
  let lastPct = -1;
  const result = await engine.transcribe({
    audioPath: rec.storagePath,
    mimeType: rec.mimeType,
    originalFilename: rec.originalFilename,
    meetingTitle: meeting.title,
    jobId,
    onProgress: (p) => {
      // fire-and-forget DB write; throttle tiny updates
      if (p.percent === lastPct && p.percent < 100) return;
      lastPct = p.percent;
      void openDb()
        .update(transcriptionJobs)
        .set({
          progressPercent: p.percent,
          progressStage: p.stage.slice(0, 64),
          progressMessage: (p.message || "").slice(0, 240),
        })
        .where(eq(transcriptionJobs.id, jobId))
        .then(() => undefined)
        .catch(() => undefined);
    },
  });
  console.log(
    `[queue] job ${jobId} asr finished in ${((Date.now() - t0) / 1000).toFixed(1)}s status=${result.status} engine=${result.engine} segs=${result.segments.length}`,
  );

  // Re-check cancel (user aborted while running)
  if (result.status === "cancelled" || isJobCancelled(jobId)) {
    clearCancelled(jobId);
    clearRunningJob(jobId);
    console.log(`[queue] job ${jobId} cancelled — skip transcript write`);
    // Meeting status already set by cancelMeetingJobs / leave as-is if deleted
    const still = await db
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, jobId))
      .limit(1);
    if (still[0] && still[0].status === "running") {
      await db
        .update(transcriptionJobs)
        .set({
          status: "failed",
          errorMessage: "用户已终止转写",
          finishedAt: new Date(),
          engine: result.engine || config.asrEngine,
        })
        .where(eq(transcriptionJobs.id, jobId));
      await db
        .update(meetings)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(meetings.id, job.meetingId));
    }
    return;
  }

  const finishedAt = new Date();

  if (result.status === "failed") {
    await db
      .update(transcriptionJobs)
      .set({
        status: "failed",
        engine: result.engine,
        errorMessage: (result.errorMessage || "转写失败").slice(0, 500),
        progressPercent: 100,
        progressStage: "error",
        progressMessage: (result.errorMessage || "转写失败").slice(0, 240),
        finishedAt,
      })
      .where(eq(transcriptionJobs.id, jobId));
    await db
      .update(meetings)
      .set({ status: "failed", updatedAt: finishedAt })
      .where(eq(meetings.id, job.meetingId));
    return;
  }

  // Replace segments for this meeting (MVP: one active transcript per meeting)
  await db
    .delete(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, job.meetingId));

  for (let i = 0; i < result.segments.length; i++) {
    const seg = result.segments[i]!;
    await db.insert(transcriptSegments).values({
      id: newId("seg"),
      meetingId: job.meetingId,
      recordingId: job.recordingId,
      jobId: job.id,
      idx: i,
      speaker: seg.speaker,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
      confidence: seg.confidence ?? null,
    });
  }

  const jobStatus = result.status === "degraded" ? "degraded" : "succeeded";
  await db
    .update(transcriptionJobs)
    .set({
      status: jobStatus,
      engine: result.engine,
      errorMessage: result.errorMessage?.slice(0, 500) || "",
      progressPercent: 100,
      progressStage: "done",
      progressMessage: "转写完成",
      finishedAt,
    })
    .where(eq(transcriptionJobs.id, jobId));

  const preview = result.segments
    .map((s) => s.text)
    .join(" ")
    .slice(0, 160);

  await db
    .update(meetings)
    .set({
      status: "ready",
      summary: preview,
      minutesStatus: "generating",
      updatedAt: finishedAt,
    })
    .where(eq(meetings.id, job.meetingId));

  // Auto Minutes off the serial ASR lock so next jobs / cancel stay responsive
  const meetingIdForMinutes = job.meetingId;
  const userIdForMinutes = job.userId;
  void (async () => {
    try {
      const { generateMinutesForMeeting } = await import("./minutes.js");
      await generateMinutesForMeeting(meetingIdForMinutes, userIdForMinutes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        const db2 = openDb();
        await db2
          .update(meetings)
          .set({
            minutesStatus: "failed",
            updatedAt: new Date(),
            summary: preview,
          })
          .where(eq(meetings.id, meetingIdForMinutes));
      } catch {
        // meeting may have been deleted
      }
      console.error("[auto-minutes]", meetingIdForMinutes, message);
    }
  })();
}

export async function createJobForRecording(input: {
  meetingId: string;
  recordingId: string;
  userId: string;
}): Promise<string> {
  const db = openDb();
  const id = newId("job");
  const now = new Date();
  await db.insert(transcriptionJobs).values({
    id,
    meetingId: input.meetingId,
    recordingId: input.recordingId,
    userId: input.userId,
    status: "queued",
    engine: config.asrEngine,
    errorMessage: "",
    progressPercent: 0,
    progressStage: "queued",
    progressMessage: "排队中",
    createdAt: now,
    startedAt: null,
    finishedAt: null,
  });
  await db
    .update(meetings)
    .set({ status: "processing", updatedAt: now })
    .where(eq(meetings.id, input.meetingId));
  enqueueKick();
  return id;
}

/**
 * Cancel queued jobs and abort running FunASR for a meeting.
 * Does not delete the meeting.
 */
export async function cancelMeetingJobs(
  meetingId: string,
  userId: string,
): Promise<{ cancelledJobIds: string[] }> {
  const db = openDb();
  const active = await db
    .select()
    .from(transcriptionJobs)
    .where(
      and(
        eq(transcriptionJobs.meetingId, meetingId),
        eq(transcriptionJobs.userId, userId),
        inArray(transcriptionJobs.status, ["queued", "running"]),
      ),
    );

  const cancelledJobIds: string[] = [];
  const now = new Date();

  for (const job of active) {
    markJobCancelled(job.id);
    cancelledJobIds.push(job.id);
    if (job.status === "running") {
      killRunningWorker(job.id);
    }
    await db
      .update(transcriptionJobs)
      .set({
        status: "failed",
        errorMessage: "用户已终止转写",
        finishedAt: now,
      })
      .where(eq(transcriptionJobs.id, job.id));
  }

  if (cancelledJobIds.length) {
    await db
      .update(meetings)
      .set({ status: "failed", updatedAt: now, minutesStatus: "none" })
      .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)));
    console.log(
      `[queue] cancel meeting=${meetingId} jobs=${cancelledJobIds.join(",")}`,
    );
  }

  // Allow pump to pick next meeting's job
  enqueueKick();
  return { cancelledJobIds };
}

/** For tests: wait until no queued/running jobs for user/meeting. */
export async function waitForJobsIdle(opts?: {
  meetingId?: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    enqueueKick();
    const db = openDb();
    const rows = await db
      .select()
      .from(transcriptionJobs)
      .where(
        opts?.meetingId
          ? and(
              eq(transcriptionJobs.meetingId, opts.meetingId),
              inArray(transcriptionJobs.status, ["queued", "running"]),
            )
          : inArray(transcriptionJobs.status, ["queued", "running"]),
      )
      .limit(1);
    // Only wait for transcription jobs; Auto Minutes runs off the ASR lock
    if (!rows.length) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitForJobsIdle timeout");
}
