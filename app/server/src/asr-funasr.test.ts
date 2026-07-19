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
  });

  it("python --self-test-parse (no model download)", () => {
    const py = process.env.ASR_WORKER_PYTHON || "python";
    const res = spawnSync(py, [worker, "--self-test-parse"], {
      encoding: "utf-8",
      timeout: 15_000,
      windowsHide: true,
    });
    if (res.error) {
      // Python missing on host — document skip reason but fail soft only if intentional CI without py
      assert.ok(
        false,
        `python spawn failed: ${res.error.message}. Install Python for worker self-test.`,
      );
    }
    assert.equal(res.status, 0, `stderr=${res.stderr}`);
    const body = JSON.parse((res.stdout || "").trim()) as {
      ok: boolean;
      segments: Array<{ speaker: string }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.segments[0]?.speaker, "Speaker 0");
    assert.equal(body.segments[1]?.speaker, "Speaker 1");
  });
});
