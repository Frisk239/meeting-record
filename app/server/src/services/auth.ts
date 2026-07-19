import { and, eq, gt } from "drizzle-orm";
import { config } from "../config.js";
import { openDb } from "../db/client.js";
import { sessions, users, type User } from "../db/schema.js";
import {
  hashPassword,
  hashToken,
  maskApiKey,
  newId,
  newSessionToken,
  verifyPassword,
} from "../lib/crypto.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fff.-]{2,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PublicUser = {
  id: string;
  username: string;
  email: string;
};

export type LlmSettingsView = {
  baseUrl: string;
  modelId: string;
  /** Masked key for display; empty if none configured */
  apiKeyMasked: string;
  hasApiKey: boolean;
  source: "user" | "env" | "none";
};

export type AuthBundle = {
  user: PublicUser;
  token: string;
  expiresAt: string;
};

function publicUser(u: User): PublicUser {
  return { id: u.id, username: u.username, email: u.email };
}

function normalizeUsername(raw: string): string {
  return raw.trim();
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function assertCredentials(input: {
  username?: string;
  email?: string;
  password?: string;
}) {
  const username = input.username ? normalizeUsername(input.username) : "";
  const email = input.email ? normalizeEmail(input.email) : "";
  const password = input.password ?? "";

  if (!username || !USERNAME_RE.test(username)) {
    throw badRequest("用户名需 2–32 位，字母数字中文或 _.-");
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw badRequest("邮箱格式不正确");
  }
  if (password.length < 8) {
    throw badRequest("密码至少 8 位");
  }
  if (password.length > 128) {
    throw badRequest("密码过长");
  }
  return { username, email, password };
}

async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const db = openDb();
  const token = newSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: newId("ses"),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthBundle> {
  if (!config.allowRegister) {
    throw unauthorized("当前不可注册", "register_disabled");
  }
  const { username, email, password } = assertCredentials(input);
  const db = openDb();

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing.length) throw conflict("用户名已存在", "username_taken");

  const existingEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingEmail.length) throw conflict("邮箱已注册", "email_taken");

  const now = new Date();
  const id = newId("usr");
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    id,
    username,
    email,
    passwordHash,
    llmBaseUrl: "",
    llmModel: "",
    llmApiKey: "",
    createdAt: now,
    updatedAt: now,
  });

  const userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const user = userRows[0]!;
  const session = await createSession(user.id);
  return {
    user: publicUser(user),
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function login(input: {
  login: string;
  password: string;
}): Promise<AuthBundle> {
  const loginId = input.login?.trim() ?? "";
  const password = input.password ?? "";
  if (!loginId || !password) throw badRequest("请输入账号和密码");

  const db = openDb();
  const asEmail = loginId.includes("@");
  const rows = asEmail
    ? await db.select().from(users).where(eq(users.email, normalizeEmail(loginId))).limit(1)
    : await db.select().from(users).where(eq(users.username, normalizeUsername(loginId))).limit(1);
  const row = rows[0];

  if (!row) throw unauthorized("账号或密码错误", "invalid_credentials");
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) throw unauthorized("账号或密码错误", "invalid_credentials");

  const session = await createSession(row.id);
  return {
    user: publicUser(row),
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  const db = openDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function resolveUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const db = openDb();
  const now = new Date();
  const rows = await db
    .select({
      user: users,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0]?.user ?? null;
}

export function getLlmSettingsView(user: User): LlmSettingsView {
  const userBase = user.llmBaseUrl?.trim() || "";
  const userModel = user.llmModel?.trim() || "";
  const userKey = user.llmApiKey?.trim() || "";

  const envBase = config.llm.baseUrl;
  const envModel = config.llm.model;
  const envKey = config.llm.apiKey;

  // User saved fields win when present; key independently falls back
  const baseUrl = userBase || envBase;
  const modelId = userModel || envModel;
  const apiKey = userKey || envKey;

  let source: LlmSettingsView["source"] = "none";
  if (userBase || userModel || userKey) source = "user";
  else if (envBase || envModel || envKey) source = "env";

  return {
    baseUrl,
    modelId,
    apiKeyMasked: maskApiKey(apiKey),
    hasApiKey: Boolean(apiKey),
    source,
  };
}

export async function updateLlmSettings(
  userId: string,
  input: {
    baseUrl?: string;
    modelId?: string;
    /** Pass null/omit to leave unchanged; empty string clears user key (fall back to env) */
    apiKey?: string | null;
    clearApiKey?: boolean;
  },
): Promise<LlmSettingsView> {
  const db = openDb();
  const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = found[0];
  if (!user) throw unauthorized();

  const nextBase =
    input.baseUrl !== undefined ? String(input.baseUrl).trim() : user.llmBaseUrl;
  const nextModel =
    input.modelId !== undefined ? String(input.modelId).trim() : user.llmModel;

  let nextKey = user.llmApiKey;
  if (input.clearApiKey) {
    nextKey = "";
  } else if (input.apiKey !== undefined && input.apiKey !== null) {
    const k = String(input.apiKey).trim();
    // Ignore masked placeholder submissions
    if (k && !k.includes("•") && !k.startsWith("••••")) {
      nextKey = k;
    } else if (k === "") {
      nextKey = "";
    }
  }

  if (nextBase.length > 500) throw badRequest("base_url 过长");
  if (nextModel.length > 200) throw badRequest("model_id 过长");
  if (nextKey.length > 500) throw badRequest("api_key 过长");

  const now = new Date();
  await db
    .update(users)
    .set({
      llmBaseUrl: nextBase,
      llmModel: nextModel,
      llmApiKey: nextKey,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  const updatedRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return getLlmSettingsView(updatedRows[0]!);
}

/** Effective config for future LLM gateway (not returned raw to clients). */
export function resolveEffectiveLlm(user: User): {
  baseUrl: string;
  modelId: string;
  apiKey: string;
} {
  return {
    baseUrl: user.llmBaseUrl?.trim() || config.llm.baseUrl,
    modelId: user.llmModel?.trim() || config.llm.model,
    apiKey: user.llmApiKey?.trim() || config.llm.apiKey,
  };
}
