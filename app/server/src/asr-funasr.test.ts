import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseFunasrWorkerStdoutForTests } from "./services/asr/funasr.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const worker = path.join(repoRoot, "workers", "asr", "worker.py");

describe("funasr worker contract", () => {
  it("parses worker JSON with speakers", () => {
    const stdout = JSON.stringify({
      status: "succeeded",
      engine: "funasr",
      segments: [
        { speaker: "Speaker 0", startMs: 0, endMs: 1200, text: "你好" },
        { speaker: "Speaker 1", startMs: 1200, endMs: 2500, text: "大家好" },
      ],
    });
    const r = parseFunasrWorkerStdoutForTests(stdout);
    assert.equal(r.status, "succeeded");
    assert.equal(r.segments.length, 2);
    assert.equal(r.segments[1]?.speaker, "Speaker 1");
    assert.equal(r.segments[0]?.text, "你好");
  });

  it("rejects mass U+FFFD mojibake (Windows GBK pipe corruption)", () => {
    const bad = "\uFFFD".repeat(40) + "一" + "\uFFFD".repeat(40);
    const stdout = JSON.stringify({
      status: "succeeded",
      engine: "funasr",
      segments: [{ speaker: "Speaker 0", startMs: 0, endMs: 1000, text: bad }],
    });
    const r = parseFunasrWorkerStdoutForTests(stdout);
    assert.equal(r.status, "failed");
    assert.equal(r.segments.length, 0);
    assert.match(String(r.errorMessage), /encoding corrupted/i);
  });

  it("python --self-test-parse (no model download)", () => {
    const py = process.env.ASR_WORKER_PYTHON || "python";
    const res = spawnSync(
      py,
      [worker, "--self-test-parse"],
      {
        encoding: "buffer",
        timeout: 15_000,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          PYTHONUNBUFFERED: "1",
        },
      },
    );
    if (res.error) {
      // Python missing on host — document skip reason but fail soft only if intentional CI without py
      assert.ok(
        false,
        `python spawn failed: ${res.error.message}. Install Python for worker self-test.`,
      );
    }
    assert.equal(res.status, 0, `stderr=${res.stderr?.toString("utf8")}`);
    const stdout = (res.stdout as Buffer).toString("utf8");
    const body = JSON.parse(stdout.trim()) as {
      ok: boolean;
      segments: Array<{ speaker: string; text: string }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.segments[0]?.speaker, "Speaker 0");
    assert.equal(body.segments[1]?.speaker, "Speaker 1");
    assert.equal(body.segments[0]?.text, "你好");
    assert.equal(body.segments[1]?.text, "大家好");
    assert.ok(!stdout.includes("\uFFFD"));
  });

  it("python emit stays UTF-8 even if parent sets PYTHONIOENCODING=gbk", () => {
    const py = process.env.ASR_WORKER_PYTHON || "python";
    const res = spawnSync(py, [worker, "--self-test-parse"], {
      encoding: "buffer",
      timeout: 15_000,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "gbk",
        PYTHONUTF8: "0",
        PYTHONUNBUFFERED: "1",
      },
    });
    if (res.error) {
      assert.ok(false, `python spawn failed: ${res.error.message}`);
    }
    assert.equal(res.status, 0, `stderr=${res.stderr?.toString("utf8")}`);
    const buf = res.stdout as Buffer;
    // 你好 UTF-8 = e4 bd a0 e5 a5 bd
    assert.ok(
      buf.includes(Buffer.from("你好", "utf8")),
      `expected UTF-8 你好 in stdout, got hex=${buf.subarray(0, 80).toString("hex")}`,
    );
  });
});
