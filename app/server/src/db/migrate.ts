import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient, openDb } from "./client.js";

/** Idempotent schema apply (no drizzle-kit required at runtime). */
export async function migrate(): Promise<void> {
  openDb();
  const client = getClient();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      llm_base_url TEXT NOT NULL DEFAULT '',
      llm_model TEXT NOT NULL DEFAULT '',
      llm_api_key TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      summary TEXT NOT NULL DEFAULT '',
      minutes_status TEXT NOT NULL DEFAULT 'none',
      minutes_json TEXT,
      minutes_markdown TEXT NOT NULL DEFAULT '',
      insights_status TEXT NOT NULL DEFAULT 'none',
      insights_markdown TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS meetings_user_id_idx ON meetings(user_id);
    CREATE INDEX IF NOT EXISTS meetings_created_at_idx ON meetings(created_at);

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY NOT NULL,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      storage_path TEXT NOT NULL,
      original_filename TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      byte_size INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      source TEXT NOT NULL DEFAULT 'upload',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS recordings_meeting_id_idx ON recordings(meeting_id);

    CREATE TABLE IF NOT EXISTS transcription_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      engine TEXT NOT NULL DEFAULT 'mock',
      error_message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS jobs_status_idx ON transcription_jobs(status);
    CREATE INDEX IF NOT EXISTS jobs_meeting_id_idx ON transcription_jobs(meeting_id);

    CREATE TABLE IF NOT EXISTS transcript_segments (
      id TEXT PRIMARY KEY NOT NULL,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES transcription_jobs(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      speaker TEXT NOT NULL DEFAULT 'Speaker 0',
      start_ms INTEGER NOT NULL DEFAULT 0,
      end_ms INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      confidence REAL
    );

    CREATE INDEX IF NOT EXISTS segments_meeting_id_idx ON transcript_segments(meeting_id);

    CREATE TABLE IF NOT EXISTS qa_messages (
      id TEXT PRIMARY KEY NOT NULL,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS qa_meeting_id_idx ON qa_messages(meeting_id);
  `);

  await addColumnIfMissing(client, "users", "display_name", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(client, "meetings", "minutes_status", "TEXT NOT NULL DEFAULT 'none'");
  await addColumnIfMissing(client, "meetings", "minutes_json", "TEXT");
  await addColumnIfMissing(client, "meetings", "minutes_markdown", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(client, "meetings", "insights_status", "TEXT NOT NULL DEFAULT 'none'");
  await addColumnIfMissing(client, "meetings", "insights_markdown", "TEXT NOT NULL DEFAULT ''");
}

async function addColumnIfMissing(
  client: { execute: (q: string) => Promise<unknown> },
  table: string,
  column: string,
  def: string,
) {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch {
    // already exists
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]!);

if (isDirectRun) {
  await migrate();
  console.log("migrate: ok");
}
