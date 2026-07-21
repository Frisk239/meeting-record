/** Lightweight Markdown → React (no deps). Also renders full HTML docs (insights). */
import { useMemo, type ReactNode } from "react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(text: string): ReactNode[] {
  // bold **x** and `code`
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(escapeHtml(text.slice(last, m.index)));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{escapeHtml(token.slice(2, -2))}</strong>);
    } else {
      parts.push(
        <code key={key++} className="md-code">
          {escapeHtml(token.slice(1, -1))}
        </code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(escapeHtml(text.slice(last)));
  // Return as dangerously-free text nodes mixed with elements — use span with text
  return parts.map((p, i) =>
    typeof p === "string" ? <span key={`t${i}`} dangerouslySetInnerHTML={{ __html: p }} /> : p,
  );
}

function stripFence(md: string): string {
  let s = md.trim();
  // Models sometimes wrap whole doc in ```html or ```markdown
  const fence = s.match(/^```(?:html|markdown|md|htm)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fence) s = fence[1].trim();
  // Opening fence only (truncated / missing closer)
  const openOnly = s.match(/^```(?:html|markdown|md|htm)?\s*\n([\s\S]*)$/i);
  if (openOnly && !s.trimEnd().endsWith("```")) {
    const body = openOnly[1]!.replace(/\n```\s*$/, "").trim();
    if (body) s = body;
  }
  return s;
}

/** True when content is a full HTML page / fragment (not markdown). */
export function looksLikeHtmlDocument(source: string): boolean {
  const s = stripFence(source || "").trim();
  if (!s) return false;
  if (/^<!DOCTYPE\s+html/i.test(s)) return true;
  if (/^<html[\s>]/i.test(s)) return true;
  // Style-heavy fragments common from LLM “外脑” output
  if (/<style[\s>]/i.test(s) && /<\/style>/i.test(s) && /<(?:h[1-6]|ul|ol|div|section|p)\b/i.test(s)) {
    return true;
  }
  if (/<(?:body|head)\b/i.test(s) && /<\/(?:body|html)>/i.test(s)) return true;
  return false;
}

function normalizeHtmlDocument(source: string): string {
  const raw = stripFence(source);
  // Already a full document
  if (/<!DOCTYPE\s+html/i.test(raw) || /<html[\s>]/i.test(raw)) {
    return raw;
  }
  // Fragment with styles — wrap so iframe paints correctly
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${raw}</body></html>`;
}

function HtmlDocView({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => normalizeHtmlDocument(source), [source]);
  return (
    <div className={`html-doc-view ${className}`.trim()}>
      <iframe
        className="html-doc-frame"
        title="AI 外脑"
        sandbox=""
        // No scripts; same-origin not granted — pure display of model HTML/CSS
        srcDoc={html}
        loading="lazy"
      />
    </div>
  );
}

function MarkdownBlocks({ source, className = "" }: { source: string; className?: string }) {
  const md = stripFence(source || "");
  if (!md) return null;

  const lines = md.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // fenced code
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // closing
      blocks.push(
        <pre key={k++} className="md-pre">
          <code data-lang={lang || undefined}>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // blank
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // headings
    const hm = line.match(/^(#{1,3})\s+(.*)$/);
    if (hm) {
      const level = hm[1]!.length;
      const text = hm[2]!;
      const Tag = (level === 1 ? "h3" : level === 2 ? "h4" : "h5") as "h3" | "h4" | "h5";
      blocks.push(
        <Tag key={k++} className={`md-h md-h${level}`}>
          {inlineFormat(text)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // quote
    if (line.trim().startsWith(">")) {
      const qs: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        qs.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={k++} className="md-quote">
          {qs.map((q, qi) => (
            <p key={qi}>{inlineFormat(q)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // list
    if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      while (
        i < lines.length &&
        (/^\s*[-*•]\s+/.test(lines[i] ?? "") || /^\s*\d+[.)]\s+/.test(lines[i] ?? ""))
      ) {
        items.push(
          (lines[i] ?? "")
            .replace(/^\s*[-*•]\s+/, "")
            .replace(/^\s*\d+[.)]\s+/, ""),
        );
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={k++} className="md-list">
          {items.map((it, ii) => (
            <li key={ii}>{inlineFormat(it)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // paragraph (merge consecutive plain lines)
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !(lines[i] ?? "").trim().startsWith("#") &&
      !(lines[i] ?? "").trim().startsWith(">") &&
      !(lines[i] ?? "").trim().startsWith("```") &&
      !/^\s*[-*•]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+[.)]\s+/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push(
      <p key={k++} className="md-p">
        {inlineFormat(para.join("\n"))}
      </p>,
    );
  }

  return <div className={`md-view ${className}`.trim()}>{blocks}</div>;
}

export function MarkdownView({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  if (!source?.trim()) return null;
  if (looksLikeHtmlDocument(source)) {
    return <HtmlDocView source={source} className={className} />;
  }
  return <MarkdownBlocks source={source} className={className} />;
}
