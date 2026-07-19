# ADR 0006 — 简单用户账号 + OpenAI Chat Completions 配置

身份：**用户名/邮箱 + 密码注册登录**（非仅共享口令、非 OAuth）。业务数据按用户隔离；API 鉴权并防越权。  
LLM：**只对接 OpenAI Chat Completions 兼容 HTTP API**。配置项为 `base_url`、`model_id`（或 model）、`api_key`；来源为**部署环境变量/配置文件**与/或**登录后前端设置页**（用户填写）。不在 4C4G 上默认捆绑本机 Ollama 进程。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（产品）  
- **Supersedes in part:** 早期「仅极简共享口令门禁」表述（vision/CONTEXT 已修订）

## Context

单机自托管仍要基本账号，便于多人或密钥隔离，并在 UI 配置各自/自己的 LLM。用户已自备兼容端点，只要三要素配置即可。

## Decision

1. Auth：注册 + 登录；密码安全存储；会话/令牌保护 API。  
2. **`ALLOW_REGISTER`（或等价）为部署/服务端静默配置**（env/配置文件），**禁止出现在任何前端页面或用户设置 UI**；关闭后仅已有账号可登录（首户可用种子/CLI）。API 在注册接口上返回不允许即可，前端只根据接口结果展示「暂不可注册」，不暴露配置项名称给终端用户操作。
3. 授权：Meeting/Recording 等资源带 `user_id`；禁止跨用户 IDOR。  
4. LLM：仅 Chat Completions 协议；配置三字段；设置页可写（key 掩码展示）。  
5. 部署默认可用 env 覆盖（如 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`），与用户配置的优先级在实现时写清（建议：用户已保存配置优先，否则 env）。
## Consequences

### Positive

- 与用户现有网关/中转一致。  
- 设置页可自助改模型，无需改代码。

### Trade-offs

- 注册开放需注意：自托管可关注册或邀请制（可后续配置 `ALLOW_REGISTER`）。  
- API key 存库须加密或受保护；勿进日志。
