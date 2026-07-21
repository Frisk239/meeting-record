import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  embedPreferredFont,
  insightsSourceToMarkdown,
  listCjkFontCandidates,
  markdownToPdfBlocks,
  stripMdInline,
  stripYamlFrontmatter,
} from "./services/export.js";

function hasSystemCjkTtf(): boolean {
  return listCjkFontCandidates().some((p) => {
    const lower = p.toLowerCase();
    if (lower.endsWith(".ttc") || lower.endsWith(".otc")) return false;
    return fs.existsSync(p);
  });
}

describe("pdf export CJK fonts", () => {
  it("registers fontkit and embeds a system CJK TTF when available", async () => {
    if (!hasSystemCjkTtf()) {
      // CI without Chinese fonts: skip hard assert but still prove Helvetica path works
      const pdf = await PDFDocument.create();
      const emb = await embedPreferredFont(pdf);
      assert.equal(emb.cjk, false);
      return;
    }

    const pdf = await PDFDocument.create();
    const emb = await embedPreferredFont(pdf);
    assert.equal(emb.cjk, true, "expected a system CJK TTF to embed");
    assert.ok(emb.fontPath, "fontPath should be recorded");

    const sample = "会议纪要：实习与毕业安排。美萍老师";
    const page = pdf.addPage();
    // Must not throw WinAnsi / missing glyph errors
    page.drawText(sample, {
      x: 50,
      y: 700,
      size: 14,
      font: emb.regular,
    });
    const width = emb.regular.widthOfTextAtSize(sample, 14);
    assert.ok(width > 50, `CJK text width too small: ${width}`);

    const bytes = await pdf.save();
    assert.ok(bytes.byteLength > 1000);
    const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    assert.equal(head, "%PDF");
  });

  it("does not sanitize Chinese when CJK font embeds", async () => {
    if (!hasSystemCjkTtf()) return;
    const pdf = await PDFDocument.create();
    const emb = await embedPreferredFont(pdf);
    assert.equal(emb.cjk, true);
    // Regression: old code fell back to Helvetica and replaced CJK with "?"
    const sample = "关键议题";
    assert.notEqual(
      emb.regular.widthOfTextAtSize("????", 12),
      emb.regular.widthOfTextAtSize(sample, 12),
    );
  });
});

describe("pdf layout helpers", () => {
  it("strips YAML frontmatter and markdown markers", () => {
    const md = `---
title: "demo"
app: "Meeting Record"
exportedAt: "2026-07-21T00:00:00.000Z"
---

# 2023级实习与毕业安排

## 纪要头
- **主题：** 2023级实习与毕业安排
- **时间：** 2026-07-21
`;
    const body = stripYamlFrontmatter(md);
    assert.equal(body.startsWith("# "), true, `body starts: ${JSON.stringify(body.slice(0, 40))}`);
    assert.equal(body.includes("exportedAt"), false);
    assert.equal(stripMdInline("**主题：** 实习"), "主题： 实习");
  });

  it("parses markdown into readable blocks without raw markers", () => {
    const blocks = markdownToPdfBlocks(`# 标题

## 关键议题
### 1. 实习机会
- **第一波** 招聘
- 第二点

> 争议：时间是否够

---
`);
    const kinds = blocks.map((b) => b.kind);
    assert.ok(kinds.includes("h1"));
    assert.ok(kinds.includes("h2"));
    assert.ok(kinds.includes("h3"));
    assert.ok(kinds.includes("li"));
    assert.ok(kinds.includes("quote"));
    const h1 = blocks.find((b) => b.kind === "h1");
    assert.equal(h1 && h1.kind === "h1" ? h1.text : "", "标题");
    const li = blocks.find((b) => b.kind === "li");
    assert.ok(li && li.kind === "li");
    if (li && li.kind === "li") {
      assert.equal(li.text.includes("**"), false);
      assert.ok(li.text.includes("第一波"));
    }
  });

  it("converts HTML insights into plain markdown-ish text", () => {
    const html = `<!DOCTYPE html>
<html><head><style>body{color:red}</style></head>
<body>
<h2>风险</h2>
<ul><li>进度风险</li><li>质量风险</li></ul>
<p>补充说明</p>
</body></html>`;
    const md = insightsSourceToMarkdown(html);
    assert.equal(md.includes("<style"), false);
    assert.equal(md.includes("DOCTYPE"), false);
    assert.ok(md.includes("风险"));
    assert.ok(md.includes("进度风险"));
    assert.ok(md.includes("补充说明"));
  });
});
