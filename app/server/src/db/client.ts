import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";
import * as schema from "./schema.js";

/**
 * Store driver note:
 * ADR 0011 names better-sqlite3. On this Windows host, node-gyp cannot build
 * native addons (no VS C++ workload). We use @libsql/client against a local
 * file URL — still SQLite on disk + Drizzle, zero native compile.
 */

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: Client | null = null;

export function getSqlitePath(): string {
  return path.isAbsolute(config.databasePath)
    ? config.databasePath
    : path.resolve(process.cwd(), config.databasePath);
}

export function openDb() {
  if (_db) return _db;
  const dbPath = getSqlitePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const url = pathToFileURL(dbPath).href;
  const client = createClient({ url });
  _client = client;
  _db = drizzle(client, { schema });
  return _db;
}

export function getClient(): Client {
  openDb();
  if (!_client) throw new Error("SQLite client not open");
  return _client;
}

/** For tests: close and forget handles so a new path can open. */
export function resetDbForTests() {
  if (_client) {
    try {
      _client.close();
    } catch {
      // ignore
    }
  }
  _client = null;
  _db = null;
}

export type AppDb = ReturnType<typeof openDb>;
