import type { TranscriptSegment } from "../../db/schema.js";

/**
 * Minimal Context Packer (ADR 0005 L0–L4 skeleton for Auto Minutes).
 * Pinned facts always full; transcript may be truncated with a digest map.
 */

export type PackInput = {
  system: string;
  meetingTitle: string;
  pinned?: string[];
  existingMinutesMarkdown?: string;
  segments: Array<Pick<TranscriptSegment, "speaker" | "startMs" | "endMs" | "text">>;
  userTask: string;
  /** rough char budget (not tokenizer-accurate; good enough for MVP) */
  maxChars?: number;
};

export type PackedPrompt = {
  messages: Array<{ role: "system" | "user"; content: string }>;
  includedSegmentCount: number;
  truncated: boolean;
};

function formatSeg(s: {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
}): string {
  const t = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };
  return `[${t(s.startMs)}-${t(s.endMs)}] ${s.speaker}: ${s.text}`;
}

export function packForMinutes(input: PackInput): PackedPrompt {
  const maxChars = input.maxChars ?? 12_000;
  const pinnedBlock = (input.pinned ?? [])
    .filter(Boolean)
    .map((p) => `- ${p}`)
    .join("\n");

  const header = [
    `会议标题：${input.meetingTitle}`,
    pinnedBlock ? `钉选要点：\n${pinnedBlock}` : "",
    input.existingMinutesMarkdown
      ? `已有纪要（可修订）：\n${input.existingMinutesMarkdown}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // L4: pack segments until budget; prepend digest of remainder
  const lines = input.segments.map(formatSeg);
  const chosen: string[] = [];
  let used = header.length + input.system.length + input.userTask.length + 200;
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (used + line.length + 1 > maxChars) break;
    chosen.push(line);
    used += line.length + 1;
  }
  const truncated = i < lines.length;
  const digest =
    truncated && i < lines.length
      ? `\n…另有 ${lines.length - i} 段未全文装入（总 ${lines.length} 段）。`
      : "";

  const userContent = [
    header,
    "转写原文：",
    chosen.join("\n") + digest,
    "",
    input.userTask,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: userContent },
    ],
    includedSegmentCount: chosen.length,
    truncated,
  };
}
