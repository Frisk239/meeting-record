import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";

await migrate();
const app = createApp();

console.log(
  `[${config.appName}] API listening on http://${config.host}:${config.port}`,
);
console.log(
  `  ALLOW_REGISTER=${config.allowRegister} (server-only; not a frontend toggle)`,
);
console.log(
  `  ASR_ENGINE=${config.asrEngine} fallbackMock=${config.asrFallbackMock} python=${config.asrWorkerPython}`,
);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});
