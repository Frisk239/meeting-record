import { config } from "../../config.js";
import { FunasrEngine } from "./funasr.js";
import { MockAsrEngine } from "./mock.js";
import type { AsrEngine, AsrResult } from "./types.js";

export type { AsrEngine, AsrInput, AsrResult, AsrSegment } from "./types.js";

class FallbackEngine implements AsrEngine {
  readonly name = "funasr+mock-fallback";
  constructor(
    private primary: AsrEngine,
    private fallback: AsrEngine,
  ) {}

  async transcribe(input: Parameters<AsrEngine["transcribe"]>[0]): Promise<AsrResult> {
    const r = await this.primary.transcribe(input);
    if (r.status !== "failed") return r;
    console.warn(
      "[asr] funasr failed, falling back to mock:",
      r.errorMessage?.slice(0, 200),
    );
    const m = await this.fallback.transcribe(input);
    return {
      ...m,
      engine: `${m.engine}(fallback-after-funasr)`,
      errorMessage: r.errorMessage
        ? `funasr: ${r.errorMessage}`
        : m.errorMessage,
    };
  }
}

export function getAsrEngine(): AsrEngine {
  if (config.asrEngine === "funasr") {
    const fun = new FunasrEngine();
    if (config.asrFallbackMock) {
      return new FallbackEngine(fun, new MockAsrEngine());
    }
    return fun;
  }
  if (config.asrEngine !== "mock") {
    console.warn(`[asr] unknown ASR_ENGINE=${config.asrEngine}; using mock`);
  }
  return new MockAsrEngine();
}
