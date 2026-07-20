import { and, asc, eq } from "drizzle-orm";
import { openDb } from "../db/client.js";
import {
  meetings,
  transcriptSegments,
  users,
  type Meeting,
  type User,
} from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { packForMinutes } from "./llm/contextPacker.js";
import { chatCompletions } from "./llm/gateway.js";

export type MinutesDoc = {
  topic: string;
  time: string;
  place: string;
  participants: string;
  goal: string;
  topics: Array<{ title: string; bullets: string[]; sub?: string }>;
  disputes: string[];
  actionItems: Array<{ owner: string; action: string }>;
  timeline: string[];
  markdown: string;
  source: "llm" | "mock";
  model: string;
  generatedAt: string;
};

const SYSTEM = `你是会议纪要助手。根据转写生成结构化中文纪要。
输出必须是 JSON（不要 markdown 围栏），字段：
{
  "topic": "主题",
  "time": "时间（可空）",
  "place": "地点（可空）",
  "participants": "参与者（可从 Speaker 推断）",
  "goal": "核心目标",
  "topics": [{"title":"议题","bullets":["要点"]}],
  "disputes": ["争议点，可空数组"],
  "actionItems": [{"owner":"责任人/角色","action":"动作"}],
  "timeline": ["时间线一句，可空"]
}`;

function renderMarkdown(doc: Omit<MinutesDoc, "markdown" | "source" | "model" | "generatedAt">): string {
  const lines: string[] = [];
  lines.push(`# ${doc.topic || "会议纪要"}`);
  lines.push("");
  lines.push("## 纪要头");
  lines.push(`- **主题：** ${doc.topic || "—"}`);
  lines.push(`- **时间：** ${doc.time || "—"}`);
  lines.push(`- **地点：** ${doc.place || "—"}`);
  lines.push(`- **参与：** ${doc.participants || "—"}`);
  lines.push(`- **目标：** ${doc.goal || "—"}`);
  lines.push("");
  lines.push("## 关键议题");
  if (!doc.topics?.length) {
    lines.push("_（无）_");
  } else {
    doc.topics.forEach((t, i) => {
      lines.push(`### ${i + 1}. ${t.title}`);
      if (t.sub) lines.push(`*${t.sub}*`);
      for (const b of t.bullets || []) lines.push(`- ${b}`);
      lines.push("");
    });
  }
  lines.push("## 争议点");
  if (!doc.disputes?.length) lines.push("_（无）_");
  else for (const d of doc.disputes) lines.push(`> ${d}`);
  lines.push("");
  lines.push("## 待办");
  if (!doc.actionItems?.length) lines.push("_（无）_");
  else
    for (const a of doc.actionItems) {
      lines.push(`- **${a.owner || "未指定"}** — ${a.action}`);
    }
  lines.push("");
  lines.push("## 时间轴");
  if (!doc.timeline?.length) lines.push("_（无）_");
  else for (const t of doc.timeline) lines.push(`- ${t}`);
  lines.push("");
  return lines.join("\n");
}

function mockFromTranscript(
  meeting: Meeting,
  segments: Array<{ speaker: string; text: string; startMs: number }>,
): MinutesDoc {
  const speakers = [...new Set(segments.map((s) => s.speaker))];
  const actionItems = segments
    .filter((s) => /待办|记住|请|需要|下次|跟进/.test(s.text))
    .slice(0, 5)
    .map((s) => ({
      owner: s.speaker,
      action: s.text.slice(0, 120),
    }));
  if (!actionItems.length && segments[0]) {
    actionItems.push({
      owner: segments[0].speaker,
      action: "跟进本次会议决议并同步相关方",
    });
  }

  const topics = [
    {
      title: "讨论摘要",
      bullets: segments.slice(0, 6).map((s) => `${s.speaker}：${s.text.slice(0, 100)}`),
    },
  ];

  const base = {
    topic: meeting.title,
    time: meeting.createdAt.toISOString(),
    place: "",
    participants: speakers.join("、"),
    goal: "对齐进度并明确后续行动",
    topics,
    disputes: [] as string[],
    actionItems,
    timeline: segments.slice(0, 4).map((s) => s.text.slice(0, 80)),
  };

  return {
    ...base,
    markdown: renderMarkdown(base),
    source: "mock",
    model: "mock-heuristic",
    generatedAt: new Date().toISOString(),
  };
}

function parseModelJson(raw: string): Partial<MinutesDoc> | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as Partial<MinutesDoc>;
  } catch {
    return null;
  }
}

export async function generateMinutesForMeeting(
  meetingId: string,
  userId: string,
): Promise<MinutesDoc> {
  const db = openDb();
  const mRows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const meeting = mRows[0];
  if (!meeting) throw notFound("会议不存在");

  const segs = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meetingId))
    .orderBy(asc(transcriptSegments.idx));

  if (!segs.length) throw badRequest("尚无转写，无法生成纪要");

  const uRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = uRows[0] as User | undefined;
  if (!user) throw notFound("用户不存在");

  const packed = packForMinutes({
    system: SYSTEM,
    meetingTitle: meeting.title,
    segments: segs,
    userTask:
      "请根据转写生成完整 JSON 纪要。待办写成「责任人 + 动作」。争议点没有就返回空数组。",
  });

  let doc: MinutesDoc;
  try {
    const result = await chatCompletions(user, packed.messages);
    if (result.mocked || !result.content) {
      doc = mockFromTranscript(meeting, segs);
    } else {
      const parsed = parseModelJson(result.content);
      if (!parsed) {
        doc = mockFromTranscript(meeting, segs);
        doc.markdown =
          `# ${meeting.title}\n\n` + result.content + "\n\n---\n_模型未返回合法 JSON，已附原文。_\n";
        doc.source = "llm";
        doc.model = result.model;
      } else {
        const base = {
          topic: String(parsed.topic || meeting.title),
          time: String(parsed.time || meeting.createdAt.toISOString()),
          place: String(parsed.place || ""),
          participants: String(parsed.participants || ""),
          goal: String(parsed.goal || ""),
          topics: Array.isArray(parsed.topics) ? parsed.topics : [],
          disputes: Array.isArray(parsed.disputes) ? parsed.disputes.map(String) : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          timeline: Array.isArray(parsed.timeline) ? parsed.timeline.map(String) : [],
        };
        doc = {
          ...base,
          markdown: renderMarkdown(base),
          source: "llm",
          model: result.model,
          generatedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    doc = mockFromTranscript(meeting, segs);
    doc.goal = `${doc.goal}（LLM 调用失败，已降级 mock：${
      err instanceof Error ? err.message.slice(0, 80) : "error"
    }）`;
    doc.markdown = renderMarkdown(doc);
  }

  const now = new Date();
  await db
    .update(meetings)
    .set({
      minutesJson: JSON.stringify(doc),
      minutesMarkdown: doc.markdown,
      minutesStatus: "ready",
      summary: doc.goal || doc.topic || meeting.summary,
      updatedAt: now,
    })
    .where(eq(meetings.id, meetingId));

  return doc;
}

export async function getMinutes(
  userId: string,
  meetingId: string,
): Promise<MinutesDoc | null> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");
  if (!m.minutesJson) return null;
  try {
    return JSON.parse(m.minutesJson) as MinutesDoc;
  } catch {
    return {
      topic: m.title,
      time: "",
      place: "",
      participants: "",
      goal: "",
      topics: [],
      disputes: [],
      actionItems: [],
      timeline: [],
      markdown: m.minutesMarkdown || "",
      source: "mock",
      model: "unknown",
      generatedAt: m.updatedAt.toISOString(),
    };
  }
}

export async function saveMinutesMarkdown(
  userId: string,
  meetingId: string,
  markdown: string,
): Promise<MinutesDoc> {
  if (typeof markdown !== "string") throw badRequest("markdown 无效");
  if (markdown.length > 200_000) throw badRequest("纪要过长");
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");

  let doc: MinutesDoc;
  if (m.minutesJson) {
    try {
      doc = JSON.parse(m.minutesJson) as MinutesDoc;
    } catch {
      doc = mockFromTranscript(m, []);
    }
  } else {
    doc = {
      topic: m.title,
      time: "",
      place: "",
      participants: "",
      goal: "",
      topics: [],
      disputes: [],
      actionItems: [],
      timeline: [],
      markdown: "",
      source: "mock",
      model: "user-edit",
      generatedAt: new Date().toISOString(),
    };
  }
  doc.markdown = markdown;
  doc.generatedAt = new Date().toISOString();

  const now = new Date();
  await db
    .update(meetings)
    .set({
      minutesJson: JSON.stringify(doc),
      minutesMarkdown: markdown,
      minutesStatus: "ready",
      updatedAt: now,
    })
    .where(eq(meetings.id, meetingId));

  return doc;
}

/** Save structured minutes (prototype-style fields) and re-render markdown. */
export async function saveMinutesDoc(
  userId: string,
  meetingId: string,
  patch: Partial<{
    topic: string;
    time: string;
    place: string;
    participants: string;
    goal: string;
    topics: Array<{ title: string; bullets: string[]; sub?: string }>;
    disputes: string[];
    actionItems: Array<{ owner: string; action: string }>;
    timeline: string[] | Array<{ t?: string; title?: string; body?: string }>;
  }>,
): Promise<MinutesDoc> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");

  let current: MinutesDoc;
  if (m.minutesJson) {
    try {
      current = JSON.parse(m.minutesJson) as MinutesDoc;
    } catch {
      current = mockFromTranscript(m, []);
    }
  } else {
    current = mockFromTranscript(m, []);
  }

  const timeline = Array.isArray(patch.timeline)
    ? patch.timeline.map((t) => {
        if (typeof t === "string") return t;
        const parts = [t.t, t.title, t.body].filter(Boolean);
        return parts.join(" · ") || "";
      })
    : current.timeline;

  const base = {
    topic: patch.topic !== undefined ? String(patch.topic) : current.topic,
    time: patch.time !== undefined ? String(patch.time) : current.time,
    place: patch.place !== undefined ? String(patch.place) : current.place,
    participants:
      patch.participants !== undefined
        ? String(patch.participants)
        : current.participants,
    goal: patch.goal !== undefined ? String(patch.goal) : current.goal,
    topics: (patch.topics ?? current.topics).map((t) => ({
      title: String(t.title || ""),
      bullets: Array.isArray(t.bullets) ? t.bullets.map(String) : [],
      ...(t.sub ? { sub: String(t.sub) } : {}),
    })),
    disputes: (patch.disputes ?? current.disputes).map(String),
    actionItems: (patch.actionItems ?? current.actionItems).map((a) => ({
      owner: String(a.owner || ""),
      action: String(a.action || ""),
    })),
    timeline: timeline.map(String).filter(Boolean),
  };

  const doc: MinutesDoc = {
    ...base,
    markdown: renderMarkdown(base),
    source: current.source || "mock",
    model: current.model || "user-edit",
    generatedAt: new Date().toISOString(),
  };

  const now = new Date();
  await db
    .update(meetings)
    .set({
      minutesJson: JSON.stringify(doc),
      minutesMarkdown: doc.markdown,
      minutesStatus: "ready",
      summary: doc.goal || doc.topic || m.summary,
      updatedAt: now,
    })
    .where(eq(meetings.id, meetingId));

  return doc;
}
