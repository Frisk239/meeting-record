# CONTEXT.md — 领域词汇与当前方位

> 本仓 **single-context** 领域真源。由 `/grill-with-docs`、`/domain-modeling` 增量维护。  
> **术语与方位写这里；实现细节写 design / ADR / 代码。**

## 产品一句话

个人会议纪要工具：在 CPU 上转写会议音视频并 **区分说话人**，再用 LLM 生成可编辑纪要。

## Language

**Meeting**:
一次可导入音视频、产生转写与纪要的会议记录单元。在列表中通常展示为卡片（标题、可选摘要、时间、状态）。
_Avoid_: Session alone（易与登录会话混）, Event

**Meeting List**:
当前登录用户可见的 Meeting 集合视图（默认时间倒序）；提供开始录音与导入入口。
_Avoid_: 未登录全局公开列表；照搬无关底栏产品矩阵

**Recording**:
用户导入或**在浏览器内录制**后得到的原始音视频，作为转写输入。
_Avoid_: 仅说 Media 而不分是否已入库

**In-Browser Capture**:
在 Web App 内通过麦克风录音：用户**点击开始**，**长按确认结束**后**自动上传**并创建 Transcription Job。属 P0 采集路径。**主场景是现场/当面实际录音**（非腾讯会议式系统声环回）。录音中 UI 含计时、可选波形；建议支持暂停与丢弃。**默认最长 60 分钟**，由配置（如 `MAX_RECORDING_MINUTES`）可调。
_Avoid_: 把会议软件系统声捕获当首版必达；把「结束录音」做成易误触的单击且无确认；首版强制随手拍/随手记；默认不设时长上限
**Auto Minutes**:
Transcription Job **成功后自动**触发一次 LLM 生成 Minutes；允许失败重试与用户手动「重新生成」。
_Avoid_: 仅手动生成当作唯一路径（除非用户关闭自动）；转写中流式总结当作默认

**Minutes**:
结构化会议纪要，首版对标智在式 AI 总结（见 vision）：**纪要头**（主题/时间/地点/参与主体/核心目标）+ 关键议题、争议点、待办、时间轴等；图解为增强。可编辑。
_Avoid_: Notes alone；把「探索/外脑自动灌屏」算进每次默认 Minutes

**Meeting Q&A**（产品名可再定，对标智在「追问/问小智」）:
基于**本场已记录内容**（Transcript / Minutes）由用户**主动提问**、模型作答。信息架构上为 **纪要的子页**：从纪要页**右下角入口**进入，而非与纪要平级的第三主 Tab 强制并列。
_Avoid_: 每次转写后自动灌屏；跨全库闲聊且不绑定本场会议（除非明确做全局搜索）

**Insights Board**（产品文案可叫「AI外脑」）:
可选详情 Tab；内容**仅在用户显式触发**时生成（如一键生成/按主题生成），**转写成功后不自动生成**。能力上仍走 LLM + Context Pack。
_Avoid_: 默认每次会后自动外脑全量；与 P0 Minutes 模块混淆

**Explore Tab**:
智在「探索」类扩展发现页。
_Avoid_: 本仓**不做**（已砍）

**Transcript**:
转写得到的全文；**默认含说话人标签与时间信息**（如 Speaker 0/1 与时间码），可编辑。
_Avoid_: Subtitles alone, 无标签纯正文当作完整交付（除非 Job 降级失败）

**Speaker Label**:
转写中标识「哪位说话人」的标签；默认匿名 id（Speaker 0/1…），用户可改名为真名（改名能力可后置）。
_Avoid_: 把 LLM 正文猜测当作声学 Speaker Label

**Action Item**:
纪要中的待办条目；展示宜为 **责任人/角色 + 动作**（对标智在待办 bullet）。截止时间可后补。
_Avoid_: Todo 与产品外任务系统强绑定（当前无强制集成）；与外脑式多步处方混淆

**Transcription Job**:
一次针对某 Recording 的 ASR（及说话人）批处理任务（排队、运行、成功/失败/降级）。
_Avoid_: Task alone（易与 Action Item 混）

**ASR**:
自动语音识别（本仓默认 **CPU** 开源引擎）。
_Avoid_: 默认暗示云 ASR 或 GPU 大模型

**Diarization**:
说话人分离：在声学上区分谁在说话，并写入 Transcript 的 Speaker Label。本仓默认 **FunASR VAD + CAM++** 流水线（CPU）。
_Avoid_: 仅靠 LLM 读无标签正文来「听」说话人

**LLM Summary**:
以 Transcript 文本为输入、调用大语言模型生成 Minutes 的步骤。
_Avoid_: 把「上传音频给 LLM 多模态」当默认；把 LLM 当 Diarization 主引擎

**Web App**:
以浏览器访问的自托管应用为默认产品形态；同一套界面通过响应式布局覆盖手机与电脑。
_Avoid_: 首版桌面原生 / 双端分叉代码当作默认

**App Display Name**:
面向用户的产品显示名。**默认 `Meeting Record`**，可通过配置（如 `APP_NAME`）覆盖；用于标题栏、登录页、导出页眉等。
_Avoid_: 把仓库目录名 `meeting-record` 与显示名绑死且不可配置

**User Account**:
本系统内的使用者身份；支持**简单注册**（用户名/邮箱 + 密码）与**登录**。业务数据按用户隔离。是否允许新用户注册由**服务端/部署配置**（如 `ALLOW_REGISTER`）静默控制，**不出现在前端页面**。
_Avoid_: 首版 OAuth/第三方登录/复杂 RBAC；公网永久无条件开放注册且无开关；在设置页或登录页展示/切换注册开关

**Session / Auth**:
登录后的会话或令牌；所有业务 API 必须校验身份，并按资源属主防越权（IDOR）。
_Avoid_: 「前端藏链接、API 裸奔」

**LLM Provider Config**:
用户（或部署级）配置的 **OpenAI Chat Completions 兼容** 接口参数：`base_url`、`model_id`、`api_key`。可来自**环境变量/配置文件**（部署默认）与/或**前端设置页**（用户填写，安全存储）。
_Avoid_: 非 Chat Completions 协议为默认；把 key 写进前端打包进公开仓库
**Export**:
将 Minutes（及可选 Transcript）导出为文件。**P0：Markdown + PDF**；Word/外链分享后置。
_Avoid_: 首版只做纯文本却无 MD；默认 Word 为唯一格式

**Context Pack**:
一次 LLM 调用前组装的本场上下文包（系统指令 + 钉选要点 + 纪要 + 对话 + 转写片段/摘要等）。
_Avoid_: 无组装直接只丢用户一句问话；把跨会记忆当默认

**Pinned Facts**:
本场**必须全量进入** Context Pack 的信息：纪要头、争议点、Action Items、用户显式编辑、当前用户问题等。
_Avoid_: 被滚动摘要替换掉待办/争议

**Transcript Digest**:
对 Transcript 的可缓存压缩摘要（按时间/话题），用于装不下全文时的地图；重要问答仍应附带相关原文片段全量。
_Avoid_: 用 Digest 永久代替可编辑 Transcript 真源

**Store**:
本机持久化：**音频与导出文件**落在服务器本地磁盘目录；**元数据、Transcript、Minutes、Q&A、Digest、任务状态**用 **SQLite**（或等价嵌入式 DB）。
_Avoid_: 首版 Postgres/多节点对象存储；无数据库的纯散落文件作为唯一方案（查询与 Job 状态会痛）

## 完成边界（当前）

| 要 | 不要（现阶段） |
|---|---|
| 单人、无 GPU、**4 核 4G** 可部署 | 组织权限、日历 bot、硬件麦矩阵 |
| CPU ASR + **Diarization P0** + LLM 纪要 | MOSS/GPU 默认、pyannote 重流水线默认 |
| Speaker 标签转写 + 可编辑与导出 | 实时字幕 SLA；纯 LLM 分说话人 |
| **简单注册/登录**（开放注册仅服务端配置）+ API 鉴权/按用户隔离 | OAuth 全家桶、无鉴权 API、公网永久裸注册；前端暴露注册开关 |
| **LLM：OpenAI Chat Completions 兼容**（base_url + model + api_key；env/文件 + 前端配置） | 默认多协议/强制本机 Ollama |
| **浏览器内录音 P0**（现场麦；点开始 / 长按确认结束 / 自动上传；**默认 60min 可配**）+ 文件上传 | 会议软件系统声环回当首版必达；默认无时长上限 |
| **转写成功后 Auto Minutes**（智在式结构可参考） | 每次自动生成「AI外脑」灌屏 |
| **追问 = 纪要子页**（右下角进入）；**外脑 Tab 仅按需生成** | 自动外脑灌屏；探索 Tab |
| **无「探索」** | 智在探索页 |
| **导出 P0：Markdown + PDF** | 首版强制 Word/复杂分享体系 |
| **LLM Context Pack + 分层压缩**（重要全量） | 每次无上下文；或一刀切摘要丢掉待办 |
| **Store：本地磁盘 + SQLite** | 首版强制 Postgres/S3 |

## 架构钉死（实现勿默默推翻）

1. CPU 批处理转写 + **串行**任务（ADR 0003）  
2. **Diarization P0** = FunASR + CAM++ 方向（ADR 0004）  
3. LLM 吃文本做纪要；4G 上优先外部 API（ADR 0003）  
4. UI 跟 `docs/design/DESIGN.md` Claude 体系（ADR 0002）  
5. Slice Owner · **main 直推**（ADR 0001 + **0008**）；Issue 非必选  
6. 不改 `docs/design/reference/repos/` 上游  
7. **注册/登录 + 业务 API 鉴权/按用户防越权**（非 API 裸奔）  
8. **Context Packer：分层记忆/压缩**（ADR 0005）；Pinned Facts 不丢  
9. **Store = 本地磁盘 + SQLite**（单机 4C4G）  
10. **LLM 仅 Chat Completions 兼容 API**（base_url / model / key；env 或前端配置）  
11. **TypeScript 全栈为主**；**Python 仅 ASR 等 TS 搞不定的旁路**（ADR 0009）  
12. **Vite + React** 前端 · **Hono** API（ADR 0010）  
13. **Drizzle + better-sqlite3** 访问 SQLite（ADR 0011）  
14. **pnpm** 包管理（ADR 0012）  

## 当前方位（2026-07-19）

- **阶段：** **P0 能力闭环已可演示**（含 FunASR 真 wav Job 证据；默认 dev 仍可 mock）  
- **工程：** Slice Owner · [workflow](docs/agents/workflow.md) · main 本地提交（push 由人手动）  
- **上一刀补证：** FunASR 真转写 — [`docs/progress/s1b-funasr-real-wav-evidence.md`](docs/progress/s1b-funasr-real-wav-evidence.md)  
- **已交付：** S0b–S4 · S1b 旁路 · API/Playwright 部分 E2E  
- **应用：** `app/web` + `app/server` + `workers/asr`  
- **Store：** Drizzle + `@libsql/client` + `DATA_DIR/media`  
- **残余 polish（非阻断）：** PDF CJK 字体、原文播放、Playwright 文件上传手势、多说话人长会实测、4G RSS 表  
- **下一步建议：** 人 `git push` · 多说话人样例 · 播放器 polish  
  

## 相关入口

| 读什么 | 路径 |
|---|---|
| 项目宪法 | `AGENTS.md` |
| 愿景 | `docs/design/vision.md` |
| UI | `docs/design/DESIGN.md` |
| ASR + 说话人 | ADR 0003 · 0004 · `docs/design/reference/asr.md` |
