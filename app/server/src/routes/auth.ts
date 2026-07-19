import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { config } from "../config.js";
import type { User } from "../db/schema.js";
import { badRequest } from "../lib/errors.js";
import {
  extractToken,
  requireAuth,
  type AuthVariables,
} from "../middleware/auth.js";
import {
  getLlmSettingsView,
  login,
  logout,
  register,
  updateLlmSettings,
  type PublicUser,
} from "../services/auth.js";

function toPublic(user: User): PublicUser {
  return { id: user.id, username: user.username, email: user.email };
}

function setSessionCookie(
  c: { header: (n: string, v: string) => void },
  token: string,
  expiresAt: Date,
) {
  setCookie(c as never, config.cookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

function clearSessionCookie(c: { header: (n: string, v: string) => void }) {
  deleteCookie(c as never, config.cookieName, { path: "/" });
}

const registerSchema = z.object({
  username: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
});

const loginSchema = z.object({
  login: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  password: z.string().min(1),
});

const llmSchema = z.object({
  baseUrl: z.string().optional(),
  modelId: z.string().optional(),
  apiKey: z.string().nullable().optional(),
  clearApiKey: z.boolean().optional(),
});

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

authRoutes.get("/meta", (c) => {
  return c.json({
    appName: config.appName,
    // Boolean only — never surface ALLOW_REGISTER as a user toggle.
    registrationOpen: config.allowRegister,
  });
});

authRoutes.post("/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const result = await register(body.data);
  setSessionCookie(c, result.token, new Date(result.expiresAt));
  return c.json(
    {
      user: result.user,
      expiresAt: result.expiresAt,
    },
    201,
  );
});

authRoutes.post("/login", async (c) => {
  const body = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const loginId = body.data.login || body.data.username || body.data.email || "";
  const result = await login({ login: loginId, password: body.data.password });
  setSessionCookie(c, result.token, new Date(result.expiresAt));
  return c.json({
    user: result.user,
    expiresAt: result.expiresAt,
  });
});

authRoutes.post("/logout", async (c) => {
  const token = extractToken(c);
  await logout(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({
    user: toPublic(user),
    llm: getLlmSettingsView(user),
  });
});

authRoutes.get("/settings/llm", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({ llm: getLlmSettingsView(user) });
});

authRoutes.put("/settings/llm", requireAuth, async (c) => {
  const body = llmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw badRequest("请求体无效");
  const user = c.get("user");
  const llm = await updateLlmSettings(user.id, body.data);
  return c.json({ llm });
});
