# 调研：会议纪要类产品 · 功能 · 开源参考 · ≤10 人服务器配置

- **Date:** 2026-07-19
- **目的:** 为 `meeting-record` 立项提供对标（飞书妙记/智能纪要、智在记录等）与实现量级判断
- **方法:** Exa 网页搜索 + 本地参考 `docs/design/reference/MOSS-Transcribe-Diarize` README；GitHub `gh search` 当次网络超时，仓库线索主要来自 Exa 抓取的 README/对比文
- **范围假设:** 目标用户规模 **≤10 人**；并发会很低（常见 0–2 路同时转写）

---

## 1. 此类应用的功能点

行业共识可拆成 **采集 → 理解 → 纪要 → 协作/落地** 四段。飞书、智在记录、Otter/Fireflies/Fathom 与主流开源笔记工具大体都落在这张表上，差异在「做全栈还是只做一层」和「云端还是本地」。

### 1.1 功能地图（按价值链）

| 层 | 功能点 | 说明 | 飞书 | 智在记录 | 海外典型 (Otter/Fireflies/Fathom) | 本地开源典型 |
|---|---|---|---|---|---|---|
| **采集** | 会中录制（音/视频） | 平台内会议自动录 | ✅ 会议录制 | ✅ 含硬件录音卡联动 | ✅ 多为 bot 入会 | 多为 **系统声+麦克风** 抓取（无 bot） |
| | 上传本地音视频 | 会后导入 | ✅ 妙记上传/导入 | ✅ | ✅ | ✅（Meetily 等逐步补齐） |
| | 移动端随时录音 | 访谈/线下会 | ✅ AI 录音 | ✅ 强（+ VibeNote） | 弱/中 | 中 |
| | 日历/自动录 | 预约即录 | ✅ 预约会 | 中 | ✅ | 少 |
| **理解** | ASR 转写 | 语音→文字 | ✅ 多语/方言/领域词 | ✅ 宣称高准确率 | ✅ | Whisper 系为主 |
| | 实时字幕/边说边出 | 会中跟随 | ✅ | ✅ | Otter 强 | Meetily/部分支持 live draft |
| | **说话人分离 (diarization)** | 谁在说 | ✅ | ✅ | ✅ | WhisperX/pyannote/MOSS 端到端 |
| | 说话人命名/声纹记忆 | Speaker1→真名 | ✅（平台身份） | ✅ | ✅ | 开源多需手改/本地 embedding |
| | 词级/句级时间戳 | 点文字跳音频 | ✅ | ✅ | ✅ | WhisperX / 产品内 seek |
| | 热词/专业词表 | 人名公司名 | ✅ | ✅ 行业词库 | 中 | 部分支持 |
| | 多语言 / 翻译 | 中英等 | ✅ | ✅ 多语 | ✅ | Whisper 多语；中文质量看模型 |
| **纪要** | 全文转写可编辑 | 纠错 | ✅ | ✅ | ✅ | ✅ |
| | 结构化智能纪要 | 概览/决议/待办等章节 | ✅ 核心差异化 | ✅ 场景模板 | ✅ | LLM 总结（Ollama/API） |
| | 章节/主题分段 | 长会导航 | ✅ | ✅ | 中 | 部分 auto chapters |
| | **行动项 (action items)** | 负责人+截止 | ✅ 可推任务 | ✅ | ✅ | 抽取+手改 |
| | 会中实时摘要 | 迟到跟进度 | ✅ | 弱/中 | Fathom/Otter 有 | 少 |
| | 模板（周会/1:1/面试…） | 输出形态 | 中 | ✅ 场景化 | 中 | 部分 |
| | 会后问答 (Ask meeting) | 基于单会/跨会检索 | ✅ 知识问答方向 | 智能追问/补全 | Fireflies/Fathom 强 | meeting-scribe 等 |
| **协作与落地** | 分享链接/权限 | 内外部 | ✅ | ✅ | ✅ | 弱（本地文件） |
| | 评论/高亮/书签 | 协作批注 | ✅ | ✅ | ✅ | 部分 |
| | 导出 MD/DOCX/PDF/SRT | 归档 | ✅ 文档同步 | ✅ | ✅ | 常见 |
| | 任务系统打通 | 待办闭环 | ✅ 飞书任务 | 企业 IM/OA | CRM/Slack | 少 |
| | 跨设备同步 | 手机录电脑编 | ✅ | ✅ | ✅ | 需自建 |
| | 知识库/长期检索 | 历史会全文搜 | ✅ 生态 | ✅ 归档叙事 | ✅ | SQLite FTS 等 |
| | 发言占比等分析 | talk-time | 中 | 中 | ✅ | 部分 |
| | 硬件录音外设 | 会议室拾音 | 弱 | ✅ VibeNote | 弱 | 无 |
| **非功能** | 隐私/合规 | 数据不出域 | 企业版叙事 | 强调加密与归属 | 云默认 | 本地优先卖点 |
| | 用量/配额 | 转写分钟数 | ✅ | ✅ 免费分钟 | ✅ | 硬件即上限 |

### 1.2 飞书（妙记 + 智能会议纪要）要点

来源：飞书产品页与帮助/文章（`feishu.cn/product/minutes` 等）。

- **妙记：** 视频/音频 → 可搜索、可整理、可翻译的转写；支持录制会、上传、云文档导入、手机录音等入口。
- **智能纪要：** 基于转写做 **自动纪要、章节摘要、待办抽取**；会后约分钟级出结构化要点；要点可关联时间戳跳回音视频。
- **说话人：** 识别参会人身份（平台内更准；外部可手改）。
- **会中：** 实时字幕、实时摘要（跟进度）。
- **落地：** 待办一键变飞书任务；权限（仅内部/外部可看指定内容）；领域词与多语。
- **形态：** 深度嵌在协作套件里——纪要不是独立 App，而是会议→文档→任务闭环的一环。

### 1.3 智在记录要点

来源：官网 `zzjilu.com`、应用商店文案、第三方测评/CSDN 等。

- 定位更接近 **「AI 全能笔记」**：录音 + 图文 + 文档 + 链接，不单是视频会议 bot。
- **转写 + 多人发言区分 + 场景化结构化总结**（周会/客户沟通/培训等模板叙事）。
- **跨端同步**（手机/平板/PC）与团队权限、分享。
- **硬件一体化（VibeNote 录音卡）** 是差异点：拾音质量 + App 控制 + 自动上传转写。
- 企业侧强调对接钉钉/OA、知识归档；云端 ASR + 大模型（文案提及 DeepSeek/豆包等）组合。

### 1.4 对「做 meeting-record 该抄什么」的分层建议

| 优先级 | 能力 | 理由 |
|---|---|---|
| **P0 日用路径** | 导入/录制音频 → 转写+说话人+时间戳 → 可编辑全文 → 结构化纪要+待办 → 导出 | 飞书/智在/Otter 共核；无此则不是纪要产品 |
| **P1 体验** | 点句跳播、说话人重命名/合并、搜索历史会、简单分享 | 决定「愿不愿天天用」 |
| **P2 增长** | 会中实时、日历 bot、跨会问答、任务/IM 集成、硬件 | 可后置；成本与架构分叉大 |
| **刻意可砍（绿场）** | 完整 CRM、企业通讯录 SSO、会议室硬件矩阵、多租户计费 | ≤10 人不必一上来 |

---

## 2. GitHub / 开源参考项目

### 2.1 完整「会议纪要产品」向

| 项目 | 形态 | 要点 | 参考价值 |
|---|---|---|---|
| **[Zackriya-Solutions/meetily](https://github.com/Zackriya-Solutions/meetily)**（亦称 meeting-minutes；stars 量级很大，Exa 抓到约 25k） | 桌面端 local-first（Tauri + Rust + Whisper/Parakeet） | 实时转写、说话人、Ollama/云 LLM 总结；GPU 多后端；隐私卖点 | **产品交互与本地架构首选对标** |
| **[fastrepl/anarlog](https://github.com/fastrepl/anarlog)** | 本地会议笔记，md 落盘 | 系统声+麦；BYO LLM；团队转 char，anarlog 仍 MIT | 极简数据模型（一文一会） |
| **[amicalhq/amical](https://github.com/amicalhq/amical)** | 听写 + 会议转写 | 本地 Whisper/Ollama；偏 dictation | 采集/实时交互 |
| **[elmoghany/meeting-scribe](https://github.com/elmoghany/meeting-scribe)** | 本地 Otter 替代 | live draft + batch large-v3/pyannote + 总结/待办/问答 | 功能清单很全（可当需求 checklist） |
| **[GauravRatnawat/murmur](https://github.com/GauravRatnawat/murmur)** | CLI/本地笔记 | Whisper + 任意 LLM | 轻量管线参考 |

对比文（Meetily 博客等）常把 **Meetily / Whisper 系引擎 / WhisperX** 分成「完整应用 vs 引擎 vs 库」。

### 2.2 引擎 / 库（你更可能「嵌入」而不是 fork 整站）

| 项目 | 作用 |
|---|---|
| **[OpenMOSS/MOSS-Transcribe-Diarize](https://github.com/OpenMOSS/MOSS-Transcribe-Diarize)**（本仓已有 reference） | **端到端** 转写+说话人+时间戳；0.9B；可 SGLang Omni / vLLM 提供 `/v1/audio/transcriptions`；支持长音频（文宣 ~90 分钟级上下文） |
| **[m-bain/whisperX](https://github.com/m-bain/whisperX)** | faster-whisper + 词级对齐 + **pyannote diarization** |
| **[pyannote/pyannote-audio](https://github.com/pyannote/pyannote-audio)** | 业界常用 diarization 流水线 |
| **openai/whisper · SYSTRAN/faster-whisper · ggerganov/whisper.cpp** | ASR 基座；桌面端多用 cpp / whisper-rs |
| **[mudler/moss-transcribe.cpp](https://github.com/mudler/moss-transcribe.cpp)** | MOSS 的 ggml/C++ 推理移植（CPU/GPU、量化）——若要做轻客户端可关注 |
| 服务壳示例 | 如 `whisperx-asr-service` 一类自托管 ASR API（质量与生产就绪度需自审） |

### 2.3 和本仓参考的关系

- 你已选 **MOSS-Transcribe-Diarize**：一条通路同时出 **字 + 说话人 + 时间**，减少 WhisperX「ASR∥diarization 两套模型」的拼接债。
- 产品壳仍建议对照 **Meetily / meeting-scribe 的功能清单** 与 **飞书的结构化纪要+待办**，不要只做裸转写。

---

## 3. 不同实现方案 × 服务器配置（用户 ≤10 人）

### 3.1 负载假设（务必读）

| 假设 | 取值（可后调） |
|---|---|
| 人数 | ≤10，非互联网 SaaS |
| 同时转写任务 | **1–2** 路为主（极少 3+） |
| 单会时长 | 30–90 分钟常见 |
| 峰值 | 周一上午多人上传，队列可接受 |
| 存储 | 音频原始文件是大头（1h 音质 mp3 约数十～百 MB 级，wav 更大） |

**结论先说：** 10 人规模下，瓶颈几乎总是 **GPU 推理与磁盘**，不是 Web 应用的 CPU/内存。Web/API 用 2–4C/4–8GB 足够；要自建高质量转写，再单独算 GPU。

### 3.2 方案对照

#### 方案 A — 纯本机桌面（无服务器）

- **架构：** 每人装客户端；Whisper.cpp / Meetily 类本地推理；总结用本机 Ollama 或个人 API Key。
- **服务器：** **无**（或仅静态更新/可选同步盘）。
- **单机推荐：** 16GB RAM；有独显更佳（NVIDIA 6–12GB 或 Apple Silicon 16GB+）；SSD ≥50GB 模型+录音。
- **Meetily 官方量级：** 最低约 8GB RAM / 4 核 / 10GB 盘；推荐 16GB RAM / 8 核 / 50GB；Whisper 模型约再占 2–8GB 内存视尺寸。
- **适合：** 隐私最强、运维为零；**不适合** 统一团队库、弱电脑统一体验。

#### 方案 B — 轻量应用服务器 + **云 ASR/纪要 API**

- **架构：** 自建 Web（上传、权限、纪要编辑、导出）；音频送火山/阿里/OpenAI/飞书类或第三方转写；LLM 总结走 API。
- **服务器（10 人）：**
  - **应用：** 2–4 vCPU · **4–8 GB RAM** · 80–200 GB SSD（或对象存储放音频）
  - **GPU：** 不需要
  - **带宽：** 视上传；办公网即可
- **成本形态：** 服务器便宜，**按分钟转写费** 为主。
- **适合：** 最快做出「像飞书的产品壳」；数据出境/合规要单独评估。

#### 方案 C — 自建 **Whisper / faster-whisper / WhisperX** 流水线

- **架构：** App 服 + **GPU Worker**（队列：Redis/RQ/Bull 等任选）；Worker 跑 ASR（±对齐±pyannote）。
- **模型显存参考（公开数据，近似）：**
  - Whisper：tiny~1GB … medium~5GB … large~10GB VRAM（官方表）；faster-whisper/量化可明显下降。
  - WhisperX 文案：large-v2 在合理 batch 下可 **&lt;8GB**；带 diarization 的服务实践常写 **large 全链路 ~10–14GB+**。
  - pyannote 3.x：常可在 **6–8GB** 级单路；batch 过大会爆显存。
- **≤10 人推荐机型：**
  | 档位 | GPU | 系统 | 备注 |
  |---|---|---|---|
  | 能用 | **RTX 3060 12GB** 或云 **T4 16GB** | 8 核 · 32GB RAM · 200GB+ SSD | medium / large-v3 + 小 batch；队列串行 |
  | 舒服 | **RTX 3090/4090 24GB** 或 L4/A10 | 8–16 核 · 32–64GB · 500GB SSD | large-v3 + diarization 同卡更稳 |
  | App 节点 | 无 GPU | 2–4C · 8GB · 小盘 | 与 Worker 分离 |

- **并发：** 10 人共享 **1 张 12–24GB 卡 + 队列** 通常够用；不要按「10 路同时 realtime」买 10 卡。

#### 方案 D — 自建 **MOSS-Transcribe-Diarize**（与本仓参考对齐）

- **架构：** 同 C，但 Worker 换成 MOSS（Transformers 直载 / **SGLang Omni** / **vLLM** 的 transcription API）。
- **模型：** 0.9B 级端到端（文本骨干约 Qwen3-0.6B 风格 + Whisper-Medium 编码器配置）；HF 权重体积约 **数 GB 级**（checkpoint 侧可见 ~1.8GB 等分片，部署时连依赖与 KV 仍需余量）。
- **官方服务基准：** SGLang Omni cookbook 在 **单卡 H100 80GB** 上给吞吐参数示例（`max-running-requests 16` 等）——那是**性能标尺**，不是 10 人小队的最低配。
- **≤10 人务实估计（需实测校准）：**
  | 档位 | 配置 | 预期 |
  |---|---|---|
  | 开发/尝鲜 | 消费级 **8–12GB** 起（bf16/量化、限制并发=1） | 可能跑通短中音频；长会与 batch 要试 |
  | 小团队日用 | **16–24GB** 消费卡或云 **L4/A10 24GB** · 32GB 系统内存 · 队列并发 1–2 | 更稳的长会 |
  | 对齐官方 recipe | H100 类 | 仅当要高并发/极长音频 SLA 时 |

- **CPU 路径：** 有 `moss-transcribe.cpp` 等移植，适合边缘/无 GPU，但长会 RTF 会明显差于 GPU（其 README 强调长音频自回归成本）。
- **App 节点：** 与方案 C 相同，**2–4C / 8GB** 级即可。

#### 方案 E — 混合

- 采集与编辑在本机或轻服务器；**重转写丢到一台共享 GPU 小钢炮**（办公室 1 台 3090/4090 或云竞价 GPU）。
- 总结用 **云 LLM API**（文本出域、音频可留本地）可再降本地显存压力。
- **配置：** App 同 B + GPU Worker 同 C/D 的「舒服档」一张卡。

### 3.3 一张总表（≤10 人采购直觉）

| 方案 | App/API 服务器 | GPU | 月费直觉 | 隐私 | 产品完整度速度 |
|---|---|---|---|---|---|
| A 纯本机 | 0 | 用户自己的电脑 | 电费 | 最好 | 中（装机分裂） |
| B 云 API | 2–4C/8GB | 无 | 服务器低 + **按量 API** | 取决于厂商 | **最快** |
| C WhisperX 自建 | 2–4C/8GB | **12–24GB ×1** | 中（持有 GPU） | 好 | 中 |
| D MOSS 自建 | 2–4C/8GB | **建议 16–24GB ×1**（先测 12GB） | 中 | 好 | 中高（端到端省拼接） |
| E 混合 | 同 B | 同 C/D 一张 | 灵活 | 可控 | 高 |

### 3.4 存储粗算（别只看算力）

- 10 人 × 每周 5 次 × 1h × 压缩音频 ~50–100MB → 约 **10–20GB/月** 量级（未计视频与备份）。
- 建议：音频走 **对象存储或大容量 SSD**；DB 只存元数据与转写文本；保留策略（30/90 天）写进产品决策。

---

## 4. 对 meeting-record 的直接含义

> **2026-07-19 已决策（见 ADR 0003 / stack-decision）：** 单人 · 无 GPU · **CPU ASR + LLM 文本总结**；说话人/MOSS **非默认**。下文第 1–2 条中「必含说话人 / 默认 MOSS」已作废，仅保留历史调研语气。

1. **功能最小闭环（现行）：** 导入 → CPU 转写 → 可编辑全文 →（LLM）结构化纪要 → 导出。  
2. **引擎（现行）：** FunASR/SenseVoice 等 CPU；产品壳学 Meetily/zabt 清单。  
3. **≤10 人 / 单人基础设施：** 无 GPU 时以 **4C8G + 串行 Worker** 或云 ASR 为主，不默认买 GPU。  
4. 仍可 grill 的细节：导出格式、LLM 字段、存储、Web 框架。
---

## 5. 主要来源

- 飞书：https://www.feishu.cn/product/minutes 及站内智能纪要/妙记相关文章与帮助
- 智在记录：https://www.zzjilu.com/ ；应用商店与第三方测评文
- Meetily：https://github.com/Zackriya-Solutions/meetily ；https://meetily.ai/ ；GPU 文档
- WhisperX：https://github.com/m-bain/whisperX
- Whisper 模型表：https://github.com/openai/whisper
- meeting-scribe / anarlog / amical 等 GitHub README（Exa 抓取）
- Fireflies / Otter / Fathom 产品与对比文
- 本仓：`docs/design/reference/MOSS-Transcribe-Diarize/README.md`（及 SGLang Omni cookbook 描述）
- 硬件量级：Whisper 官方 VRAM 表、WhisperX/第三方部署指南、Llama 3 8B 量化显存（总结侧）、pyannote 社区讨论

---

## 6. 局限

- 当次环境 `gh search` 访问 GitHub API 超时，**star 精确排序未用官方 API 复核**；表中 star 为第三方检索摘要，落地前可用 `gh repo view` 再确认。
- 厂商「98% 准确率」等为营销数字，未做自有评测。
- MOSS 在消费级 12GB 卡上的长会 RTF/稳定性 **必须以本机 benchmark 为准**。

---

## 7. 附录：无 GPU · 4 核 8G · 单人使用（2026-07-19 补）

**约束：** 服务器无显卡；4 vCPU / 8 GB RAM；使用者仅本人。  
**结论：** 不做 MOSS/GPU 端到端；在 **CPU 本地 ASR** 与 **云录音文件识别 API** 之间选。

### 7.1 本机 CPU 能不能跑？

| 引擎 | 内存量级 | 4C8G 可行性 | 备注 |
|---|---|---|---|
| **SenseVoice Small GGUF (FunASR)** | 模型 q8 ~254MB；极轻 | **很适合** | 中文 CER 文案明显好于 whisper.cpp small；可纯 CPU、无 Python 二进制路径 |
| **whisper.cpp small** | 磁盘 ~466MB，运行内存 ~0.85GB | **适合** | 官方内存表；中文弱于 SenseVoice 档 |
| **faster-whisper small int8** | 约 1.5GB 级（官方 small CPU 表） | **适合** | 比 openai/whisper 省内存更快 |
| whisper medium | ~2GB+ | 勉强可批处理 | 与 Web/DB 同机时注意别 OOM |
| whisper large / WhisperX+pyannote / MOSS | 高 | **不推荐** | 无 GPU 太慢或装不下舒适余量 |

**实操：** 同机只跑 **Web + 单 Worker**；转写 **排队串行**；会后批处理，不承诺实时字幕。  
**说话人分离：** 无 GPU 时先降级（不标说话人 / 仅「我 vs 他人」若双轨录音 / 或以后云 diarization）；完整 pyannote 链路不适合作默认。

### 7.2 云 ASR 要不要钱？

要，但是 **按音频时长计费**；单人月用量通常很少。

| 服务 | 公开标价量级（会变，下单前再查） | 单人粗算 |
|---|---|---|
| **OpenAI Whisper API** | 约 **$0.006 / 分钟** ≈ **$0.36 / 小时** | 10 小时/月 ≈ **$3–4** |
| **阿里云 录音文件识别** | 按量约 **2.5 元/小时**（低用量档）；资源包可更低 | 10 小时/月 ≈ **25 元** 量级 |
| 本机 CPU | **0 元 API 费** | 电费 + 等待时间 |

另有国内各家「录音文件识别 / 极速版」；选型看中文效果、是否要说话人、是否必须境内数据。

### 7.3 推荐架构（贴合 4C8G 单人）

```
浏览器上传/录音
  → 4C8G 上的 Web/API + SQLite/文件存储
  → 本地队列（一次只跑 1 个转写任务）
  → Worker: SenseVoice 或 faster-whisper/whisper.cpp
  → 可选：把转写文本丢给「便宜 LLM API」生成纪要/待办
```

| 优先级 | 方案 | 何时选 |
|---|---|---|
| **默认推荐** | **A. 全本地 CPU**（SenseVoice GGUF 优先，备选 whisper.cpp small） | 不想月费、可接受会后等几分钟～数十分钟 |
| 备选 | **B. 云 ASR**（阿里云录音文件 / OpenAI Whisper） | 要更快更高质、可接受音频出域与小额月费 |
| 混合 | **C. 默认本地，失败/重要会走云** | 兼顾隐私与质量 |

**不要做：** 在 4C8G 无卡机上硬上 MOSS、large-v3 实时、WhisperX+pyannote 全开。
