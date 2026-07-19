export type PublicUser = {
  id: string;
  username: string;
  email: string;
};

export type LlmSettings = {
  baseUrl: string;
  modelId: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  source: "user" | "env" | "none";
};

export type ApiError = {
  error?: string;
  message?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; data: ApiError }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = await parseJson<T & ApiError>(res);
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

export function getMeta() {
  return api<{ appName: string; registrationOpen: boolean }>("/api/auth/meta");
}

export function register(body: { username: string; email: string; password: string }) {
  return api<{ user: PublicUser; expiresAt: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function login(body: { login: string; password: string }) {
  return api<{ user: PublicUser; expiresAt: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function getMe() {
  return api<{ user: PublicUser; llm: LlmSettings }>("/api/auth/me");
}

export function putLlmSettings(body: {
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  return api<{ llm: LlmSettings }>("/api/auth/settings/llm", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
