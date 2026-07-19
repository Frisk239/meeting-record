# 工作流 — Slice Owner（本仓适配）

> 技能总路由：`/ask-matt`。  
> 交接：[slice-handoff.md](./slice-handoff.md) · 合码：[merge.md](./merge.md) · 决策：[ADR 0001](../adr/0001-slice-owner-workflow.md)。

## 模型

```
人：北星 / 禁区 / 合并 main / 随时喊停
   │
   ▼
┌──────────────────────────────────────────────┐
│  Slice Owner（一会话一厚切片）                  │
│  1) intake 上一刀                               │
│  2) short-align 下一刀（领域硬才满血 grill）     │
│  3) 调研外包（/research 或子代理）→ 只留摘要     │
│  4) implement 厚路径（/implement · /tdd）        │
│  5) 证据 → commit/push **main**（默认）→ 关刀   │
└──────────────────────────────────────────────┘
```

| 角色 | 干什么 |
|---|---|
| **Slice Owner** | intake → 对齐 → 实现 → 自测证据 → **commit/push main** → 关刀 |
| **调研** | 默认可主动；读 `docs/design/reference/`；窗内只留摘要 |
| **人** | 定北星与禁区；可否决/改向；可要求改回 feat 隔离 |
| **CI / code-review** | 可选；不挡 main 直推 |

## 与 multi-agent / 早期本仓草案

| 点 | 说明 |
|---|---|
| 合码 | **与 multi-agent 后期一致：main 直推**（[ADR 0008](../adr/0008-solo-mainline-delivery.md)） |
| Issue | **非必选**；PRD 可落在 `.scratch/.../spec.md` |
| 计划者/执行者 | 不采用 |
| superpowers | 不建 |
| 进度 | `docs/progress/`（有 `app/` 后再评估） |

## 北星（迭代约束）

**最终任务：** 个人日用会议纪要——**CPU 转写 + LLM 纪要**（见 `vision.md` · `CONTEXT.md` · ADR 0003）。

| 约束 | 要求 |
|---|---|
| **垂直切片** | 一刀 = 一条可演示用户路径；禁止「只交 API 空壳」当整刀 |
| **关刀自测** | 与本刀相关的路径记录进 progress；有 UI 后优先 Playwright |
| **调研驱动** | 先查 `docs/design/reference/`；结论写 progress，不灌原文 |
| **UI** | 只遵循 [`docs/design/DESIGN.md`](../design/DESIGN.md)（Claude，ADR 0002） |
| **安全** | 注册/登录；业务 API 鉴权；按用户隔离防越权；注册是否开放仅服务端配置 |
| **LLM** | 仅 Chat Completions 兼容；base_url/model/key（env 或设置页） |
| **算力** | 无 GPU · **4C4G**；转写**串行**；**Diarization P0**（ADR 0004）；非 MOSS/pyannote 默认 |
| **合码** | [merge.md](./merge.md)：**默认 main 直推** |
| **规格** | 仓库 Markdown / `.scratch`；GitHub Issue **可选** |
| **文档** | 术语 → `CONTEXT.md`；难逆 → `docs/adr/`；结构 → `docs/design/` |

## 硬顺序（跨刀）

1. Discover 本仓约定（`AGENTS.md` · 本文件 · merge · CONTEXT）  
2. intake 上一刀 → 通过 / 有条件通过 / 需返工  
3. short-align 下一厚切片（人确认 Must / Out）  
4. implement（默认 **main**）→ 证据 → **commit/push main**  
5. closeout + 更新 `CONTEXT.md` 方位  

**续作同刀（窗满）：** `/handoff`，不换主题。

## Grill 深度

| 情况 | 做法 |
|---|---|
| 主题清晰、路径已知 | **短对齐**；直接 `/implement` |
| 改领域词 / 难逆边界 | `/grill-with-docs` + ADR |
| 对齐参考实现细节 | `/research` 或子代理；Owner 只吃摘要 |

## 票与进度写在哪

| 产物 | 路径 |
|---|---|
| GitHub issue / PRD | `gh issue …`（见 issue-tracker.md） |
| 本地草稿 spec | `.scratch/<slug>/spec.md` |
| 本地草稿 tickets | `.scratch/<slug>/issues/0N-*.md` |
| Closeout / intake | `docs/progress/<slug>-impl-*.md` / `<slug>-intake.md` |
| 方位 | `CONTEXT.md` |

## 启动提示词（跨刀）

```markdown
你是本仓 Slice Owner（见 docs/agents/workflow.md · ADR 0001）。
- 先 intake 上一刀，再 short-align 下一厚切片
- 默认可在 main 开发并 push（ADR 0008）；大实验可用 feat/*
- 调研读 docs/design/reference；窗内只留摘要
- UI 跟 docs/design/DESIGN.md；规格见 .scratch 与 docs/design
- 进度写 docs/progress/ 与 CONTEXT.md
```
