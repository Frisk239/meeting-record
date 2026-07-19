# Closeout: s0b-auth-settings

**日期：** 2026-07-19  
**分支：** `main`（ADR 0008 直推）  
**Slug：** `s0b-auth-settings`

## 用户路径（本刀 Must）

注册/登录 → 进入应用壳（笔记 / 录音占位 / 我的）→ 在「我的」保存 LLM 三字段（base_url / model_id / api_key，Key 掩码）→ 登出后受保护 API 返回 401。

## 交付

### 脚手架

- pnpm monorepo：`app/server`（Hono + Drizzle）· `app/web`（Vite + React + React Router）
- 根脚本：`dev` / `test` / `typecheck` / `build`
- `.env.example` · `.npmrc`（本机代理失效时的 registry 兜底）

### 后端（`@meeting-record/server`）

| 端点 | 行为 |
|---|---|
| `GET /api/health` | 健康检查 + `appName` |
| `GET /api/auth/meta` | `appName` + `registrationOpen`（**不**暴露 `ALLOW_REGISTER` 名） |
| `POST /api/auth/register` | 注册 + httpOnly session cookie |
| `POST /api/auth/login` | 用户名或邮箱 + 密码 |
| `POST /api/auth/logout` | 清 session |
| `GET /api/auth/me` | 当前用户 + LLM 视图（鉴权） |
| `GET/PUT /api/auth/settings/llm` | 读/写用户级 LLM；Key 仅掩码回传 |

- 密码 bcrypt；session token SHA-256 入库  
- 用户配置优先，否则 env（`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`）  
- `ALLOW_REGISTER` 仅服务端

### 前端（`@meeting-record/web`）

- 登录/注册页（注册入口随 `registrationOpen`）  
- 响应式壳：桌面顶栏 + 手机底栏（笔记 / 录音 / 我的）  
- 设置页：账号信息、LLM 三字段、清除用户 Key、退出  
- 视觉 token 跟 `docs/design/DESIGN.md`  
- 录音/列表为下一刀占位（不假装已转写）

### Store 偏离说明（有意）

- ADR 0011 写 **better-sqlite3**。本机 Windows **无 VS C++ 工具链**，`node-gyp` 无法编译原生 addon。  
- **本刀改用 `@libsql/client` + 本地 `file:` SQLite**，仍为 Drizzle + 磁盘 SQLite，无 Postgres/S3。  
- 记入债务：有原生编译环境的部署可再评估切回 better-sqlite3；语义仍符合「本地 SQLite」。

## 证据

| 检查 | 结果 |
|---|---|
| `pnpm test` | **5/5 pass**（register → me → llm → logout · 登录 · 冲突 · 401） |
| `pnpm typecheck` | server + web **pass** |
| `pnpm --filter @meeting-record/web build` | **pass** |
| 进程 smoke（curl） | health → register → me → put llm（掩码）→ logout → me **401** |

未跑 Playwright：本刀 UI 以设置路径为主；浏览器 E2E 可在有 UI 录音路径后补。

## 不做（本刀 Out）

- 录音/上传/ASR/Speaker  
- Auto Minutes / 导出 / 追问 / 外脑  
- 真 LLM 调用（仅存配置）  
- 会议列表真数据

## 演示

```bash
# 代理异常时可先 unset HTTP(S)_PROXY 或使用仓库 .npmrc
pnpm install
pnpm dev          # API :8787 · Web :5173（Vite 代理 /api）
# 浏览器：注册 → 我的 → 填 LLM → 保存 → 退出 → 再进登录
```

## 给下一刀

建议 **S1 转写通路**：会议表 + 上传/浏览器录音自动上传 + 串行 Job 骨架 + Transcript 只读 UI（ASR worker 可先 mock 再接 FunASR）。
