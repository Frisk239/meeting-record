import fs from "node:fs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { config } from "../config.js";
import { notFound } from "../lib/errors.js";
import { getMeeting } from "./meetings.js";
import { getMinutes } from "./minutes.js";

const CJK_FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\msyh.ttf",
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\simsun.ttc",
  "C:\\Windows\\Fonts\\simfang.ttf",
  "/System/Library/Fonts/PingFang.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
];

async function embedPreferredFont(
  pdf: PDFDocument,
): Promise<{ regular: PDFFont; bold: PDFFont; cjk: boolean }> {
  for (const p of CJK_FONT_CANDIDATES) {
    try {
      if (!fs.existsSync(p)) continue;
      // pdf-lib only embeds TTF/OTF cleanly; skip .ttc collection files
      if (p.toLowerCase().endsWith(".ttc")) continue;
      const bytes = fs.readFileSync(p);
      const regular = await pdf.embedFont(bytes, { subset: true });
      return { regular, bold: regular, cjk: true };
    } catch {
      // try next
    }
  }
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, cjk: false };
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

export async function exportPdf(
  userId: string,
  meetingId: string,
  includeTranscript: boolean,
): Promise<{ filename: string; bytes: Uint8Array }> {
  const md = await exportMarkdown(userId, meetingId, includeTranscript);
  const pdf = await PDFDocument.create();
  const { regular, bold, cjk } = await embedPreferredFont(pdf);
  let page = pdf.addPage();
  const margin = 50;
  let { width, height } = page.getSize();
  let y = height - margin;
  const size = 11;
  const lineHeight = 16;

  const sanitize = (text: string) =>
    cjk ? text : text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");

  const writeLine = (text: string, isBold = false) => {
    const f = isBold ? bold : regular;
    const safe = sanitize(text);
    const maxWidth = width - margin * 2;
    // character-wise wrap (works better for CJK than word wrap)
    let line = "";
    const flush = () => {
      if (!line) return;
      if (y < margin + lineHeight) {
        page = pdf.addPage();
        ({ width, height } = page.getSize());
        y = height - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth,
      });
      y -= lineHeight;
      line = "";
    };
    for (const ch of safe) {
      const trial = line + ch;
      if (f.widthOfTextAtSize(trial, size) > maxWidth && line) flush();
      line += ch;
    }
    flush();
  };

  writeLine(config.appName, true);
  if (!cjk) {
    writeLine(
      "(PDF font has no CJK glyphs on this host; use Markdown export for full Chinese text.)",
    );
  }
  y -= 6;
  for (const raw of md.content.split("\n")) {
    const t = raw.trimEnd();
    if (t.startsWith("# ")) writeLine(t.slice(2), true);
    else if (t.startsWith("## ")) writeLine(t.slice(3), true);
    else if (t.startsWith("### ")) writeLine(t.slice(4), true);
    else if (t.startsWith("- ")) writeLine(`* ${t.slice(2)}`);
    else if (t.startsWith("> ")) writeLine(`| ${t.slice(2)}`);
    else if (t === "---") y -= 8;
    else writeLine(t || " ");
  }

  const bytes = await pdf.save();
  const safeName = md.filename.replace(/\.md$/i, ".pdf");
  return { filename: safeName, bytes };
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
