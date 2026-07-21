import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeVisualBoard } from "./services/visualBoard.js";

describe("visual board normalize", () => {
  it("accepts a valid briefing-shaped board", () => {
    const board = normalizeVisualBoard(
      {
        version: 1,
        intent: "briefing",
        recipeId: "briefing.v1",
        title: "实习与毕业安排",
        subtitle: "说明实习要求与关键节点",
        sections: [
          {
            type: "stage_row",
            heading: "实习核心要求",
            items: [
              { title: "时间", badge: "节点", body: "不少于3个月", tone: "teal", icon: "clock" },
              { title: "材料", badge: "规范", body: "手册与记录", tone: "amber", icon: "doc" },
              { title: "形式", badge: "说明", body: "分散或集中", tone: "purple", icon: "people" },
            ],
          },
          {
            type: "compare_cards",
            heading: "注意事项",
            cards: [
              {
                title: "合规",
                tone: "success",
                badge: "要求",
                bullets: ["正式注册单位", "对口专业"],
              },
              {
                title: "风险",
                tone: "warning",
                badge: "提示",
                bullets: ["不足三月不及格"],
              },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "跟大队步伐，主动沟通导师",
          },
        ],
      },
      { model: "test-model", fallbackTitle: "会" },
    );
    assert.equal(board.version, 1);
    assert.equal(board.source, "llm");
    assert.equal(board.intent, "briefing");
    assert.equal(board.sections.length, 3);
    assert.equal(board.sections[0]?.type, "stage_row");
  });

  it("drops unknown types and strips empty sections", () => {
    const board = normalizeVisualBoard(
      {
        intent: "nope",
        sections: [
          { type: "mindmap", nodes: [] },
          {
            type: "card_grid",
            heading: "节点",
            columns: 4,
            cards: [
              { title: "A", bullets: ["1"] },
              { title: "B", bullets: ["2"] },
            ],
          },
        ],
      },
      { model: "m", fallbackTitle: "T" },
    );
    assert.equal(board.intent, "general");
    assert.equal(board.sections.length, 1);
    assert.equal(board.sections[0]?.type, "card_grid");
  });

  it("rejects board with no usable sections", () => {
    assert.throws(
      () =>
        normalizeVisualBoard(
          { intent: "general", sections: [{ type: "stage_row", heading: "x", items: [] }] },
          { model: "m", fallbackTitle: "T" },
        ),
      /可用的图解/,
    );
  });
});
