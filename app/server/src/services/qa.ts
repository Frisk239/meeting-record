import { and, asc, desc, eq } from "drizzle-orm";
import { openDb } from "../db/client.js";
import {
  meetings,
  qaMessages,
  qaSessions,
  transcriptSegments,
  users,
  type User,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { packForMinutes } from "./llm/contextPacker.js";
import { chatCompletions } from "./llm/gateway.js";

export type QaTurn = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type QaSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === "string" && v) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

async function assertMeeting(userId: string, meetingId: string) {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("会议不存在");
  return rows[0];
}

export async function listSessions(
  userId: string,
  meetingId: string,
): Promise<QaSessionSummary[]> {
  await assertMeeting(userId, meetingId);
  const db = openDb();
  const sessions = await db
    .select()
    .from(qaSessions)
    .where(and(eq(qaSessions.meetingId, meetingId), eq(qaSessions.userId, userId)))
    .orderBy(desc(qaSessions.updatedAt));

  const msgs = await db
    .select({ sessionId: qaMessages.sessionId })
    .from(qaMessages)
    .where(and(eq(qaMessages.meetingId, meetingId), eq(qaMessages.userId, userId)));

  const counts = new Map<string, number>();
  for (const m of msgs) {
    const sid = m.sessionId || "";
    counts.set(sid, (counts.get(sid) || 0) + 1);
  }

  return sessions.map((s) => ({
    id: s.id,
    title: s.title || "新会话",
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
    messageCount: counts.get(s.id) || 0,
  }));
}

export async function listQa(
  userId: string,
  meetingId: string,
  sessionId?: string,
): Promise<QaTurn[]> {
  await assertMeeting(userId, meetingId);
  const db = openDb();
  const cond = [eq(qaMessages.meetingId, meetingId), eq(qaMessages.userId, userId)];
  if (sessionId) cond.push(eq(qaMessages.sessionId, sessionId));
  const rows = await db
    .select()
    .from(qaMessages)
    .where(and(...cond))
    .orderBy(asc(qaMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId || "",
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: toIso(r.createdAt),
  }));
}

/** Load sessions + turns for the active (latest or requested) session. */
export async function getQaState(
  userId: string,
  meetingId: string,
  sessionId?: string,
): Promise<{
  sessions: QaSessionSummary[];
  activeSessionId: string | null;
  turns: QaTurn[];
}> {
  let sessions = await listSessions(userId, meetingId);

  // If messages exist without sessions (pre-migration residue), still surface them
  if (!sessions.length) {
    const orphanTurns = await listQa(userId, meetingId);
    if (orphanTurns.length) {
      const created = await createSession(userId, meetingId, "历史会话");
      // attach orphans
      const db = openDb();
      await db
        .update(qaMessages)
        .set({ sessionId: created.id })
        .where(
          and(
            eq(qaMessages.meetingId, meetingId),
            eq(qaMessages.userId, userId),
            eq(qaMessages.sessionId, ""),
          ),
        );
      sessions = await listSessions(userId, meetingId);
    }
  }

  const activeSessionId =
    (sessionId && sessions.some((s) => s.id === sessionId) && sessionId) ||
    sessions[0]?.id ||
    null;
  const turns = activeSessionId
    ? await listQa(userId, meetingId, activeSessionId)
    : [];
  return { sessions, activeSessionId, turns };
}

export async function createSession(
  userId: string,
  meetingId: string,
  title = "新会话",
): Promise<QaSessionSummary> {
  await assertMeeting(userId, meetingId);
  const db = openDb();
  const now = new Date();
  const id = newId("qas");
  await db.insert(qaSessions).values({
    id,
    meetingId,
    userId,
    title: title.slice(0, 80) || "新会话",
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    title: title.slice(0, 80) || "新会话",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    messageCount: 0,
  };
}

async function ensureSession(
  userId: string,
  meetingId: string,
  sessionId?: string,
): Promise<string> {
  const db = openDb();
  if (sessionId) {
    const rows = await db
      .select()
      .from(qaSessions)
      .where(
        and(
          eq(qaSessions.id, sessionId),
          eq(qaSessions.meetingId, meetingId),
          eq(qaSessions.userId, userId),
        ),
      )
      .limit(1);
    if (rows[0]) return rows[0].id;
  }
  const created = await createSession(userId, meetingId);
  return created.id;
}

export async function askQuestion(
  userId: string,
  meetingId: string,
  question: string,
  sessionId?: string,
): Promise<{ turns: QaTurn[]; answer: string; sessionId: string }> {
  const q = question.trim();
  if (!q) throw badRequest("请输入问题");
  if (q.length > 4000) throw badRequest("问题过长");

  const meeting = await assertMeeting(userId, meetingId);
  const sid = await ensureSession(userId, meetingId, sessionId);
  const db = openDb();
  const now = new Date();
  const userMsgId = newId("qa");
  await db.insert(qaMessages).values({
    id: userMsgId,
    meetingId,
    userId,
    sessionId: sid,
    role: "user",
    content: q,
    createdAt: now,
  });

  // Auto-title first user message of a blank session
  const prior = await db
    .select()
    .from(qaMessages)
    .where(and(eq(qaMessages.sessionId, sid), eq(qaMessages.role, "user")));
  if (prior.length <= 1) {
    const title = q.length > 28 ? `${q.slice(0, 28)}…` : q;
    await db
      .update(qaSessions)
      .set({ title, updatedAt: now })
      .where(eq(qaSessions.id, sid));
  } else {
    await db.update(qaSessions).set({ updatedAt: now }).where(eq(qaSessions.id, sid));
  }

  const segs = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meetingId))
    .orderBy(asc(transcriptSegments.idx));

  const history = await db
    .select()
    .from(qaMessages)
    .where(and(eq(qaMessages.sessionId, sid), eq(qaMessages.userId, userId)))
    .orderBy(asc(qaMessages.createdAt));

  const recent = history
    .slice(-10)
    .map((h) => `${h.role === "user" ? "用户" : "助手"}: ${h.content}`)
    .join("\n");

  const uRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = uRows[0] as User;

  const packed = packForMinutes({
    system:
      "你是本场会议的追问助手。只根据提供的纪要与转写回答，不知道就说不知道。使用中文，简洁有据。可用 Markdown 列表与加粗。",
    meetingTitle: meeting.title,
    pinned: [
      `当前用户问题：${q}`,
      meeting.minutesMarkdown
        ? `纪要摘要：${meeting.minutesMarkdown.slice(0, 2000)}`
        : "",
    ].filter(Boolean),
    existingMinutesMarkdown: meeting.minutesMarkdown || undefined,
    segments: segs,
    userTask: `近期对话：\n${recent}\n\n请回答最新用户问题。`,
  });

  let answer = "";
  try {
    const result = await chatCompletions(user, packed.messages, { maxTokens: 1024 });
    if (result.mocked || !result.content) {
      answer = mockAnswer(q, meeting.minutesMarkdown, segs.map((s) => s.text));
    } else {
      answer = result.content;
    }
  } catch (err) {
    answer = mockAnswer(
      q,
      meeting.minutesMarkdown,
      segs.map((s) => s.text),
      err instanceof Error ? err.message : "llm error",
    );
  }

  const assistantId = newId("qa");
  await db.insert(qaMessages).values({
    id: assistantId,
    meetingId,
    userId,
    sessionId: sid,
    role: "assistant",
    content: answer,
    createdAt: new Date(),
  });
  await db
    .update(qaSessions)
    .set({ updatedAt: new Date() })
    .where(eq(qaSessions.id, sid));

  const turns = await listQa(userId, meetingId, sid);
  return { turns, answer, sessionId: sid };
}

function mockAnswer(
  question: string,
  minutesMd: string,
  texts: string[],
  err?: string,
): string {
  const hit = texts.find((t) =>
    question.split(/\s+/).some((w) => w.length > 1 && t.includes(w)),
  );
  const bits = [
    `（本地 mock 回答${err ? `；LLM 不可用：${err.slice(0, 60)}` : ""}）`,
    hit
      ? `与问题相关的转写片段：${hit.slice(0, 200)}`
      : minutesMd
        ? `纪要中可见：${minutesMd.slice(0, 240).replace(/\n/g, " ")}…`
        : "本场尚无足够转写/纪要，请先完成转写。",
    "建议：结合原文时间码核对细节；配置 LLM 后可获得更完整作答。",
  ];
  return bits.filter(Boolean).join("\n\n");
}
