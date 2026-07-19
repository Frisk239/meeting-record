import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { config } from "./config.js";
import { HttpError } from "./lib/errors.js";
import type { AuthVariables } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { meetingRoutes } from "./routes/meetings.js";
import { ensureMediaDirs } from "./services/storage.js";

export function createApp() {
  ensureMediaDirs();
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use(
    "*",
    cors({
      origin: (origin) => origin || "http://127.0.0.1:5173",
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      appName: config.appName,
      asrEngine: config.asrEngine,
      asrFallbackMock: config.asrFallbackMock,
      maxRecordingMinutes: config.maxRecordingMinutes,
      funasr: {
        model: config.funasrModel,
        vad: config.funasrVad,
        spk: config.funasrSpk,
        device: config.funasrDevice,
      },
    }),
  );

  app.route("/api/auth", authRoutes);
  app.route("/api/meetings", meetingRoutes);

  app.notFound((c) => c.json({ error: "not_found", message: "未找到" }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        { error: err.code ?? "error", message: err.message },
        err.status as 400,
      );
    }
    if (err instanceof HTTPException) {
      return c.json(
        { error: "http_exception", message: err.message },
        err.status,
      );
    }
    console.error(err);
    return c.json({ error: "internal", message: "服务器错误" }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
