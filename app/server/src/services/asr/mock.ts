import fs from "node:fs";
import { config } from "../../config.js";
import { isJobCancelled, registerRunningJob, clearRunningJob } from "../jobControl.js";
import type { AsrEngine, AsrInput, AsrResult } from "./types.js";

/**
 * Deterministic mock ASR for S1 path demos without Python/FunASR.
 * Produces multi-speaker segments shaped like the real pipeline contract.
 */
export class MockAsrEngine implements AsrEngine {
  readonly name = "mock";

  async transcribe(input: AsrInput): Promise<AsrResult> {
    if (input.jobId) {
      registerRunningJob(input.jobId, null);
    }
    const delay = config.mockAsrDelayMs;
    const step = 100;
    let waited = 0;
    while (waited < delay) {
      if (input.jobId && isJobCancelled(input.jobId)) {
        if (input.jobId) clearRunningJob(input.jobId);
        return {
          engine: this.name,
          status: "cancelled",
          segments: [],
          errorMessage: "用户已终止转写",
        };
      }
      const slice = Math.min(step, delay - waited);
      await new Promise((r) => setTimeout(r, slice));
      waited += slice;
    }
    if (input.jobId && isJobCancelled(input.jobId)) {
      clearRunningJob(input.jobId);
      return {
        engine: this.name,
        status: "cancelled",
        segments: [],
        errorMessage: "用户已终止转写",
      };
    }
    if (input.jobId) clearRunningJob(input.jobId);

    let byteSize = 0;
    try {
      byteSize = fs.statSync(input.audioPath).size;
    } catch {
      return {
        engine: this.name,
        status: "failed",
        segments: [],
        errorMessage: "音频文件不存在",
      };
    }

    if (byteSize === 0) {
      return {
        engine: this.name,
        status: "failed",
        segments: [],
        errorMessage: "音频文件为空",
      };
    }

    const title = input.meetingTitle || "未命名会议";
    const fileHint = input.originalFilename || "recording";
    // Rough duration heuristic: ~16kB/s for compressed audio, min 8s for UI
    const approxMs = Math.max(8_000, Math.min(120_000, Math.round(byteSize / 16)));

    const segments = [
      {
        speaker: "Speaker 0",
        startMs: 0,
        endMs: Math.floor(approxMs * 0.28),
        text: `大家好，我们开始「${title}」。今天先对齐进度与风险。`,
        confidence: 0.91,
      },
      {
        speaker: "Speaker 1",
        startMs: Math.floor(approxMs * 0.28),
        endMs: Math.floor(approxMs * 0.55),
        text: "我这边后端鉴权与上传已经通了，转写队列还是串行的。",
        confidence: 0.88,
      },
      {
        speaker: "Speaker 0",
        startMs: Math.floor(approxMs * 0.55),
        endMs: Math.floor(approxMs * 0.78),
        text: "好的。请把待办记清楚：接上真实 ASR 前保持 mock 可演示。",
        confidence: 0.9,
      },
      {
        speaker: "Speaker 1",
        startMs: Math.floor(approxMs * 0.78),
        endMs: approxMs,
        text: `收到。本段音频来源文件：${fileHint}（约 ${byteSize} 字节）。`,
        confidence: 0.86,
      },
    ];

    return {
      engine: this.name,
      status: "succeeded",
      segments,
    };
  }
}

