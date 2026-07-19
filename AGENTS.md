# AGENTS.md — 项目宪法

> 这是**会议纪要产品**的工程工作区。改任何东西前，先读这份。  
> 产品细节随 `/grill-with-docs` 与切片推进写入 `CONTEXT.md`、`docs/design/`、`docs/adr/`——**以落盘文档为准，不以聊天记忆为准。**

## 这是什么

把会议音视频变成**可阅读的转写**与 **LLM 辅助的可编辑纪要**的软件（当前阶段不强制说话人分离）。

**产品一句话：** 见 [`CONTEXT.md`](./CONTEXT.md) 与 [`docs/design/vision.md`](./docs/design/vision.md)。

**工程状态：** 文档 / 选型 / Claude DESIGN 已落地；**S0b 账号与设置已在 `app/` 真栈落地**（见 `docs/progress/`）。

## 目录地图

| 路径 | 作用 | 改动规则 |
|---|---|---|
| `AGENTS.md` | **项目宪法**（本文） | 工程模式 / 硬约束变更时更新 |
| `CONTEXT.md` | **领域词汇 + 当前方位** | grill / domain-modeling / 关刀时维护 |
| `docs/design/` | 产品设计真源（愿景、架构、路线、切片、**DESIGN.md**） | 改产品方向前必读 |
| `docs/design/DESIGN.md` | **UI 视觉真源（Claude）** | 实现前端必读；见 ADR 0002 |
| `docs/design/reference/` | 上游阅读笔记 + catalog | 只改本仓写的 md；见 `reference/README.md` |
| `docs/design/reference/repos/` | 上游 **git clone（只读）** | **绝不改上游代码**；目录默认 gitignore |
| `docs/agents/` | Skills 配置 + Slice Owner 工作流 | setup / 手改均可 |
| `docs/adr/` | 难逆决策 | 满足 ADR 三条件才写 |
| `docs/progress/` | 切片 intake / closeout 证据 | Owner 关刀与跨刀必写；`app/` 落地后可迁 `app/.progress/` |
| `.scratch/` | 本地 spec / tickets 草稿 | 一 feature 一目录；正式工单以 GitHub Issues 为准 |
| `app/web` · `app/server` | 应用代码（Vite/React · Hono） | **Slice Owner**；默认 **main**（ADR 0008） |

## 工程模式（最高优先级）

> **默认：Slice Owner（一厚切片一会话）。** 不使用 superpowers，不使用计划者/执行者双角色。  
> 决策：[docs/adr/0001-slice-owner-workflow.md](./docs/adr/0001-slice-owner-workflow.md) · 细则：[docs/agents/workflow.md](./docs/agents/workflow.md)

| 维度 | 决定什么 | 落地 |
|---|---|---|
| **垂直切片** | 做什么、多厚 | 一刀端到端可演示；默认同会话做完 |
| **Slice Owner** | 从缺口到做绿 | intake → short-align → implement → 证据 → push feat → 关刀 |
| **调研** | 对齐参考实现 | 默认可主动；子代理/`/research`；窗内只留摘要 |
| **偏见隔离** | 审查 | 可选 `/code-review`；**默认 main 直推**（ADR 0008） |
| **人** | 北星、禁区、喊停 | 不必须每刀满血 grill；不必须开 Issue |

### 硬顺序（跨刀）

1. Discover 本仓约定  
2. **Intake 上一刀**（通过 / 有条件通过 / 需返工）  
3. **Short-align** 下一厚切片（人确认）  
4. **Implement**（默认 **main**）  
5. **Commit / push main** · **Closeout** · 更新 `CONTEXT.md`  

续作同刀：`/handoff`，不换主题。技能入口：`/slice-owner`。

### Grill 深度

| 情况 | 做法 |
|---|---|
| 路径清晰 | 短对齐 → implement |
| 领域词 / 难逆边界 | `/grill-with-docs` + ADR |
| 参考实现细节 | `/research` 或子代理 |

### 合码

见 [docs/agents/merge.md](./docs/agents/merge.md)：**默认允许 main 直推**（[ADR 0008](./docs/adr/0008-solo-mainline-delivery.md)）。

## 决策原则：先查参考再拍板

遇到路线选择，优先：

1. `docs/design/` 已有结论与 ADR  
2. `docs/design/reference/catalog.md` + 分层摘要（product / asr / ui）  
3. `docs/design/reference/repos/` 源码（需要时）与 `reference/deep/` 深读  
4. 外部一手资料（`/research`）  
5. 再下结论，并写清「参考了什么 / 与本仓差异 / 已选哪项」

禁止在实现窗粘贴大段上游源码；**禁止修改 `reference/repos/` 上游**。

## 已锁定的产品/部署前提（2026-07-19）

| 主题 | 真源 |
|---|---|
| CPU ASR + LLM · 单人 · 无 GPU · **4C4G** | [ADR 0003](./docs/adr/0003-cpu-asr-and-llm-summary.md) |
| **说话人 Diarization = P0**（FunASR CAM++ CPU） | [ADR 0004](./docs/adr/0004-speaker-diarization-p0-cpu.md) |
| UI = Claude DESIGN.md | [ADR 0002](./docs/adr/0002-ui-design-claude.md) · [DESIGN.md](./docs/design/DESIGN.md) |
| Slice Owner 工程流 | [ADR 0001](./docs/adr/0001-slice-owner-workflow.md) |
| 单人 main 直推 · Issue 非必选 | [ADR 0008](./docs/adr/0008-solo-mainline-delivery.md) |

摘要：

- **单人** · **无 GPU** · **4 核 4G** · 串行 Job  
- **形态：自托管 Web**（响应式兼顾手机/电脑）  
- **简单注册/登录**（是否开放注册仅**服务端配置**，禁止前端暴露 ALLOW_REGISTER）+ API 鉴权 + **按用户隔离防越权**  
- **LLM：OpenAI Chat Completions 兼容**（base_url / model_id / api_key；env 或前端设置）  
- **采集 P0：现场浏览器录音**（点开始 / 长按确认结束 / 自动上传；**默认最长 60min 可配**）+ 文件上传/追加  
- **CPU ASR + Speaker 标签**（FunASR/SenseVoice + VAD + CAM++）  
- **转写成功后自动 Minutes**（智在式结构可参考；视觉 Claude）  
- 详情 **纪要·原文·外脑(按需)**；**追问=纪要子页**；**无探索**；外脑不自动生成  
- **导出 P0：Markdown + PDF**  
- **LLM**（优先外部 API；吃转写文本）  
- **Context Packer**（每次调用带本场记忆；重要全量、次要压缩 — ADR 0005）  
- **Store：本地磁盘 + SQLite**  
- **显示名默认 Meeting Record**（`APP_NAME` 可配）  
- **TypeScript 全栈**；**Python 仅必要时**（如 FunASR ASR 旁路）— ADR 0009  
- **Vite + React · Hono** — ADR 0010  
- **Drizzle + better-sqlite3** — ADR 0011  
- **pnpm** — ADR 0012  
- MOSS / pyannote 重流水线 **非默认**  
- UI **只认** `docs/design/DESIGN.md`  

## 不可破坏的约束

- ❌ 不使用 superpowers 双角色 / `docs/superpowers/` 真源树  
- ❌ 不在 `docs/design/reference/repos/` 内修改上游代码  
- ❌ 密钥与隐私进 git；无证据宣称完成  
- ❌ 无新 ADR 时推翻 CPU/LLM 默认或另起一套 UI token  
- ✅ 垂直厚切片；关刀必有可复核证据  
- ✅ 术语以 `CONTEXT.md` 为准  
- ✅ 默认算力：CPU 批处理转写，非 GPU 实时大模型  


## 票与进度

| 产物 | 路径 |
|---|---|
| PRD / 规格 | **`.scratch/.../spec.md` + `docs/design/`**（Issue **可选**） |
| 本地草稿票 | `.scratch/<slug>/` |
| Closeout / intake | `docs/progress/` |
| 方位 | `CONTEXT.md` |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, labels match role names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### 工作流路由

idea→ship 与本仓适配：[`docs/agents/workflow.md`](./docs/agents/workflow.md)。不确定用哪个 skill → **`/ask-matt`**。跨刀执行 → **`/slice-owner`**。
