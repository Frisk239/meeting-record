import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Load monorepo root .env then local overrides
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv({ path: path.resolve(here, "../.env"), override: true });

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  appName: process.env.APP_NAME?.trim() || "Meeting Record",
  allowRegister: boolEnv("ALLOW_REGISTER", true),
  databasePath: process.env.DATABASE_PATH ?? "./data/meeting-record.sqlite",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
  dataDir: process.env.DATA_DIR ?? "./data",
  sessionTtlDays: 30,
  cookieName: "mr_session",
  maxRecordingMinutes: Number(process.env.MAX_RECORDING_MINUTES ?? 60),
  /**
   * ASR engine: "mock" | "funasr"
   * funasr requires workers/asr Python venv (see workers/asr/README.md).
   */
  asrEngine: (process.env.ASR_ENGINE?.trim() || "funasr") as "mock" | "funasr",
  /** When funasr fails, degrade to mock (default false — fail the job loudly). */
  asrFallbackMock: boolEnv("ASR_FALLBACK_MOCK", false),
  /** Mock job artificial delay (ms). */
  mockAsrDelayMs: Number(process.env.MOCK_ASR_DELAY_MS ?? 800),
  /** Python executable for FunASR worker */
  asrWorkerPython: process.env.ASR_WORKER_PYTHON?.trim() || "python",
  asrWorkerScript: process.env.ASR_WORKER_SCRIPT?.trim() || "",
  /** Optional full "python path/to/worker.py" override */
  asrWorkerCmd: process.env.ASR_WORKER_CMD?.trim() || "",
  asrWorkerTimeoutMs: Number(process.env.ASR_WORKER_TIMEOUT_MS ?? 30 * 60 * 1000),
  funasrModel: process.env.FUNASR_MODEL?.trim() || "iic/SenseVoiceSmall",
  funasrVad: process.env.FUNASR_VAD?.trim() || "fsmn-vad",
  funasrSpk: process.env.FUNASR_SPK?.trim() ?? "cam++",
  /** Empty disables punctuation model */
  funasrPunc: process.env.FUNASR_PUNC?.trim() ?? "ct-punc",
  funasrDevice: process.env.FUNASR_DEVICE?.trim() || "cpu",
  funasrHub: process.env.FUNASR_HUB?.trim() || "ms",
  funasrBatchSizeS: Number(process.env.FUNASR_BATCH_SIZE_S ?? 60),
  /** Deploy-default LLM (user settings override when set) */
  llm: {
    baseUrl: process.env.LLM_BASE_URL?.trim() || "",
    model: process.env.LLM_MODEL?.trim() || "",
    apiKey: process.env.LLM_API_KEY?.trim() || "",
  },
} as const;
