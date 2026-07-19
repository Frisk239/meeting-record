# 合码 — 默认 main 直推（单人简化）

> 真源配套：`AGENTS.md` · [workflow.md](./workflow.md) · [ADR 0008](../adr/0008-solo-mainline-delivery.md)  
> 取代早期「仅 feat + 人合 main」默认（ADR 0001 合码条款已被 0008 部分覆盖）。

## 默认路径（人授权 · 单人）

```
Slice Owner 做绿（含关刀证据）
  → git commit on main
  → git push origin main
```

| 规则 | 默认 |
|---|---|
| 默认分支 | `main` |
| Agent 可 | 在 **main** 上开发、提交、推送 |
| 可选 | `feat/<slug>`：大实验 / 并行 / 需要隔离时 |
| Issue / PR | **非**开工或合码前置；PR 可选 |

## 关刀仍要的证据

| 信号 | 要求 |
|---|---|
| 相关检查 | typecheck / tests（有则绿） |
| 路径 | Must 用户路径可复核记录 |
| progress | `docs/progress/<slug>-impl-*.md` |

## 规格放哪

| 产物 | 位置 |
|---|---|
| MVP PRD | `.scratch/meeting-record-mvp/spec.md` |
| 产品设计 | `docs/design/` |
| 决策 | `docs/adr/` |
| GitHub Issue | **可选**；修好 gh 后若想公示再发 |

## 勿提交

密钥、本地 DB 若含隐私、巨型模型权重、`.playwright-cli/`、`node_modules/`、构建产物。以根目录 `.gitignore` 为准。
