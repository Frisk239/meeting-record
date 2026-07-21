import { and, desc, eq, isNull } from "drizzle-orm";
import { openDb } from "../db/client.js";
import { meetings, shareLinks } from "../db/schema.js";
import { hashToken, newId, newSessionToken } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getMinutes, type MinutesDoc } from "./minutes.js";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ShareScope = "minutes_visual";

export type PublicSharePayload = {
  title: string;
  appName: string;
  scope: ShareScope;
  expiresAt: string;
  minutes: {
    topic: string;
    time: string;
    place: string;
    participants: string;
    goal: string;
    topics: MinutesDoc["topics"];
    disputes: string[];
    actionItems: MinutesDoc["actionItems"];
    timeline: string[];
    visualBoard: MinutesDoc["visualBoard"];
  } | null;
};

function toIso(v: Date | number | null | undefined): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  return new Date().toISOString();
}

export async function createShareLink(
  userId: string,
  meetingId: string,
  opts?: { ttlMs?: number },
): Promise<{ token: string; expiresAt: string; scope: ShareScope }> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");

  // Reuse active non-expired link if any
  const existing = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.meetingId, meetingId),
        eq(shareLinks.userId, userId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .orderBy(desc(shareLinks.createdAt))
    .limit(5);

  const now = Date.now();
  for (const link of existing) {
    const exp =
      link.expiresAt instanceof Date
        ? link.expiresAt.getTime()
        : Number(link.expiresAt);
    if (exp > now + 60_000) {
      // Cannot recover raw token from hash — issue a fresh one and revoke old
      break;
    }
  }

  // Revoke previous active links for this meeting (one active share at a time)
  for (const link of existing) {
    if (!link.revokedAt) {
      await db
        .update(shareLinks)
        .set({ revokedAt: new Date() })
        .where(eq(shareLinks.id, link.id));
    }
  }

  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const ttl = opts?.ttlMs && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_TTL_MS;
  const expiresAt = new Date(now + ttl);
  const id = newId("shr");

  await db.insert(shareLinks).values({
    id,
    meetingId,
    userId,
    tokenHash,
    scope: "minutes_visual",
    expiresAt,
    revokedAt: null,
    createdAt: new Date(),
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    scope: "minutes_visual",
  };
}

export async function revokeShareLinks(
  userId: string,
  meetingId: string,
): Promise<{ revoked: number }> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("会议不存在");

  const active = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.meetingId, meetingId),
        eq(shareLinks.userId, userId),
        isNull(shareLinks.revokedAt),
      ),
    );

  const now = new Date();
  for (const link of active) {
    await db
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(eq(shareLinks.id, link.id));
  }
  return { revoked: active.length };
}

export async function getPublicShare(token: string): Promise<PublicSharePayload> {
  if (!token || token.length < 16) throw badRequest("无效分享链接");
  const db = openDb();
  const tokenHash = hashToken(token);
  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, tokenHash))
    .limit(1);
  const link = links[0];
  if (!link) throw notFound("分享不存在或已失效");
  if (link.revokedAt) throw notFound("分享已撤销");

  const exp =
    link.expiresAt instanceof Date
      ? link.expiresAt.getTime()
      : Number(link.expiresAt);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    throw notFound("分享已过期");
  }

  const mRows = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, link.meetingId))
    .limit(1);
  const m = mRows[0];
  if (!m) throw notFound("会议不存在");

  const minutes = await getMinutes(link.userId, link.meetingId);
  const { config } = await import("../config.js");

  return {
    title: m.title,
    appName: config.appName,
    scope: "minutes_visual",
    expiresAt: toIso(link.expiresAt),
    minutes: minutes
      ? {
          topic: minutes.topic || m.title,
          time: minutes.time || "",
          place: minutes.place || "",
          participants: minutes.participants || "",
          goal: minutes.goal || "",
          topics: minutes.topics || [],
          disputes: minutes.disputes || [],
          actionItems: minutes.actionItems || [],
          timeline: minutes.timeline || [],
          visualBoard: minutes.visualBoard ?? null,
        }
      : null,
  };
}
