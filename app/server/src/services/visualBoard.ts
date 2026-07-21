/**
 * Minutes Visual Engine — LLM-only filler + validator.
 * Design: docs/design/minutes-visual-engine.md
 * No heuristic degradation: missing LLM / bad JSON → hard error.
 */
import { and, eq } from "drizzle-orm";
import { openDb } from "../db/client.js";
import { meetings, users, type User } from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { packForMinutes } from "./llm/contextPacker.js";
import { chatCompletions } from "./llm/gateway.js";
import { getMinutes, type MinutesDoc } from "./minutes.js";

export type MeetingIntent =
  | "briefing"
  | "decision"
  | "sync"
  | "planning"
  | "one_on_one"
  | "retro"
  | "general"
  | "mixed";

export type VisualTone =
  | "neutral"
  | "coral"
  | "teal"
  | "amber"
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "info";

export type VisualIcon =
  | "doc"
  | "clock"
  | "people"
  | "flag"
  | "check"
  | "alert"
  | "shield"
  | "target"
  | "calendar"
  | "link"
  | "star"
  | "bolt"
  | "folder"
  | "chat";

export type VisualCard = {
  title: string;
  badge?: string;
  body?: string;
  bullets?: string[];
  footer?: string;
  tone?: VisualTone;
  icon?: VisualIcon;
};

export type VisualSection =
  | { type: "hero"; title: string; subtitle?: string }
  | {
      type: "stage_row";
      heading: string;
      items: Array<{
        title: string;
        badge?: string;
        body: string;
        icon?: VisualIcon;
        tone?: VisualTone;
      }>;
    }
  | {
      type: "compare_cards";
      heading: string;
      cards: VisualCard[];
    }
  | {
      type: "card_grid";
      heading: string;
      columns: 2 | 3 | 4;
      cards: VisualCard[];
    }
  | {
      type: "action_board";
      heading: string;
      items: Array<{ owner: string; action: string; due?: string }>;
    }
  | {
      type: "callout";
      tone: "tip" | "warn" | "info";
      text: string;
    };

export type VisualBoard = {
  version: 1;
  intent: MeetingIntent;
  recipeId: string;
  title: string;
  subtitle?: string;
  sections: VisualSection[];
  source: "llm";
  model: string;
  generatedAt: string;
};

const INTENTS = new Set<string>([
  "briefing",
  "decision",
  "sync",
  "planning",
  "one_on_one",
  "retro",
  "general",
  "mixed",
]);

const TONES = new Set<string>([
  "neutral",
  "coral",
  "teal",
  "amber",
  "success",
  "warning",
  "danger",
  "purple",
  "info",
]);

const ICONS = new Set<string>([
  "doc",
  "clock",
  "people",
  "flag",
  "check",
  "alert",
  "shield",
  "target",
  "calendar",
  "link",
  "star",
  "bolt",
  "folder",
  "chat",
]);

const MAX_SECTIONS = 6;
const MAX_STAGE_ITEMS = 4;
const MAX_COMPARE_CARDS = 3;
const MAX_GRID_CARDS = 6;
const MAX_BULLETS = 5;
const MAX_BULLET_CHARS = 120;
const MAX_ACTION_ITEMS = 8;

const SYSTEM = `你是会议「图解总览」引擎。根据已有结构化纪要，输出 **仅一个 JSON 对象**（不要 markdown 围栏、不要 HTML/CSS）。
必须遵守闭合 schema，禁止自创 section.type。

顶层字段：
{
  "version": 1,
  "intent": "briefing|decision|sync|planning|one_on_one|retro|general|mixed",
  "recipeId": "string 如 briefing.v1 / general.v1",
  "title": "会议主题",
  "subtitle": "一句话摘要（可选）",
  "sections": [ ... ]
}

sections[].type 只能是：
- hero: { type, title, subtitle? }
- stage_row: { type, heading, items:[{ title, badge?, body, icon?, tone? }] }  // 2~4 items
- compare_cards: { type, heading, cards:[{ title, badge?, tone, bullets[], footer?, icon? }] }  // 2~3
- card_grid: { type, heading, columns: 2|3|4, cards:[{ title, badge?, tone?, bullets[], footer?, icon? }] }
- action_board: { type, heading, items:[{ owner, action, due? }] }
- callout: { type, tone: "tip"|"warn"|"info", text }

tone 枚举: neutral|coral|teal|amber|success|warning|danger|purple|info
icon 枚举: doc|clock|people|flag|check|alert|shield|target|calendar|link|star|bolt|folder|chat

预算：sections≤6；每卡 bullets≤5；每条 bullet≤120 字；内容必须可从纪要追溯，禁止编造关键事实。
按会议形态选 intent 与骨架（宣讲 briefing、决策 decision、同步 sync、规划 planning、1:1 one_on_one、复盘 retro、其它 general）。
使用中文。`;

function stripHtml(s: string): string {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, n: number): string {
  const t = stripHtml(s);
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function asTone(v: unknown, fallback: VisualTone = "neutral"): VisualTone {
  const s = String(v || "");
  return TONES.has(s) ? (s as VisualTone) : fallback;
}

function asIcon(v: unknown): VisualIcon | undefined {
  const s = String(v || "");
  return ICONS.has(s) ? (s as VisualIcon) : undefined;
}

function asBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => clip(String(b || ""), MAX_BULLET_CHARS))
    .filter(Boolean)
    .slice(0, MAX_BULLETS);
}

function normalizeCard(raw: unknown): VisualCard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = clip(String(o.title || ""), 40);
  if (!title) return null;
  const bullets = asBullets(o.bullets);
  const body = o.body != null ? clip(String(o.body), 200) : undefined;
  const footer = o.footer != null ? clip(String(o.footer), 160) : undefined;
  const badge = o.badge != null ? clip(String(o.badge), 16) : undefined;
  if (!bullets.length && !body && !footer) {
    // allow title-only only if badge present
    if (!badge) return null;
  }
  return {
    title,
    ...(badge ? { badge } : {}),
    ...(body ? { body } : {}),
    ...(bullets.length ? { bullets } : {}),
    ...(footer ? { footer } : {}),
    tone: asTone(o.tone),
    ...(asIcon(o.icon) ? { icon: asIcon(o.icon) } : {}),
  };
}

/** Exported for unit tests. */
export function normalizeVisualBoard(
  raw: unknown,
  meta: { model: string; fallbackTitle: string },
): VisualBoard {
  if (!raw || typeof raw !== "object") {
    throw badRequest("图解 JSON 无效");
  }
  const o = raw as Record<string, unknown>;
  const intentRaw = String(o.intent || "general");
  const intent = (INTENTS.has(intentRaw) ? intentRaw : "general") as MeetingIntent;
  const recipeId = clip(String(o.recipeId || `${intent}.v1`), 40) || `${intent}.v1`;
  const title = clip(String(o.title || meta.fallbackTitle || "会议图解"), 80);
  const subtitle =
    o.subtitle != null && String(o.subtitle).trim()
      ? clip(String(o.subtitle), 160)
      : undefined;

  const sectionsIn = Array.isArray(o.sections) ? o.sections : [];
  const sections: VisualSection[] = [];

  for (const sec of sectionsIn) {
    if (sections.length >= MAX_SECTIONS) break;
    if (!sec || typeof sec !== "object") continue;
    const s = sec as Record<string, unknown>;
    const type = String(s.type || "");

    if (type === "hero") {
      const t = clip(String(s.title || title), 80);
      if (!t) continue;
      const sub =
        s.subtitle != null && String(s.subtitle).trim()
          ? clip(String(s.subtitle), 160)
          : undefined;
      sections.push({ type: "hero", title: t, ...(sub ? { subtitle: sub } : {}) });
      continue;
    }

    if (type === "stage_row") {
      const heading = clip(String(s.heading || "关键维度"), 40);
      const itemsRaw = Array.isArray(s.items) ? s.items : [];
      const items: Array<{
        title: string;
        badge?: string;
        body: string;
        icon?: VisualIcon;
        tone?: VisualTone;
      }> = [];
      for (const it of itemsRaw) {
        if (items.length >= MAX_STAGE_ITEMS) break;
        if (!it || typeof it !== "object") continue;
        const row = it as Record<string, unknown>;
        const itemTitle = clip(String(row.title || ""), 32);
        const body = clip(String(row.body || ""), 200);
        if (!itemTitle || !body) continue;
        const badge =
          row.badge != null && String(row.badge).trim()
            ? clip(String(row.badge), 16)
            : undefined;
        items.push({
          title: itemTitle,
          body,
          ...(badge ? { badge } : {}),
          tone: asTone(row.tone, "teal"),
          ...(asIcon(row.icon) ? { icon: asIcon(row.icon) } : {}),
        });
      }
      if (items.length >= 2) {
        sections.push({ type: "stage_row", heading, items });
      }
      continue;
    }

    if (type === "compare_cards") {
      const heading = clip(String(s.heading || "对照"), 40);
      const cardsRaw = Array.isArray(s.cards) ? s.cards : [];
      const cards: VisualCard[] = [];
      for (const c of cardsRaw) {
        if (cards.length >= MAX_COMPARE_CARDS) break;
        const card = normalizeCard(c);
        if (card) {
          if (!card.bullets?.length && card.body) {
            card.bullets = [card.body];
            delete card.body;
          }
          cards.push(card);
        }
      }
      if (cards.length >= 2) {
        sections.push({ type: "compare_cards", heading, cards });
      }
      continue;
    }

    if (type === "card_grid") {
      const heading = clip(String(s.heading || "要点"), 40);
      let columns = Number(s.columns);
      if (columns !== 2 && columns !== 3 && columns !== 4) columns = 3;
      const cardsRaw = Array.isArray(s.cards) ? s.cards : [];
      const cards: VisualCard[] = [];
      for (const c of cardsRaw) {
        if (cards.length >= MAX_GRID_CARDS) break;
        const card = normalizeCard(c);
        if (card) {
          if (!card.bullets?.length && card.body) {
            card.bullets = [card.body];
            delete card.body;
          }
          cards.push(card);
        }
      }
      if (cards.length >= 2) {
        sections.push({
          type: "card_grid",
          heading,
          columns: columns as 2 | 3 | 4,
          cards,
        });
      }
      continue;
    }

    if (type === "action_board") {
      const heading = clip(String(s.heading || "待办"), 40);
      const itemsRaw = Array.isArray(s.items) ? s.items : [];
      const items: Array<{ owner: string; action: string; due?: string }> = [];
      for (const it of itemsRaw) {
        if (items.length >= MAX_ACTION_ITEMS) break;
        if (!it || typeof it !== "object") continue;
        const row = it as Record<string, unknown>;
        const owner = clip(String(row.owner || "未指定"), 24);
        const action = clip(String(row.action || ""), 120);
        if (!action) continue;
        const due =
          row.due != null && String(row.due).trim()
            ? clip(String(row.due), 32)
            : undefined;
        items.push({ owner, action, ...(due ? { due } : {}) });
      }
      if (items.length) {
        sections.push({ type: "action_board", heading, items });
      }
      continue;
    }

    if (type === "callout") {
      const text = clip(String(s.text || ""), 200);
      if (!text) continue;
      const toneRaw = String(s.tone || "tip");
      const tone =
        toneRaw === "warn" || toneRaw === "info" || toneRaw === "tip"
          ? toneRaw
          : "tip";
      sections.push({ type: "callout", tone, text });
    }
    // unknown types dropped
  }

  if (!sections.length) {
    throw badRequest("模型未返回可用的图解区块");
  }

  return {
    version: 1,
    intent,
    recipeId,
    title,
    ...(subtitle ? { subtitle } : {}),
    sections,
    source: "llm",
    model: meta.model,
    generatedAt: new Date().toISOString(),
  };
}

function parseModelJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    // try extract first {...}
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    }
    throw badRequest("模型返回的不是合法 JSON");
  }
}

function minutesDigest(doc: MinutesDoc): string {
  const parts: string[] = [];
  parts.push(`主题: ${doc.topic || "—"}`);
  if (doc.time) parts.push(`时间: ${doc.time}`);
  if (doc.place) parts.push(`地点: ${doc.place}`);
  if (doc.participants) parts.push(`参与: ${doc.participants}`);
  if (doc.goal) parts.push(`目标: ${doc.goal}`);
  if (doc.topics?.length) {
    parts.push("议题:");
    for (const t of doc.topics.slice(0, 8)) {
      parts.push(`- ${t.title}${t.sub ? `（${t.sub}）` : ""}`);
      for (const b of (t.bullets || []).slice(0, 4)) parts.push(`  · ${b}`);
    }
  }
  if (doc.disputes?.length) {
    parts.push("争议:");
    for (const d of doc.disputes.slice(0, 5)) parts.push(`- ${d}`);
  }
  if (doc.actionItems?.length) {
    parts.push("待办:");
    for (const a of doc.actionItems.slice(0, 8)) {
      parts.push(`- ${a.owner || "未指定"}: ${a.action}`);
    }
  }
  if (doc.timeline?.length) {
    parts.push("时间轴:");
    for (const t of doc.timeline.slice(0, 8)) parts.push(`- ${t}`);
  }
  return parts.join("\n");
}

export async function generateVisualBoardForMeeting(
  userId: string,
  meetingId: string,
): Promise<MinutesDoc> {
  const db = openDb();
  const mRows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const meeting = mRows[0];
  if (!meeting) throw notFound("会议不存在");

  const minutes = await getMinutes(userId, meetingId);
  if (!minutes || (!minutes.markdown && !minutes.topics?.length && !minutes.goal)) {
    throw badRequest("请先生成纪要，再生成图解");
  }

  const uRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = uRows[0] as User | undefined;
  if (!user) throw notFound("用户不存在");

  const digest = minutesDigest(minutes);
  const packed = packForMinutes({
    system: SYSTEM,
    meetingTitle: meeting.title,
    pinned: [`结构化纪要摘要：\n${digest}`],
    existingMinutesMarkdown: minutes.markdown?.slice(0, 4000) || undefined,
    segments: [],
    userTask:
      "请只输出 VisualBoard JSON（version=1）。根据纪要选择 intent 与 sections，不要输出其它文字。",
    maxChars: 10_000,
  });

  let result: { content: string; mocked: boolean; model: string };
  try {
    result = await chatCompletions(user, packed.messages, {
      temperature: 0.4,
      maxTokens: 2500,
    });
  } catch (err) {
    throw badRequest(
      `图解生成失败：${err instanceof Error ? err.message.slice(0, 160) : "LLM 错误"}`,
    );
  }

  if (result.mocked || !result.content) {
    throw badRequest("未配置可用的 LLM（需要 base_url / model / api_key），无法生成图解");
  }

  const parsed = parseModelJson(result.content);
  const board = normalizeVisualBoard(parsed, {
    model: result.model,
    fallbackTitle: minutes.topic || meeting.title,
  });

  const next: MinutesDoc = {
    ...minutes,
    visualBoard: board,
  };

  const now = new Date();
  await db
    .update(meetings)
    .set({
      minutesJson: JSON.stringify(next),
      // keep markdown as-is; visual is parallel layer
      minutesStatus: "ready",
      updatedAt: now,
    })
    .where(eq(meetings.id, meetingId));

  return next;
}
