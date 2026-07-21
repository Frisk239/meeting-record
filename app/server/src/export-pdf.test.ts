import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { embedPreferredFont, listCjkFontCandidates } from "./services/export.js";

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
