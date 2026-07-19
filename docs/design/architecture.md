# 架构

> **状态：** TS 全栈 + Vite/React + Hono + Drizzle/SQLite + **pnpm** 已定；**monorepo 目录命名** 实现脚手架时定。  
> **ADR：** [0008 main 直推](../adr/0008-solo-mainline-delivery.md) · [0007 IA](../adr/0007-detail-ia-minutes-transcript-insights.md) · [0006 Auth/LLM](../adr/0006-auth-and-openai-chat-completions.md) · [0005 Context](../adr/0005-llm-context-memory-and-compression.md) · [0004–0001](../adr/)

## 问题边界

在 **无 GPU、单人、4 核 4G** 上，把会议音视频变成 **带 Speaker 的转写** 与 **可编辑的 LLM 纪要**。

## 逻辑模块

```
[现场麦录音 | 文件上传 | 追加录音]
        → 上传（鉴权 API）
        → [队列 串行] → [CPU: ASR + VAD + CAM++] → [Transcript 原文]
        → 成功后自动 → [Context Packer] → [LLM] → [Minutes]
        → 用户从纪要右下角进追问子页 → [Context Packer] → [LLM] → [Q&A]
        → 用户显式点外脑生成（可选）→ [Context Packer] → [LLM] → [Insights]
        → [编辑 UI / 导出 MD·PDF]
        （无探索模块）
```

| 模块 | 职责 | 参考 |
|---|---|---|
| App / API | **Web**：上传、Job 状态、读转写/纪要（响应式） | zabt-ai 拓扑（裁剪）· DESIGN.md |
| In-Browser Capture | 麦权申请；点开始 / **长按确认结束**；**默认最长 60min（可配）**；编码后 **自动上传** | 需 HTTPS（或 localhost） |
| Branding | **`APP_NAME`**，默认 `Meeting Record` | 登录页/标题/导出页眉 |
| Auth | 注册/登录；会话或 JWT；密码哈希；**`ALLOW_REGISTER` 仅服务端 env/配置** | 前端不暴露该开关 |
| LLM Config | Chat Completions：`base_url` + `model` + `api_key`；env/配置文件默认 + **用户设置页** | 密钥不可回显明文（可掩码） |
| Access / API 鉴权 | 业务 API 统一鉴权；**按 user_id 资源隔离**防越权 | 实现细节首刀再钉 |
| Queue | 同时仅 1 个 Transcription Job | 同机队列 |
| ASR+Diarize Worker | **Python 旁路（必要时）**：FunASR 轻量 ASR + fsmn-vad + cam++，CPU；由 TS 投递 Job | ADR 0004 · **0009** · `reference/asr.md` |
| **Context Packer** | **TS**：组装 LLM 上下文：**Pinned 全量** + 纪要 + 对话摘要 + 转写片段/Digest | **ADR 0005** |
| LLM Gateway | **TS**：仅 OpenAI Chat Completions 兼容 HTTP；读用户或部署配置 | 不默认 Ollama 进程 |

| UI | 列表、录音控件、Speaker 转写、纪要、追问 | [DESIGN.md](./DESIGN.md) |
| Export | **Markdown + PDF（P0）** | 实现库首刀再钉 |
| Store | **本地磁盘** + **SQLite**（Drizzle / better-sqlite3） | ADR 0011 |

### Context Packer（摘要）

```
预算 max_tokens
  L0 系统指令（固定）
  L1 Pinned Facts     ← 永不被摘要替换（待办/争议/纪要头/当前问题）
  L2 Minutes 正文     ← 超限先砍时间轴等长段
  L3 Q&A 近 N 轮全文 + 更早滚动摘要
  L4 Transcript 相关片段全量 + Digest 地图（非整场默认全塞）
```

详见 [ADR 0005](../adr/0005-llm-context-memory-and-compression.md)。

## 部署草图（4C4G）

| 进程 | 资源要点 |
|---|---|
| Web/API | 尽量小；与 Worker 同机 |
| Worker | 峰值 RAM 大户；**禁止并行第二 Job** |
| LLM | **优先 API**；本机 Ollama 仅错峰、小模型 |

## 关键决策索引

| 决策 | 状态 | 记录 |
|---|---|---|
| Slice Owner 工程流 | Accepted | ADR 0001 |
| UI = Claude DESIGN | Accepted | ADR 0002 · `DESIGN.md` |
| CPU ASR + LLM 总结 | Accepted | ADR 0003 |
| Diarization P0 · CAM++ CPU | Accepted | ADR 0004 |
| LLM 上下文记忆 + 分层压缩 | Accepted | ADR 0005 |
| Store = 磁盘 + SQLite | Accepted | grill 2026-07-19 |
| Auth + Chat Completions 配置 | Accepted | ADR 0006 |
| 详情 IA：纪要·原文·外脑按需·追问子页 | Accepted | ADR 0007 |
| TS 全栈 + Python ASR 旁路 | Accepted | ADR 0009 |
| Vite React + Hono | Accepted | ADR 0010 |
| Drizzle + better-sqlite3 | Accepted | ADR 0011 |
| 包管理器 pnpm | Accepted | ADR 0012 |
| monorepo 目录命名 | 待定 | 实现脚手架时定（如 `app/web` + `app/server`） |

## 技术栈（部分锁定）

| 层 | 选择 | 状态 |
|---|---|---|
| 算力 | 无 GPU · **4C4G** · 单人 · 串行 | 锁定 |
| ASR + Speaker | FunASR + CAM++；whisper 备选 ASR | 锁定（ADR 0004） |
| LLM | OpenAI **Chat Completions** 兼容（base_url/model/key） | 锁定 |
| 用户 | 注册 + 密码登录；按用户隔离数据 | 锁定（修订原「仅口令门禁」） |
| UI token | Claude（本仓 DESIGN.md） | 锁定 |
| 持久化 | 本地磁盘 + SQLite | 锁定 |
| ORM | **Drizzle + better-sqlite3** | 锁定 ADR 0011 |
| 应用全栈 | **TypeScript**（UI + API + 编排 + Packer + 导出） | 锁定 ADR 0009 |
| 前端 | **Vite + React** | 锁定 ADR 0010 |
| API | **Hono**（Node + TS） | 锁定 ADR 0010 |
| ASR 旁路 | **Python 仅当必要**（FunASR 等）；非第二业务后端 | 锁定 ADR 0009 |
| 包管理 | **pnpm** | 锁定 ADR 0012 |
