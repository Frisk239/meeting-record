import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config.js";
import {
  clearRunningJob,
  isJobCancelled,
  registerRunningJob,
} from "../jobControl.js";
import type { AsrEngine, AsrInput, AsrResult, AsrSegment } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
/** monorepo root: app/server/src/services/asr → ../../../../../ */
const repoRoot = path.resolve(here, "../../../../../");

function resolveWorker(): { python: string; script: string } {
  if (config.asrWorkerCmd) {
    // "python script.py" or absolute python only — prefer structured fields
    const parts = config.asrWorkerCmd.trim().split(/\s+/);
    if (parts.length >= 2) {
      return { python: parts[0]!, script: parts.slice(1).join(" ") };
    }
  }
  const python = config.asrWorkerPython || "python";
  const script =
    config.asrWorkerScript ||
    path.join(repoRoot, "workers", "asr", "worker.py");
  return {
    python: path.isAbsolute(python) ? python : python,
    script: path.isAbsolute(script) ? script : path.resolve(repoRoot, script),
  };
}

function parseWorkerJson(stdout: string): AsrResult {
  const text = stdout.trim();
  if (!text) {
    return {
      engine: "funasr",
      status: "failed",
      segments: [],
      errorMessage: "worker returned empty stdout",
    };
  }
  // Worker may print logs only on stderr; stdout should be one JSON object
  const lastLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  try {
    const raw = JSON.parse(lastLine || text) as {
      status?: string;
      engine?: string;
      segments?: Array<{
        speaker?: string;
        startMs?: number;
        endMs?: number;
        text?: string;
        confidence?: number;
      }>;
      errorMessage?: string;
    };
    const segments: AsrSegment[] = (raw.segments || [])
      .filter((s) => s.text && String(s.text).trim())
      .map((s) => ({
        speaker: s.speaker || "Speaker 0",
        startMs: Number(s.startMs) || 0,
        endMs: Number(s.endMs) || 0,
        text: String(s.text).trim(),
        confidence: s.confidence,
      }));
    const status =
      raw.status === "succeeded" || raw.status === "degraded"
        ? raw.status
        : segments.length
          ? "succeeded"
          : "failed";
    return {
      engine: "funasr",
      status,
      segments,
      errorMessage: raw.errorMessage,
    };
  } catch (e) {
    return {
      engine: "funasr",
      status: "failed",
      segments: [],
      errorMessage: `invalid worker JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * FunASR sidecar engine: spawn Python worker per job (serial queue already serializes).
 * First call may download models and take minutes.
 */
export class FunasrEngine implements AsrEngine {
  readonly name = "funasr";

  async transcribe(input: AsrInput): Promise<AsrResult> {
    if (!fs.existsSync(input.audioPath)) {
      return {
        engine: this.name,
        status: "failed",
        segments: [],
        errorMessage: "音频文件不存在",
      };
    }

    const { python, script } = resolveWorker();
    if (!fs.existsSync(script)) {
      return {
        engine: this.name,
        status: "failed",
        segments: [],
        errorMessage: `ASR worker script missing: ${script}`,
      };
    }

    const args = [
      script,
      "--audio",
      input.audioPath,
      "--model",
      config.funasrModel,
      "--vad",
      config.funasrVad,
      "--spk",
      config.funasrSpk,
      "--punc",
      config.funasrPunc,
      "--device",
      config.funasrDevice,
      "--hub",
      config.funasrHub,
      "--batch-size-s",
      String(config.funasrBatchSizeS),
    ];

    const timeoutMs = config.asrWorkerTimeoutMs;

    console.log(
      `[asr/funasr] spawn: ${python} ${script}\n  audio=${input.audioPath}\n  model=${config.funasrModel} vad=${config.funasrVad} spk=${config.funasrSpk}`,
    );

    return new Promise<AsrResult>((resolve) => {
      const child = spawn(python, args, {
        env: {
          ...process.env,
          OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "4",
          MKL_NUM_THREADS: process.env.MKL_NUM_THREADS || "4",
          ASR_NCPU: process.env.ASR_NCPU || "4",
          PYTHONUNBUFFERED: "1",
        },
        windowsHide: true,
      });

      if (input.jobId) {
        registerRunningJob(input.jobId, child);
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      /** Throttle noisy tqdm progress lines to the terminal */
      let lastLogAt = 0;

      const finish = (result: AsrResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (input.jobId) clearRunningJob(input.jobId);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        console.error(`[asr/funasr] timeout after ${timeoutMs}ms`);
        finish({
          engine: this.name,
          status: "failed",
          segments: [],
          errorMessage: `FunASR worker timeout after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      child.stdout.on("data", (c) => {
        stdout += String(c);
      });
      child.stderr.on("data", (c) => {
        const chunk = String(c);
        stderr += chunk;
        if (stderr.length > 50_000) stderr = stderr.slice(-50_000);

        // FunASR/tqdm writes progress with \r; print useful lines live
        const now = Date.now();
        const lines = chunk
          .replace(/\r/g, "\n")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("PROGRESS ")) {
            try {
              const p = JSON.parse(line.slice("PROGRESS ".length)) as {
                stage?: string;
                percent?: number;
                message?: string;
              };
              const msg = String(p.message || "");
              input.onProgress?.({
                stage: String(p.stage || ""),
                percent: Number(p.percent) || 0,
                message: msg,
                logLine: `[${p.percent}%] ${p.stage} ${msg}`.trim(),
              });
              console.log(
                `[asr/funasr] progress ${p.percent}% ${p.stage} ${msg}`,
              );
            } catch {
              // ignore
            }
            continue;
          }
          // skip pure bar spam unless throttled
          const isBar = line.includes("%|") || line.includes("it/s");
          if (isBar && now - lastLogAt < 2000) continue;
          lastLogAt = now;
          const clipped = line.slice(0, 240);
          console.log(`[asr/funasr] ${clipped}`);
          // Forward useful log lines to UI (not full tqdm spam)
          if (
            !isBar &&
            (line.includes("[INFO]") ||
              line.includes("[WARNING]") ||
              line.includes("[asr-worker]") ||
              line.includes("[audio_io]") ||
              line.includes("Loading") ||
              line.includes("Building") ||
              line.includes("error") ||
              line.includes("Error") ||
              line.includes("failed") ||
              line.includes("patch"))
          ) {
            input.onProgress?.({
              stage: "log",
              percent: -1, // signal: log only, don't move bar
              message: "",
              logLine: clipped,
            });
          }
        }
      });

      child.on("error", (err) => {
        console.error(`[asr/funasr] spawn error: ${err.message}`);
        finish({
          engine: this.name,
          status: "failed",
          segments: [],
          errorMessage: `spawn failed: ${err.message}. Install workers/asr venv and set ASR_WORKER_PYTHON.`,
        });
      });

      child.on("close", (code) => {
        if (input.jobId && isJobCancelled(input.jobId)) {
          console.log(`[asr/funasr] cancelled job=${input.jobId} exit=${code}`);
          finish({
            engine: this.name,
            status: "cancelled",
            segments: [],
            errorMessage: "用户已终止转写",
          });
          return;
        }
        const result = parseWorkerJson(stdout);
        if (result.status === "failed" && !result.errorMessage && code !== 0) {
          result.errorMessage = `worker exit ${code}: ${stderr.trim().slice(-500)}`;
        } else if (result.status === "failed" && stderr && result.errorMessage) {
          result.errorMessage = `${result.errorMessage} | ${stderr.trim().slice(-300)}`;
        }
        // Non-zero exit without JSON often means killed
        if (
          result.status === "failed" &&
          !stdout.trim() &&
          (code === null || code === 1 || code === 15 || code === 137)
        ) {
          if (input.jobId && isJobCancelled(input.jobId)) {
            result.status = "cancelled";
            result.errorMessage = "用户已终止转写";
          }
        }
        console.log(
          `[asr/funasr] done exit=${code} status=${result.status} segments=${result.segments.length}`,
        );
        if (result.status === "failed") {
          console.error(`[asr/funasr] error: ${result.errorMessage}`);
        }
        finish(result);
      });
    });
  }
}

export function parseFunasrWorkerStdoutForTests(stdout: string): AsrResult {
  return parseWorkerJson(stdout);
}
