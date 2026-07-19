import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-mtg-"));
const dbPath = path.join(tmpDir, "test.sqlite");
const dataDir = path.join(tmpDir, "data");

process.env.DATABASE_PATH = dbPath;
process.env.DATA_DIR = dataDir;
process.env.ALLOW_REGISTER = "true";
process.env.APP_NAME = "Meeting Record Test";
process.env.SESSION_SECRET = "test-secret";
process.env.MOCK_ASR_DELAY_MS = "50";
process.env.ASR_ENGINE = "mock";

const { resetDbForTests } = await import("./db/client.js");
const { migrate } = await import("./db/migrate.js");
const { createApp } = await import("./app.js");
const { config } = await import("./config.js");
const { waitForJobsIdle } = await import("./services/queue.js");

function cookieFrom(res: Response): string | undefined {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    for (const line of anyHeaders.getSetCookie()) {
      const m = line.match(new RegExp(`${config.cookieName}=([^;]+)`));
      if (m) return m[1];
    }
  }
  const single = res.headers.get("set-cookie");
  if (!single) return undefined;
  const m = single.match(new RegExp(`${config.cookieName}=([^;]+)`));
  return m?.[1];
}

async function register(
  app: ReturnType<typeof createApp>,
  username: string,
  email: string,
): Promise<string> {
  const res = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      email,
      password: "password123",
    }),
  });
  assert.equal(res.status, 201);
  const cookie = cookieFrom(res);
  assert.ok(cookie);
  return cookie;
}

describe("meetings + upload + mock transcript", () => {
  const app = createApp();
  let cookieA = "";
  let cookieB = "";

  before(async () => {
    resetDbForTests();
    await migrate();
    cookieA = await register(app, "alice", "alice@example.com");
    cookieB = await register(app, "bob", "bob@example.com");
  });

  after(() => {
    resetDbForTests();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("upload audio → serial job → transcript with speakers", async () => {
    const bytes = new Uint8Array(3200);
    bytes.fill(7);
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: "audio/webm" }),
      "demo.webm",
    );
    form.append("title", "S1 演示会");
    form.append("source", "upload");

    const up = await app.request("/api/meetings/upload", {
      method: "POST",
      headers: { cookie: `${config.cookieName}=${cookieA}` },
      body: form,
    });
    assert.equal(up.status, 201);
    const upBody = (await up.json()) as {
      meeting: { id: string; status: string; title: string };
      jobId: string;
    };
    assert.equal(upBody.meeting.title, "S1 演示会");
    assert.ok(upBody.jobId);

    await waitForJobsIdle({ meetingId: upBody.meeting.id, timeoutMs: 10_000 });

    const detail = await app.request(`/api/meetings/${upBody.meeting.id}`, {
      headers: { cookie: `${config.cookieName}=${cookieA}` },
    });
    assert.equal(detail.status, 200);
    const body = (await detail.json()) as {
      meeting: {
        status: string;
        transcript: Array<{ speaker: string; text: string }>;
        jobs: Array<{ status: string; engine: string }>;
      };
    };
    assert.equal(body.meeting.status, "ready");
    assert.ok(body.meeting.transcript.length >= 2);
    assert.ok(body.meeting.transcript.some((s) => s.speaker.startsWith("Speaker")));
    assert.equal(body.meeting.jobs[0]?.status, "succeeded");
    assert.equal(body.meeting.jobs[0]?.engine, "mock");

    const list = await app.request("/api/meetings", {
      headers: { cookie: `${config.cookieName}=${cookieA}` },
    });
    const listBody = (await list.json()) as {
      meetings: Array<{ id: string }>;
    };
    assert.equal(listBody.meetings.length, 1);
  });

  it("prevents IDOR across users", async () => {
    const listA = await app.request("/api/meetings", {
      headers: { cookie: `${config.cookieName}=${cookieA}` },
    });
    const aBody = (await listA.json()) as { meetings: Array<{ id: string }> };
    const id = aBody.meetings[0]?.id;
    assert.ok(id);

    const cross = await app.request(`/api/meetings/${id}`, {
      headers: { cookie: `${config.cookieName}=${cookieB}` },
    });
    assert.equal(cross.status, 404);

    const listB = await app.request("/api/meetings", {
      headers: { cookie: `${config.cookieName}=${cookieB}` },
    });
    const bBody = (await listB.json()) as { meetings: Array<{ id: string }> };
    assert.equal(bBody.meetings.length, 0);
  });

  it("rejects unauthenticated meeting list", async () => {
    const res = await app.request("/api/meetings");
    assert.equal(res.status, 401);
  });
});
