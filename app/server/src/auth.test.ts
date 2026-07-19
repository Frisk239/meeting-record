import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mr-auth-"));
const dbPath = path.join(tmpDir, "test.sqlite");

process.env.DATABASE_PATH = dbPath;
process.env.ALLOW_REGISTER = "true";
process.env.APP_NAME = "Meeting Record Test";
process.env.SESSION_SECRET = "test-secret";
process.env.LLM_BASE_URL = "https://env.example/v1";
process.env.LLM_MODEL = "env-model";
process.env.LLM_API_KEY = "env-secret-key-9999";

const { resetDbForTests } = await import("./db/client.js");
const { migrate } = await import("./db/migrate.js");
const { createApp } = await import("./app.js");
const { config } = await import("./config.js");

function cookieFrom(res: Response): string | undefined {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    const all = anyHeaders.getSetCookie();
    for (const line of all) {
      const m = line.match(new RegExp(`${config.cookieName}=([^;]+)`));
      if (m) return m[1];
    }
  }
  const single = res.headers.get("set-cookie");
  if (!single) return undefined;
  const m = single.match(new RegExp(`${config.cookieName}=([^;]+)`));
  return m?.[1];
}

describe("auth + llm settings", () => {
  const app = createApp();

  before(async () => {
    resetDbForTests();
    await migrate();
  });

  after(() => {
    resetDbForTests();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Windows may keep a brief lock on the sqlite file; ignore cleanup.
    }
  });

  it("health and meta", async () => {
    const health = await app.request("/api/health");
    assert.equal(health.status, 200);
    const hj = (await health.json()) as { ok: boolean };
    assert.equal(hj.ok, true);

    const meta = await app.request("/api/auth/meta");
    assert.equal(meta.status, 200);
    const mj = (await meta.json()) as {
      registrationOpen: boolean;
      appName: string;
    };
    assert.equal(mj.registrationOpen, true);
    assert.equal(mj.appName, "Meeting Record Test");
    assert.equal("ALLOW_REGISTER" in mj, false);
  });

  it("rejects unauthenticated /me", async () => {
    const res = await app.request("/api/auth/me");
    assert.equal(res.status, 401);
  });

  it("register → me → llm settings → logout", async () => {
    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      }),
    });
    assert.equal(reg.status, 201);
    const regBody = (await reg.json()) as { user: { username: string } };
    assert.equal(regBody.user.username, "alice");
    const cookie = cookieFrom(reg);
    assert.ok(cookie, "session cookie set");

    const me = await app.request("/api/auth/me", {
      headers: { cookie: `${config.cookieName}=${cookie}` },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as {
      user: { email: string };
      llm: {
        baseUrl: string;
        modelId: string;
        hasApiKey: boolean;
        source: string;
        apiKeyMasked: string;
      };
    };
    assert.equal(meBody.user.email, "alice@example.com");
    // Falls back to env defaults when user has not set LLM
    assert.equal(meBody.llm.baseUrl, "https://env.example/v1");
    assert.equal(meBody.llm.modelId, "env-model");
    assert.equal(meBody.llm.hasApiKey, true);
    assert.equal(meBody.llm.source, "env");
    assert.ok(String(meBody.llm.apiKeyMasked).includes("9999"));
    assert.ok(!String(meBody.llm.apiKeyMasked).includes("env-secret-key"));

    const put = await app.request("/api/auth/settings/llm", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: `${config.cookieName}=${cookie}`,
      },
      body: JSON.stringify({
        baseUrl: "https://user.example/v1",
        modelId: "gpt-user",
        apiKey: "sk-user-secret-abcd",
      }),
    });
    assert.equal(put.status, 200);
    const putBody = (await put.json()) as {
      llm: {
        baseUrl: string;
        modelId: string;
        source: string;
        apiKeyMasked: string;
      };
    };
    assert.equal(putBody.llm.baseUrl, "https://user.example/v1");
    assert.equal(putBody.llm.modelId, "gpt-user");
    assert.equal(putBody.llm.source, "user");
    assert.ok(String(putBody.llm.apiKeyMasked).endsWith("abcd"));
    assert.ok(!JSON.stringify(putBody).includes("sk-user-secret"));

    const logoutRes = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${config.cookieName}=${cookie}` },
    });
    assert.equal(logoutRes.status, 200);

    const meAfter = await app.request("/api/auth/me", {
      headers: { cookie: `${config.cookieName}=${cookie}` },
    });
    assert.equal(meAfter.status, 401);
  });

  it("login with username and rejects bad password", async () => {
    const bad = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "alice", password: "wrong-password" }),
    });
    assert.equal(bad.status, 401);

    const ok = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "alice", password: "password123" }),
    });
    assert.equal(ok.status, 200);
    const cookie = cookieFrom(ok);
    assert.ok(cookie);

    // Bearer token also works
    const me = await app.request("/api/auth/me", {
      headers: { authorization: `Bearer ${cookie}` },
    });
    assert.equal(me.status, 200);
  });

  it("duplicate username conflicts", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        email: "other@example.com",
        password: "password123",
      }),
    });
    assert.equal(res.status, 409);
  });
});
