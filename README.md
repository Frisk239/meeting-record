# meeting-record

个人向会议纪要产品（**显示名默认 Meeting Record**，`APP_NAME` 可配）：在 **CPU** 上转写音视频，再用 **LLM** 生成可编辑纪要。

> **Agent / 工程入口：** [`AGENTS.md`](./AGENTS.md) · [`CONTEXT.md`](./CONTEXT.md)  
> **UI：** [`docs/design/DESIGN.md`](./docs/design/DESIGN.md)（Claude 气质）  
> 本 README 给人扫一眼；真源以 AGENTS / CONTEXT / design / ADR 为准。

## 当前阶段

- 文档 / PRD / Claude DESIGN 已落地  
- **可点击原型：** [`docs/design/prototype/mvp/`](./docs/design/prototype/mvp/)  
- **应用：** `app/web` + `app/server` + `workers/asr` — **MVP 主闭环**；转写默认 mock，可开 **FunASR CPU**（见 `workers/asr/README.md`）  
- **栈：** TypeScript · Vite+React · Hono · Drizzle/SQLite（`@libsql/client`）· **pnpm** · Python FunASR 旁路（ADR 0009–0012）  

## 本地开发

```bash
cp .env.example .env   # 按需改 ALLOW_REGISTER / SESSION_SECRET / LLM_* / ASR_ENGINE
pnpm install
pnpm dev               # Web http://127.0.0.1:5173 · API http://127.0.0.1:8787
pnpm test

# 真转写（可选，需 Python venv，见 workers/asr/README.md）:
# ASR_ENGINE=funasr
# ASR_WORKER_PYTHON=workers/asr/.venv/Scripts/python.exe
```

## 目录速览

| 路径 | 作用 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | 项目宪法 |
| [`CONTEXT.md`](./CONTEXT.md) | 领域词 + 方位 |
| [`app/web`](./app/web) | Vite + React 前端 |
| [`app/server`](./app/server) | Hono API + SQLite |
| [`docs/design/`](./docs/design/) | 愿景、架构、路线、切片、**DESIGN.md** |
| [`docs/design/reference/`](./docs/design/reference/) | catalog + 上游 `repos/`（gitignore） |
| [`docs/adr/`](./docs/adr/) | 难逆决策 |
| [`docs/agents/`](./docs/agents/) | Slice Owner / tracker / merge |
| [`docs/progress/`](./docs/progress/) | 切片证据 |
| [`.scratch/`](./.scratch/) | 本地 spec 草稿 |

## 工程模式（摘要）

- 垂直厚切片 × **Slice Owner**
- 默认 **main 上开发并 push**（Issue 非必选；见 ADR 0008）
- 细则：[`docs/agents/workflow.md`](./docs/agents/workflow.md)
