# 参考项目

本目录 = **对上游项目的阅读笔记** + **本地 clone**。  
产品自己的设计真源在上一级 [`../`](../)（vision / architecture / slices），**不要**和上游源码混写。

## 分析文档

### 高层摘要（快速了解）

| 文件 | 对应层 | 主要 repo |
|---|---|---|
| [catalog.md](catalog.md) | 全景 | 矩阵 + 与本仓方案关系 |
| [product.md](product.md) | 产品壳 | meetily、zabt-ai、anarlog |
| [asr.md](asr.md) | 转写引擎 | FunASR、SenseVoice、whisper.cpp、faster-whisper |
| [ui.md](ui.md) | 视觉（样本库说明） | awesome-design-md；**真源是 [`../DESIGN.md`](../DESIGN.md)** |

### 源码深读（动手前写，带 file:line）

| 路径 | 说明 |
|---|---|
| [deep/](deep/) | 按需增补；未写之前先读上游 README + catalog |

### 综合 / 调研

| 文件 | 回答什么 |
|---|---|
| [../research/2026-07-19-meeting-minutes-landscape.md](../research/2026-07-19-meeting-minutes-landscape.md) | 功能点 · 开源 · 算力 |
| [../research/2026-07-19-stack-decision-cpu-llm.md](../research/2026-07-19-stack-decision-cpu-llm.md) | **已锁定：单人 CPU ASR + LLM 总结** |

## 源码 clone（只读）

路径：[`repos/`](repos/) — 每个子目录是**独立 git 仓库**。

| 规则 | |
|---|---|
| ❌ | **绝不在 `repos/` 内改上游代码**（改需求开本仓 `app/` / 自己的包） |
| ❌ | 默认 **不提交** `repos/*` 进本仓 git（见根 `.gitignore`） |
| ✅ | 笔记、catalog、deep 读后写在 `reference/*.md` / `deep/` |
| ✅ | 更新 clone：`cd repos/<name> && git pull`（或按需 `fetch`） |

| 目录 | 分层 | 本仓用途 |
|---|---|---|
| [repos/meetily/](repos/meetily/) | 产品 | 本地会议助手 UX / 转写+总结编排 |
| [repos/zabt-ai/](repos/zabt-ai/) | 产品·服务端 | Web + 队列 + Worker（CPU compose 可参考） |
| [repos/anarlog/](repos/anarlog/) | 产品·极简 | md 落盘、BYO LLM |
| [repos/FunASR/](repos/FunASR/) | ASR 工具链 | **中文 CPU 首选工具箱** |
| [repos/SenseVoice/](repos/SenseVoice/) | ASR 模型 | SenseVoice 用法 / GGUF CPU 路径 |
| [repos/whisper.cpp/](repos/whisper.cpp/) | ASR 引擎 | C++ CPU 转写对照 |
| [repos/faster-whisper/](repos/faster-whisper/) | ASR 引擎 | Python 高效 Whisper |
| [repos/awesome-design-md/](repos/awesome-design-md/) | UI | DESIGN.md 风格样本（非业务逻辑） |

## 推荐阅读顺序

1. [catalog.md](catalog.md) — 谁干什么、优先级  
2. [../research/2026-07-19-stack-decision-cpu-llm.md](../research/2026-07-19-stack-decision-cpu-llm.md) — 我们定了什么  
3. 按任务：
   - 做产品壳 / 总结流 → [product.md](product.md) → `repos/meetily`、`repos/zabt-ai`
   - 接 CPU 转写 → [asr.md](asr.md) → `repos/FunASR`、`repos/SenseVoice`
   - 抠 UI → **[`../DESIGN.md`](../DESIGN.md)**（Claude）；样本库说明见 [ui.md](ui.md)
4. 深挖时在 `deep/` 写笔记，**禁止**在 Owner 窗粘贴大段上游源码

## 与 multi-agent 仓的对应关系

| multi-agent | 本仓 |
|---|---|
| `references/` | `docs/design/reference/`（设计树内，避免根目录膨胀） |
| `references/repos/` | `docs/design/reference/repos/` |
| `references/deep/` | `docs/design/reference/deep/` |
| `references/catalog.md` | `docs/design/reference/catalog.md` |
