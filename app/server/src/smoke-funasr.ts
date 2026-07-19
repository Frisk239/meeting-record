/**
 * One-shot: upload real FunASR sample wav with ASR_ENGINE=funasr.
 * Run from app/server with env set (see docs/progress).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { resetDbForTests } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { waitForJobsIdle } from "./services/queue.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sample = path.join(
  root,
  "docs/design/reference/repos/FunASR/runtime/funasr_api/asr_example.wav",
);

if (!fs.existsSync(sample)) {
  console.error("sample missing", sample);
  process.exit(1);
}

console.error("[smoke-funasr] ASR_ENGINE=", config.asrEngine);
console.error("[smoke-funasr] python=", config.asrWorkerPython);
console.error("[smoke-funasr] sample=", sample);

resetDbForTests();
await migrate();
const app = createApp();

const reg = await app.request("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    username: "funasr_e2e",
    email: "funasr_e2e@example.com",
    password: "password123",
  }),
});
if (reg.status !== 201) {
  console.error("register", reg.status, await reg.text());
  process.exit(1);
}
const setCookie =
  (reg.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
let cookie = "";
for (const line of setCookie) {
  if (line.startsWith(config.cookieName + "=")) {
    cookie = line.split(";")[0]!;
    break;
  }
}

const bytes = fs.readFileSync(sample);
const form = new FormData();
form.append("file", new Blob([bytes], { type: "audio/wav" }), "asr_example.wav");
form.append("title", "FunASR 真转写验收");
form.append("source", "upload");

const up = await app.request("/api/meetings/upload", {
  method: "POST",
  headers: { cookie },
  body: form,
});
if (up.status !== 201) {
  console.error("upload", up.status, await up.text());
  process.exit(1);
}
const upBody = (await up.json()) as { meeting: { id: string }; jobId: string };
console.error("[smoke-funasr] job", upBody.jobId, "meeting", upBody.meeting.id);

// FunASR first load can be long; allow 30 min
await waitForJobsIdle({ meetingId: upBody.meeting.id, timeoutMs: 30 * 60 * 1000 });

const det = await app.request(`/api/meetings/${upBody.meeting.id}`, {
  headers: { cookie },
});
const body = (await det.json()) as {
  meeting: {
    status: string;
    minutesStatus: string;
    transcript: Array<{ speaker: string; startMs: number; endMs: number; text: string }>;
    jobs: Array<{ status: string; engine: string; errorMessage: string }>;
  };
};
const m = body.meeting;
const evidence = {
  ok: m.status === "ready" && m.jobs[0]?.status === "succeeded",
  meetingStatus: m.status,
  jobStatus: m.jobs[0]?.status,
  engine: m.jobs[0]?.engine,
  errorMessage: m.jobs[0]?.errorMessage || "",
  minutesStatus: m.minutesStatus,
  segmentCount: m.transcript.length,
  speakers: [...new Set(m.transcript.map((t) => t.speaker))],
  segments: m.transcript.map((t) => ({
    speaker: t.speaker,
    startMs: t.startMs,
    endMs: t.endMs,
    text: t.text,
  })),
};
console.log(JSON.stringify(evidence, null, 2));
resetDbForTests();
if (!evidence.ok || evidence.engine !== "funasr") {
  process.exit(2);
}
