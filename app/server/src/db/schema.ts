import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** User-level LLM overrides; empty string means fall back to env */
  llmBaseUrl: text("llm_base_url").notNull().default(""),
  llmModel: text("llm_model").notNull().default(""),
  llmApiKey: text("llm_api_key").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Meeting list card unit — one conversation with optional multi-recording. */
export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** draft | processing | ready | failed */
  status: text("status").notNull().default("draft"),
  summary: text("summary").notNull().default(""),
  /** none | generating | ready | failed */
  minutesStatus: text("minutes_status").notNull().default("none"),
  minutesJson: text("minutes_json"),
  minutesMarkdown: text("minutes_markdown").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const recordings = sqliteTable("recordings", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Absolute or data-dir-relative path on disk */
  storagePath: text("storage_path").notNull(),
  originalFilename: text("original_filename").notNull().default(""),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  byteSize: integer("byte_size").notNull().default(0),
  durationMs: integer("duration_ms"),
  source: text("source").notNull().default("upload"), // upload | browser
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const transcriptionJobs = sqliteTable("transcription_jobs", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  recordingId: text("recording_id")
    .notNull()
    .references(() => recordings.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** queued | running | succeeded | failed | degraded */
  status: text("status").notNull().default("queued"),
  engine: text("engine").notNull().default("mock"),
  errorMessage: text("error_message").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const transcriptSegments = sqliteTable("transcript_segments", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  recordingId: text("recording_id")
    .notNull()
    .references(() => recordings.id, { onDelete: "cascade" }),
  jobId: text("job_id")
    .notNull()
    .references(() => transcriptionJobs.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  speaker: text("speaker").notNull().default("Speaker 0"),
  startMs: integer("start_ms").notNull().default(0),
  endMs: integer("end_ms").notNull().default(0),
  text: text("text").notNull(),
  confidence: real("confidence"),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type TranscriptionJob = typeof transcriptionJobs.$inferSelect;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
