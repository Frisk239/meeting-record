import { config } from "../../config.js";
import { MockAsrEngine } from "./mock.js";
import type { AsrEngine } from "./types.js";

export type { AsrEngine, AsrInput, AsrResult, AsrSegment } from "./types.js";

export function getAsrEngine(): AsrEngine {
  // funasr sidecar not wired yet — always mock until S1.5/S2 worker
  if (config.asrEngine === "funasr") {
    console.warn("[asr] ASR_ENGINE=funasr not implemented yet; using mock");
  }
  return new MockAsrEngine();
}
