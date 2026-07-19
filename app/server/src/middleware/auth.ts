import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { config } from "../config.js";
import type { User } from "../db/schema.js";
import { unauthorized } from "../lib/errors.js";
import { resolveUserFromToken } from "../services/auth.js";

export type AuthVariables = {
  user: User;
  sessionToken: string;
};

export function extractToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | undefined {
  const cookie = getCookie(c as never, config.cookieName);
  if (cookie) return cookie;
  const auth = c.req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const token = extractToken(c);
  const user = await resolveUserFromToken(token);
  if (!user || !token) throw unauthorized();
  c.set("user", user);
  c.set("sessionToken", token);
  await next();
});
