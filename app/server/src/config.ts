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
   * ASR engine: "mock" (default, no Python) | future "funasr"
   * Real FunASR sidecar is a follow-up; pipeline port is stable.
   */
  asrEngine: (process.env.ASR_ENGINE?.trim() || "mock") as "mock" | "funasr",
  /** Mock job artificial delay (ms) so UI can show processing state. */
  mockAsrDelayMs: Number(process.env.MOCK_ASR_DELAY_MS ?? 800),
  /** Deploy-default LLM (user settings override when set) */
  llm: {
    baseUrl: process.env.LLM_BASE_URL?.trim() || "",
    model: process.env.LLM_MODEL?.trim() || "",
    apiKey: process.env.LLM_API_KEY?.trim() || "",
  },
} as const;
