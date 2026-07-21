import { and, asc, eq } from "drizzle-orm";
import { openDb } from "../db/client.js";
import { meetings, transcriptSegments, users, type User } from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { packForMinutes } from "./llm/contextPacker.js";
import { chatCompletions } from "./llm/gateway.js";

export async function getInsights(userId: string, meetingId: string) {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");
  return {
    status: m.insightsStatus || "none",
    markdown: m.insightsMarkdown || "",
  };
}

export async function generateInsights(userId: string, meetingId: string) {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const meeting = rows[0];
  if (!meeting) throw notFound("会议不存在");

  const segs = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meetingId))
    .orderBy(asc(transcriptSegments.idx));
  if (!segs.length && !meeting.minutesMarkdown) {
    throw badRequest("需要转写或纪要后再生成外脑");
  }

  const uRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = uRows[0] as User;

  const packed = packForMinutes({
    system:
      "你是会议外脑。仅在用户显式请求时生成。输出纯中文 Markdown（标题用 ##，列表用 -）。章节：风险、机会、延伸问题、可执行建议。不要输出 HTML/CSS/JS，不要用 ``` 代码围栏包裹全文，不要重复整份纪要。",
    meetingTitle: meeting.title,
    existingMinutesMarkdown: meeting.minutesMarkdown || undefined,
    segments: segs,
    userTask: "请生成本场「AI 外脑」洞察（简洁分节，纯 Markdown）。",
  });

  let markdown = "";
  try {
    const result = await chatCompletions(user, packed.messages);
    if (result.mocked || !result.content) {
      markdown = mockInsights(meeting.title, meeting.minutesMarkdown, segs.map((s) => s.text));
    } else {
      markdown = result.content;
    }
  } catch (err) {
    markdown = mockInsights(
      meeting.title,
      meeting.minutesMarkdown,
      segs.map((s) => s.text),
      err instanceof Error ? err.message : "error",
    );
  }

  const now = new Date();
  await db
    .update(meetings)
    .set({
      insightsStatus: "ready",
      insightsMarkdown: markdown,
      updatedAt: now,
    })
    .where(eq(meetings.id, meetingId));

  return { status: "ready" as const, markdown };
}

function mockInsights(
  title: string,
  minutes: string,
  texts: string[],
  err?: string,
): string {
  return [
    `# AI 外脑 · ${title}`,
    "",
    err ? `> LLM 不可用，已用本地启发式生成（${err.slice(0, 80)}）` : "> 本地 mock（未配置 LLM 时）",
    "",
    "## 风险",
    `- 转写/纪要依赖 mock 时需人工核对（原文 ${texts.length} 段）`,
    "",
    "## 机会",
    "- 将待办同步到个人任务列表",
    "- 对争议点单独约短会",
    "",
    "## 延伸问题",
    "- 哪些决议缺少明确责任人？",
    "- 下一次跟进的检查点是什么？",
    "",
    "## 建议",
    minutes
      ? `- 基于纪要：${minutes.slice(0, 160).replace(/\n/g, " ")}…`
      : "- 先完善纪要再展开外脑",
    "",
  ].join("\n");
}
