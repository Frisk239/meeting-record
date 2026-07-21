import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth.js";
import { getPublicShare } from "../services/share.js";

/** Public (no auth) share read API. */
export const sharePublicRoutes = new Hono<{ Variables: AuthVariables }>();

sharePublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  const data = await getPublicShare(token);
  return c.json({ share: data });
});
