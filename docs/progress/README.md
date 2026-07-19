# 切片进度（intake / closeout）

Slice Owner 关刀与跨刀验收写在这里。

| 命名 | 用途 |
|---|---|
| `<slug>-impl-1.md` | 实现/关刀证据（可递增 `-impl-2`） |
| `<slug>-intake.md` | 下一 Owner 对上一刀的 verdict |
| `<slug>-review.md` | 可选 code-review 笔记 |

`app/` 落地后，可将本目录约定迁到 `app/.progress/`，并同步改 `AGENTS.md` 与 `docs/agents/workflow.md`。

当前尚无**产品**切片 closeout。文档阶段 S0（选型 + Claude DESIGN）已记在 `docs/design/slices.md`，不要求本目录 intake。
