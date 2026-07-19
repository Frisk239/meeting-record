import { and, asc, eq } from "drizzle-orm";
import { openDb } from "../db/client.js";
import {
  meetings,
  qaMessages,
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
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export async function listQa(
  userId: string,
  meetingId: string,
): Promise<QaTurn[]> {
  await assertMeeting(userId, meetingId);
  const db = openDb();
  const rows = await db
    .select()
    .from(qaMessages)
    .where(and(eq(qaMessages.meetingId, meetingId), eq(qaMessages.userId, userId)))
    .orderBy(asc(qaMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }));
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

export async function askQuestion(
  userId: string,
  meetingId: string,
  question: string,
): Promise<{ turns: QaTurn[]; answer: string }> {
  const q = question.trim();
  if (!q) throw badRequest("请输入问题");
  if (q.length > 4000) throw badRequest("问题过长");

  const meeting = await assertMeeting(userId, meetingId);
  const db = openDb();
  const now = new Date();
  const userMsgId = newId("qa");
  await db.insert(qaMessages).values({
    id: userMsgId,
    meetingId,
    userId,
    role: "user",
    content: q,
    createdAt: now,
  });

  const segs = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meetingId))
    .orderBy(asc(transcriptSegments.idx));

  const history = await db
    .select()
    .from(qaMessages)
    .where(and(eq(qaMessages.meetingId, meetingId), eq(qaMessages.userId, userId)))
    .orderBy(asc(qaMessages.createdAt));

  const recent = history
    .slice(-8)
    .map((h) => `${h.role === "user" ? "用户" : "助手"}: ${h.content}`)
    .join("\n");

  const uRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = uRows[0] as User;

  const packed = packForMinutes({
    system:
      "你是本场会议的追问助手。只根据提供的纪要与转写回答，不知道就说不知道。使用中文，简洁有据。",
    meetingTitle: meeting.title,
    pinned: [
      `当前用户问题：${q}`,
      meeting.minutesMarkdown ? `纪要摘录：${meeting.minutesMarkdown.slice(0, 2000)}` : "",
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
    role: "assistant",
    content: answer,
    createdAt: new Date(),
  });

  const turns = await listQa(userId, meetingId);
  return { turns, answer };
}

function mockAnswer(
  question: string,
  minutesMd: string,
  texts: string[],
  err?: string,
): string {
  const blob = `${minutesMd}\n${texts.join("\n")}`;
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
    blob.length
      ? "建议：结合原文时间码核对细节；配置 LLM 后可获得更完整作答。"
      : "",
  ];
  return bits.filter(Boolean).join("\n\n");
}
