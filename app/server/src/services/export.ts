import fs from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { config } from "../config.js";
import { notFound } from "../lib/errors.js";
import { getMeeting } from "./meetings.js";
import { getMinutes, type MinutesDoc } from "./minutes.js";

/**
 * Prefer standalone TTF/OTF. pdf-lib cannot embed Windows .ttc collections.
 * Order: common Chinese UI fonts first.
 */
const CJK_FONT_CANDIDATES = [
  // Windows
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\simfang.ttf",
  "C:\\Windows\\Fonts\\simkai.ttf",
  "C:\\Windows\\Fonts\\Deng.ttf",
  "C:\\Windows\\Fonts\\Dengb.ttf",
  "C:\\Windows\\Fonts\\STXIHEI.TTF",
  "C:\\Windows\\Fonts\\simsunb.ttf",
  "C:\\Windows\\Fonts\\msyh.ttf",
  // macOS
  "/System/Library/Fonts/STHeiti Light.ttc",
  "/System/Library/Fonts/PingFang.ttc",
  "/Library/Fonts/Arial Unicode.ttf",
  // Linux
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
  "/usr/share/fonts/truetype/arphic/uming.ttc",
];

function envFontPath(): string | null {
  const p = (process.env.PDF_CJK_FONT || process.env.MR_PDF_FONT || "").trim();
  return p || null;
}

export type EmbeddedPdfFont = {
  regular: PDFFont;
  bold: PDFFont;
  cjk: boolean;
  fontPath?: string;
};

/** Exported for unit tests / diagnostics. */
export function listCjkFontCandidates(): string[] {
  const env = envFontPath();
  return env ? [env, ...CJK_FONT_CANDIDATES] : [...CJK_FONT_CANDIDATES];
}

export async function embedPreferredFont(
  pdf: PDFDocument,
): Promise<EmbeddedPdfFont> {
  // Required for any custom TTF/OTF; without this, embedFont throws and we
  // silently fell back to Helvetica → Chinese became "????".
  pdf.registerFontkit(fontkit);

  for (const p of listCjkFontCandidates()) {
    try {
      if (!fs.existsSync(p)) continue;
      const lower = p.toLowerCase();
      // pdf-lib + fontkit still does not handle TrueType Collections reliably
      if (lower.endsWith(".ttc") || lower.endsWith(".otc")) continue;
      const bytes = fs.readFileSync(p);
      let regular: PDFFont;
      try {
        regular = await pdf.embedFont(bytes, { subset: true });
      } catch {
        // Some CJK TTFs fail subsetting; full embed is larger but works.
        regular = await pdf.embedFont(bytes, { subset: false });
      }
      return { regular, bold: regular, cjk: true, fontPath: p };
    } catch {
      // try next candidate
    }
  }

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, cjk: false };
}

/** Strip common Markdown inline markers for plain PDF text. */
export function stripMdInline(text: string): string {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[ \t]*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop YAML frontmatter (`---` … `---`) often prepended by MD export. */
export function stripYamlFrontmatter(md: string): string {
  const s = String(md || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!s.startsWith("---\n") && s !== "---") return s;
  const end = s.indexOf("\n---", 3);
  if (end < 0) return s;
  // after "\n---" may be "\n" or end-of-string
  let rest = s.slice(end + 4);
  if (rest.startsWith("\n")) rest = rest.slice(1);
  return rest.replace(/^\n+/, "");
}

type PdfBlock =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "li"; text: string; level: number }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "spacer"; pt: number };

/** Lightweight Markdown → layout blocks (for PDF). */
export function markdownToPdfBlocks(md: string): PdfBlock[] {
  const raw = stripYamlFrontmatter(md).replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const blocks: PdfBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push({ kind: "spacer", pt: 6 });
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      const text = stripMdInline(h[2] || "");
      if (level === 1) blocks.push({ kind: "h1", text });
      else if (level === 2) blocks.push({ kind: "h2", text });
      else blocks.push({ kind: "h3", text });
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const qs: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        qs.push(stripMdInline((lines[i] ?? "").replace(/^\s*>\s?/, "")));
        i += 1;
      }
      blocks.push({ kind: "quote", text: qs.filter(Boolean).join(" ") });
      continue;
    }

    // fenced code → plain paragraphs (no monospaced CJK guaranteed)
    if (trimmed.startsWith("```")) {
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      const joined = body.join(" ").trim();
      if (joined) blocks.push({ kind: "p", text: stripMdInline(joined) });
      continue;
    }

    const li = line.match(/^(\s*)([-*+•·]|\d+[.)])\s+(.*)$/);
    if (li) {
      const indent = li[1]!.replace(/\t/g, "  ").length;
      const level = Math.min(2, Math.floor(indent / 2));
      let item = li[3] || "";
      // task list markers
      item = item.replace(/^\[[ xX]\]\s+/, "");
      blocks.push({ kind: "li", text: stripMdInline(item), level });
      i += 1;
      continue;
    }

    // paragraph: merge consecutive plain lines
    const para: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^(#{1,3})\s+/.test((lines[i] ?? "").trim()) &&
      !(lines[i] ?? "").trim().startsWith(">") &&
      !(lines[i] ?? "").trim().startsWith("```") &&
      !/^(\s*)([-*+•·]|\d+[.)])\s+/.test(lines[i] ?? "") &&
      !/^---+$/.test((lines[i] ?? "").trim())
    ) {
      para.push((lines[i] ?? "").trim());
      i += 1;
    }
    blocks.push({ kind: "p", text: stripMdInline(para.join(" ")) });
  }

  return collapseSpacers(blocks);
}

function collapseSpacers(blocks: PdfBlock[]): PdfBlock[] {
  const out: PdfBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "spacer") {
      const prev = out[out.length - 1];
      if (!prev || prev.kind === "spacer" || prev.kind === "hr") continue;
      out.push(b);
      continue;
    }
    out.push(b);
  }
  while (out.length && out[out.length - 1]?.kind === "spacer") out.pop();
  return out;
}

function minutesDocToBlocks(doc: MinutesDoc, meetingTitle: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  const title = (doc.topic || meetingTitle || "会议纪要").trim();
  blocks.push({ kind: "h1", text: title });
  blocks.push({ kind: "spacer", pt: 4 });

  const meta: Array<[string, string]> = [
    ["会议主题", doc.topic || "—"],
    ["会议时间", doc.time || "—"],
    ["会议地点", doc.place || "—"],
    ["参与主体", doc.participants || "—"],
    ["核心目标", doc.goal || "—"],
  ];
  for (const [k, v] of meta) {
    if (!v || v === "—") {
      // still show empty meta for structure? Prefer show all header fields
    }
    blocks.push({ kind: "p", text: `${k}：${stripMdInline(v || "—")}` });
  }
  blocks.push({ kind: "spacer", pt: 8 });

  blocks.push({ kind: "h2", text: "关键议题" });
  if (!doc.topics?.length) {
    blocks.push({ kind: "p", text: "（无）" });
  } else {
    doc.topics.forEach((t, i) => {
      blocks.push({
        kind: "h3",
        text: `${i + 1}. ${stripMdInline(t.title || "未命名议题")}`,
      });
      if (t.sub) blocks.push({ kind: "p", text: stripMdInline(t.sub) });
      for (const b of t.bullets || []) {
        const text = stripMdInline(b);
        if (text) blocks.push({ kind: "li", text, level: 0 });
      }
      blocks.push({ kind: "spacer", pt: 4 });
    });
  }

  blocks.push({ kind: "h2", text: "争议点" });
  if (!doc.disputes?.length) {
    blocks.push({ kind: "p", text: "（无）" });
  } else {
    for (const d of doc.disputes) {
      const text = stripMdInline(d);
      if (text) blocks.push({ kind: "quote", text });
    }
  }
  blocks.push({ kind: "spacer", pt: 4 });

  blocks.push({ kind: "h2", text: "待办事项" });
  if (!doc.actionItems?.length) {
    blocks.push({ kind: "p", text: "（无）" });
  } else {
    for (const a of doc.actionItems) {
      const owner = stripMdInline(a.owner || "未指定");
      const action = stripMdInline(a.action || "");
      blocks.push({
        kind: "li",
        text: action ? `${owner} — ${action}` : owner,
        level: 0,
      });
    }
  }
  blocks.push({ kind: "spacer", pt: 4 });

  blocks.push({ kind: "h2", text: "时间轴内容回顾" });
  if (!doc.timeline?.length) {
    blocks.push({ kind: "p", text: "（无）" });
  } else {
    for (const t of doc.timeline) {
      const text = stripMdInline(t);
      if (text) blocks.push({ kind: "li", text, level: 0 });
    }
  }

  return collapseSpacers(blocks);
}

function transcriptToBlocks(
  lines: Array<{ speaker: string; startMs: number; text: string }>,
): PdfBlock[] {
  if (!lines.length) return [];
  const blocks: PdfBlock[] = [
    { kind: "hr" },
    { kind: "h2", text: "原文转写" },
    { kind: "spacer", pt: 4 },
  ];
  for (const line of lines) {
    const speaker = stripMdInline(line.speaker || "Speaker");
    const text = stripMdInline(line.text || "");
    if (!text) continue;
    blocks.push({
      kind: "p",
      text: `${speaker}（${formatMs(line.startMs)}）：${text}`,
    });
  }
  return blocks;
}

export async function exportMarkdown(
  userId: string,
  meetingId: string,
  includeTranscript: boolean,
): Promise<{ filename: string; content: string }> {
  const meeting = await getMeeting(userId, meetingId);
  const minutes = await getMinutes(userId, meetingId);
  if (!minutes?.markdown && !meeting.transcript.length) {
    throw notFound("无可导出内容");
  }

  const parts: string[] = [];
  parts.push(`---`);
  parts.push(`title: ${JSON.stringify(meeting.title)}`);
  parts.push(`app: ${JSON.stringify(config.appName)}`);
  parts.push(`exportedAt: ${JSON.stringify(new Date().toISOString())}`);
  parts.push(`---`);
  parts.push("");
  if (minutes?.markdown) {
    parts.push(minutes.markdown.trim());
    parts.push("");
  } else {
    parts.push(`# ${meeting.title}`);
    parts.push("");
    parts.push("_尚未生成纪要_");
    parts.push("");
  }

  if (includeTranscript && meeting.transcript.length) {
    parts.push("---");
    parts.push("");
    parts.push("## 原文转写");
    parts.push("");
    for (const line of meeting.transcript) {
      parts.push(`**${line.speaker}** (${formatMs(line.startMs)}): ${line.text}`);
      parts.push("");
    }
  }

  const safe = meeting.title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
  return {
    filename: `${safe || "meeting"}.md`,
    content: parts.join("\n"),
  };
}

// Visual tokens (Claude DESIGN coral-ish, readable on white paper)
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.42, 0.46);
const ACCENT = rgb(0.86, 0.42, 0.28); // coral
const RULE = rgb(0.88, 0.86, 0.84);
const QUOTE_BG = rgb(0.98, 0.96, 0.94);
const QUOTE_BAR = rgb(0.9, 0.55, 0.42);

type DrawCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  width: number;
  height: number;
  y: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  regular: PDFFont;
  bold: PDFFont;
  cjk: boolean;
  pageNo: number;
};

function sanitizeText(text: string, cjk: boolean): string {
  const t = String(text || "")
    .replace(/\t/g, "  ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return cjk ? t : t.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function ensureSpace(ctx: DrawCtx, need: number) {
  if (ctx.y - need >= ctx.marginBottom) return;
  // footer page number on current page before flipping
  drawPageFooter(ctx);
  ctx.page = ctx.pdf.addPage();
  const { width, height } = ctx.page.getSize();
  ctx.width = width;
  ctx.height = height;
  ctx.y = height - ctx.marginTop;
  ctx.pageNo += 1;
  drawPageHeader(ctx);
}

function drawPageHeader(ctx: DrawCtx) {
  // subtle brand line only on page 1 is handled by content; continuing pages get small app name
  if (ctx.pageNo <= 1) return;
  const label = sanitizeText(config.appName, ctx.cjk);
  ctx.page.drawText(label, {
    x: ctx.marginX,
    y: ctx.height - 28,
    size: 9,
    font: ctx.regular,
    color: MUTED,
  });
  ctx.page.drawLine({
    start: { x: ctx.marginX, y: ctx.height - 34 },
    end: { x: ctx.width - ctx.marginX, y: ctx.height - 34 },
    thickness: 0.6,
    color: RULE,
  });
  ctx.y = Math.min(ctx.y, ctx.height - 48);
}

function drawPageFooter(ctx: DrawCtx) {
  const label = sanitizeText(`第 ${ctx.pageNo} 页`, ctx.cjk);
  const size = 9;
  const w = ctx.regular.widthOfTextAtSize(label, size);
  ctx.page.drawText(label, {
    x: (ctx.width - w) / 2,
    y: 22,
    size,
    font: ctx.regular,
    color: MUTED,
  });
}

function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  cjk: boolean,
): string[] {
  const safe = sanitizeText(text, cjk);
  if (!safe) return [""];
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    if (line) {
      lines.push(line);
      line = "";
    }
  };
  for (const ch of safe) {
    if (ch === "\n") {
      flush();
      continue;
    }
    const trial = line + ch;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      flush();
      line = ch;
    } else {
      line = trial;
    }
  }
  flush();
  return lines.length ? lines : [""];
}

function drawWrapped(
  ctx: DrawCtx,
  text: string,
  opts: {
    size: number;
    font?: PDFFont;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    lineHeight?: number;
    maxWidth?: number;
  },
) {
  const font = opts.font ?? ctx.regular;
  const size = opts.size;
  const color = opts.color ?? INK;
  const indent = opts.indent ?? 0;
  const lineHeight = opts.lineHeight ?? size * 1.55;
  const maxWidth = opts.maxWidth ?? ctx.width - ctx.marginX * 2 - indent;
  const lines = wrapLines(text, font, size, maxWidth, ctx.cjk);
  for (const ln of lines) {
    ensureSpace(ctx, lineHeight + 2);
    ctx.page.drawText(ln, {
      x: ctx.marginX + indent,
      y: ctx.y,
      size,
      font,
      color,
    });
    ctx.y -= lineHeight;
  }
}

function drawBlocks(ctx: DrawCtx, blocks: PdfBlock[]) {
  const contentWidth = ctx.width - ctx.marginX * 2;

  for (const b of blocks) {
    if (b.kind === "spacer") {
      ctx.y -= b.pt;
      continue;
    }

    if (b.kind === "hr") {
      ensureSpace(ctx, 16);
      ctx.y -= 6;
      ctx.page.drawLine({
        start: { x: ctx.marginX, y: ctx.y },
        end: { x: ctx.width - ctx.marginX, y: ctx.y },
        thickness: 0.8,
        color: RULE,
      });
      ctx.y -= 12;
      continue;
    }

    if (b.kind === "h1") {
      ensureSpace(ctx, 40);
      ctx.y -= 4;
      drawWrapped(ctx, b.text, {
        size: 20,
        font: ctx.bold,
        lineHeight: 28,
      });
      // coral underline
      ensureSpace(ctx, 10);
      ctx.y -= 2;
      ctx.page.drawLine({
        start: { x: ctx.marginX, y: ctx.y },
        end: { x: ctx.marginX + Math.min(72, contentWidth * 0.25), y: ctx.y },
        thickness: 2.5,
        color: ACCENT,
      });
      ctx.y -= 14;
      continue;
    }

    if (b.kind === "h2") {
      ensureSpace(ctx, 36);
      ctx.y -= 10;
      drawWrapped(ctx, b.text, {
        size: 14,
        font: ctx.bold,
        color: INK,
        lineHeight: 20,
      });
      ensureSpace(ctx, 8);
      ctx.y -= 2;
      ctx.page.drawLine({
        start: { x: ctx.marginX, y: ctx.y },
        end: { x: ctx.width - ctx.marginX, y: ctx.y },
        thickness: 0.9,
        color: RULE,
      });
      ctx.y -= 10;
      continue;
    }

    if (b.kind === "h3") {
      ensureSpace(ctx, 26);
      ctx.y -= 6;
      drawWrapped(ctx, b.text, {
        size: 12.5,
        font: ctx.bold,
        lineHeight: 18,
      });
      ctx.y -= 2;
      continue;
    }

    if (b.kind === "li") {
      const indent = 8 + b.level * 14;
      // Use a CJK-safe middle-dot bullet (avoids missing-glyph tofu boxes)
      const bullet = "·";
      const size = 11;
      const lineHeight = 17;
      const bulletW = ctx.regular.widthOfTextAtSize(`${bullet}  `, size);
      const lines = wrapLines(
        b.text,
        ctx.regular,
        size,
        contentWidth - indent - bulletW,
        ctx.cjk,
      );
      for (let li = 0; li < lines.length; li++) {
        ensureSpace(ctx, lineHeight + 2);
        if (li === 0) {
          ctx.page.drawText(bullet, {
            x: ctx.marginX + indent,
            y: ctx.y,
            size,
            font: ctx.regular,
            color: ACCENT,
          });
        }
        ctx.page.drawText(lines[li]!, {
          x: ctx.marginX + indent + bulletW,
          y: ctx.y,
          size,
          font: ctx.regular,
          color: INK,
        });
        ctx.y -= lineHeight;
      }
      ctx.y -= 2;
      continue;
    }

    if (b.kind === "quote") {
      const size = 10.5;
      const padX = 10;
      const padY = 8;
      const lines = wrapLines(
        b.text,
        ctx.regular,
        size,
        contentWidth - padX * 2 - 6,
        ctx.cjk,
      );
      const boxH = lines.length * (size * 1.5) + padY * 2;
      ensureSpace(ctx, boxH + 8);
      ctx.y -= 4;
      const boxTop = ctx.y + size;
      const boxBottom = boxTop - boxH;
      ctx.page.drawRectangle({
        x: ctx.marginX,
        y: boxBottom,
        width: contentWidth,
        height: boxH,
        color: QUOTE_BG,
      });
      ctx.page.drawRectangle({
        x: ctx.marginX,
        y: boxBottom,
        width: 3.5,
        height: boxH,
        color: QUOTE_BAR,
      });
      let ty = boxTop - padY - size;
      for (const ln of lines) {
        ctx.page.drawText(ln, {
          x: ctx.marginX + padX + 4,
          y: ty,
          size,
          font: ctx.regular,
          color: MUTED,
        });
        ty -= size * 1.5;
      }
      ctx.y = boxBottom - 8;
      continue;
    }

    // paragraph
    ensureSpace(ctx, 18);
    drawWrapped(ctx, b.text, {
      size: 11,
      lineHeight: 17,
    });
    ctx.y -= 3;
  }
}

export async function exportPdf(
  userId: string,
  meetingId: string,
  includeTranscript: boolean,
): Promise<{ filename: string; bytes: Uint8Array; cjk: boolean; fontPath?: string }> {
  const meeting = await getMeeting(userId, meetingId);
  const minutes = await getMinutes(userId, meetingId);
  if (!minutes?.markdown && !meeting.transcript.length) {
    throw notFound("无可导出内容");
  }

  const pdf = await PDFDocument.create();
  const { regular, bold, cjk, fontPath } = await embedPreferredFont(pdf);
  const page = pdf.addPage();
  const { width, height } = page.getSize();

  const ctx: DrawCtx = {
    pdf,
    page,
    width,
    height,
    y: height - 52,
    marginX: 54,
    marginTop: 52,
    marginBottom: 48,
    regular,
    bold,
    cjk,
    pageNo: 1,
  };

  // Brand header (not YAML dump)
  const brand = sanitizeText(config.appName, cjk);
  ctx.page.drawText(brand, {
    x: ctx.marginX,
    y: ctx.y,
    size: 10,
    font: ctx.regular,
    color: MUTED,
  });
  ctx.y -= 14;
  const exported = sanitizeText(
    `导出时间 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    cjk,
  );
  ctx.page.drawText(exported, {
    x: ctx.marginX,
    y: ctx.y,
    size: 9,
    font: ctx.regular,
    color: MUTED,
  });
  ctx.y -= 10;
  ctx.page.drawLine({
    start: { x: ctx.marginX, y: ctx.y },
    end: { x: ctx.width - ctx.marginX, y: ctx.y },
    thickness: 0.7,
    color: RULE,
  });
  ctx.y -= 18;

  if (!cjk) {
    drawWrapped(ctx, "当前主机未嵌入中文字体，中文可能显示为 ?。请设置 PDF_CJK_FONT 指向 .ttf/.otf。", {
      size: 9,
      color: ACCENT,
      lineHeight: 13,
    });
    ctx.y -= 8;
  }

  // Prefer structured MinutesDoc for a document-like PDF; fall back to MD parse.
  let blocks: PdfBlock[];
  if (minutes && (minutes.topic || minutes.topics?.length || minutes.goal)) {
    blocks = minutesDocToBlocks(minutes, meeting.title);
  } else if (minutes?.markdown) {
    blocks = markdownToPdfBlocks(minutes.markdown);
  } else {
    blocks = [{ kind: "h1", text: meeting.title || "会议纪要" }, { kind: "p", text: "尚未生成纪要" }];
  }

  if (includeTranscript && meeting.transcript.length) {
    blocks = [
      ...blocks,
      ...transcriptToBlocks(
        meeting.transcript.map((t) => ({
          speaker: t.speaker,
          startMs: t.startMs,
          text: t.text,
        })),
      ),
    ];
  }

  drawBlocks(ctx, blocks);
  drawPageFooter(ctx);

  const bytes = await pdf.save();
  const safe = meeting.title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
  return {
    filename: `${safe || "meeting"}.pdf`,
    bytes,
    cjk,
    fontPath,
  };
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
