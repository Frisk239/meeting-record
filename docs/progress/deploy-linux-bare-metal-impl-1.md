# Closeout — Linux 裸机部署切片（impl-1）

- **Date:** 2026-07-21  
- **形态：** 上线包（runbook + deploy 模板）+ 最小 `HOST` 绑定补丁  
- **非目标：** Docker、ADR、域名 LE、监控/自动备份编排  

## Grill 结论（已实现）

| 决策 | 结论 |
|---|---|
| 交付 | 裸机 + systemd + Caddy |
| 入口 | 公网 IP + 自签 HTTPS；网站端口可配 |
| 静态/API | 同源反代 `/` + `/api` |
| 路径 | `/opt/meeting-record` · `/var/lib/meeting-record` |
| 注册 | bootstrap 一号后 `ALLOW_REGISTER=false` |
| API 绑定 | `HOST=127.0.0.1` |
| LLM | 服务器 `.env` |
| 系统用户 | `meeting-record`（非网页账号） |
| ADR | 不写；以 deploy 文档为准 |

## 交付物

| 路径 | 说明 |
|---|---|
| `docs/deploy/linux.md` | 逐步部署手册 |
| `deploy/meeting-record-api.service` | systemd |
| `deploy/Caddyfile` | 自签 + 静态 + 反代 |
| `deploy/.env.production.example` | 生产 env 模板 |
| `app/server/src/config.ts` + `index.ts` | `HOST` 可配（默认仍 `0.0.0.0` 利 dev） |
| `.env.example` | 补充 `HOST` |
| `README.md` / `CONTEXT.md` | 入口与方位 |

## 证据边界

- **本机未对用户公网服务器做实测**（无 SSH 目标）；验收以用户按 `docs/deploy/linux.md` 跑通清单为准。  
- 代码改动面积极小：仅监听地址配置化。  

## 后续

- 用户按文档部署；Agent 对照 runbook 排障。  
- 可选后置：Docker 单体、自动备份 cron、有域名后换正式证书。  
