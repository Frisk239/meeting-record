import { and, desc, eq, isNull } from "drizzle-orm";
import { openDb } from "../db/client.js";
import { meetings, shareLinks } from "../db/schema.js";
import { hashToken, newId, newSessionToken } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getMinutes, type MinutesDoc } from "./minutes.js";

export type ShareScope = "minutes_visual";

export type PublicSharePayload = {
  title: string;
  appName: string;
  scope: ShareScope;
  /** Always null for permanent product shares */
  expiresAt: string | null;
  permanent: true;
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

/**
 * Create or reuse a permanent read-only share link for a meeting.
 * Same meeting returns the same URL until revoked.
 */
export async function createShareLink(
  userId: string,
  meetingId: string,
): Promise<{ token: string; expiresAt: null; scope: ShareScope; permanent: true }> {
  const db = openDb();
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  const m = rows[0];
  if (!m) throw notFound("会议不存在");

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
    .limit(1);

  const active = existing[0];

  // Reuse permanent link when we still have the raw URL token
  if (active?.publicToken) {
    return {
      token: active.publicToken,
      expiresAt: null,
      scope: "minutes_visual",
      permanent: true,
    };
  }

  // Legacy active row without publicToken: revoke only (do not touch expires_at —
  // old DBs may still have NOT NULL on that column until migrate rebuild runs).
  if (active) {
    await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(eq(shareLinks.id, active.id));
  }

  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const id = newId("shr");

  try {
    await db.insert(shareLinks).values({
      id,
      meetingId,
      userId,
      tokenHash,
      publicToken: token,
      scope: "minutes_visual",
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
  } catch (err) {
    // Fallback for DBs that still enforce expires_at NOT NULL before rebuild:
    // far-future timestamp ≈ permanent for product purposes.
    const msg = err instanceof Error ? err.message : String(err);
    if (/expires_at|NOT NULL|SQLITE_CONSTRAINT/i.test(msg)) {
      const far = new Date("9999-12-31T00:00:00.000Z");
      await db.insert(shareLinks).values({
        id,
        meetingId,
        userId,
        tokenHash,
        publicToken: token,
        scope: "minutes_visual",
        expiresAt: far,
        revokedAt: null,
        createdAt: new Date(),
      });
    } else {
      throw err;
    }
  }

  return {
    token,
    expiresAt: null,
    scope: "minutes_visual",
    permanent: true,
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

  // Permanent unless a real finite expiry is set (ignore sentinel year 9999)
  if (link.expiresAt != null) {
    const exp =
      link.expiresAt instanceof Date
        ? link.expiresAt.getTime()
        : Number(link.expiresAt);
    const year9999 = Date.UTC(9999, 0, 1);
    if (Number.isFinite(exp) && exp > 0 && exp < year9999 && exp < Date.now()) {
      throw notFound("分享已过期");
    }
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
    expiresAt: null,
    permanent: true,
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
