import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";

await migrate();
const app = createApp();

console.log(
  `[${config.appName}] API listening on http://127.0.0.1:${config.port}`,
);
console.log(
  `  ALLOW_REGISTER=${config.allowRegister} (server-only; not a frontend toggle)`,
);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: "0.0.0.0",
});
