# Linux 全量部署（裸机 · 自签 HTTPS · 单机 4C8G）

> **形态：** systemd 跑 API；Caddy 做自签 HTTPS + 同源反代；FunASR 由 Node **spawn** 本机 venv。  
> **非目标：** Docker Compose、域名 Let’s Encrypt、多节点。  
> **约定来自部署切片 grill（2026-07-21）。**

你按本文从零装到可登录；卡在哪一步把终端输出贴给 Agent 即可对照排障。

---

## 0. 拓扑（心智图）

```
浏览器  →  https://公网IP[:网站端口]   （Caddy，自签证书）
              ├─ /        →  app/web/dist
              └─ /api/*   →  127.0.0.1:8787  （Node API）
                              └─ spawn → workers/asr/.venv  FunASR
磁盘数据：/var/lib/meeting-record/   （sqlite + media + exports + 模型缓存家目录）
代码：    /opt/meeting-record/
```

| 角色 | 说明 |
|---|---|
| 网站入口端口 | **不写死 443**；面板/安全组放行哪个，Caddy 就听哪个 |
| API `8787` | **仅本机**；不要对公网放行 |
| 系统用户 `meeting-record` | 只跑服务，**不是**网页登录账号 |
| 网页账号 | bootstrap 时你自己注册的那一个，然后关注册 |

---

## 1. 系统依赖

以 Debian/Ubuntu 为例（其他发行版等价包即可）：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential \
  python3 python3-venv python3-pip ffmpeg \
  fonts-noto-cjk

# Node 20+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@10.33.0 --activate

# Caddy（若仓库源没有，按 https://caddyserver.com/docs/install 安装）
sudo apt install -y caddy
```

**PDF 中文：** `pdf-lib` **不能**可靠嵌入 `.ttc`。若系统只有 Noto CJK 的 ttc，请自行放一个 **`.ttf` / `.otf`**（如 Noto Sans SC），并在 `.env` 设 `PDF_CJK_FONT=/绝对路径`。

---

## 2. 用户与目录

```bash
sudo useradd --system --home /var/lib/meeting-record --shell /usr/sbin/nologin meeting-record || true
sudo mkdir -p /opt/meeting-record /var/lib/meeting-record
sudo chown -R "$USER":"$USER" /opt/meeting-record
sudo chown -R meeting-record:meeting-record /var/lib/meeting-record
```

首次用你的 SSH 用户往 `/opt` 放代码；跑服务时属主再交给 `meeting-record`（见第 7 步）。

---

## 3. 拉取代码

```bash
# 若还没有仓库：
sudo -u "$USER" git clone <你的仓库 URL> /opt/meeting-record
cd /opt/meeting-record
git checkout main
```

或本机 `rsync`/`scp` 上传已有目录到 `/opt/meeting-record`（排除 `node_modules`、`.venv`、本地 `data` 亦可在服务器重装）。

---

## 4. 环境变量

```bash
cd /opt/meeting-record
cp deploy/.env.production.example .env
# 编辑：SESSION_SECRET、LLM_*、ALLOW_REGISTER 等
nano .env
chmod 600 .env
```

**必改：**

| 变量 | 生产值 |
|---|---|
| `HOST` | `127.0.0.1` |
| `SESSION_SECRET` | 长随机串 |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | 你的兼容接口 |
| `ALLOW_REGISTER` | 先 `true`（仅 bootstrap），建号后改 `false` |
| `DATA_DIR` / `DATABASE_PATH` | `/var/lib/meeting-record/...` |
| `ASR_WORKER_PYTHON` | `/opt/meeting-record/workers/asr/.venv/bin/python` |

---

## 5. Node 依赖与构建

```bash
cd /opt/meeting-record
pnpm install --frozen-lockfile
pnpm build
# 产出：
#   app/server/dist/
#   app/web/dist/
```

冒烟（可选，临时改 `HOST=127.0.0.1` 已在 .env）：

```bash
cd /opt/meeting-record/app/server
# 用服务用户测更准；先确保 .env 在仓库根且 DATA 目录可写
sudo -u meeting-record env HOME=/var/lib/meeting-record \
  bash -lc 'cd /opt/meeting-record/app/server && node dist/index.js'
# 另开终端：
curl -sS http://127.0.0.1:8787/api/health
# Ctrl+C 停掉前台进程
```

---

## 6. FunASR Python 旁路

```bash
cd /opt/meeting-record/workers/asr
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# 解析冒烟（不下载大模型）
python worker.py --self-test-parse
```

模型缓存在运行用户的家目录缓存（systemd 里 `HOME=/var/lib/meeting-record`）。  
**首次真转写会下载模型，耗时长、占磁盘**——留足空间（建议数据盘 ≥50GB 量级更安心）。

可选预热（有一小段 wav 时）：

```bash
python worker.py --audio /path/to/sample.wav > /tmp/asr-out.json
```

停用 venv：`deactivate`。

确保服务用户读得到 venv：

```bash
sudo chown -R meeting-record:meeting-record /opt/meeting-record/workers/asr/.venv
```

---

## 7. 权限收敛

```bash
# 代码树：root 或你的用户拥有；服务用户需要读 + 执行
sudo chown -R root:meeting-record /opt/meeting-record
sudo chmod -R g+rX /opt/meeting-record
# .env 仅服务用户可读
sudo chown meeting-record:meeting-record /opt/meeting-record/.env
sudo chmod 600 /opt/meeting-record/.env
# 数据可写
sudo chown -R meeting-record:meeting-record /var/lib/meeting-record
```

若你更省事，也可 `chown -R meeting-record:meeting-record /opt/meeting-record`（自用可接受）。

---

## 8. systemd（API）

```bash
sudo cp /opt/meeting-record/deploy/meeting-record-api.service /etc/systemd/system/
# 确认 ExecStart 的 node 路径：
which node   # 若不是 /usr/bin/node，请编辑 unit 里 ExecStart
sudo systemctl daemon-reload
sudo systemctl enable --now meeting-record-api
sudo systemctl status meeting-record-api --no-pager
journalctl -u meeting-record-api -n 50 --no-pager
```

健康检查：

```bash
curl -sS http://127.0.0.1:8787/api/health
```

---

## 9. Caddy（自签 HTTPS + 静态 + 反代）

1. 看清面板放行的 **TCP 端口**（下称 `PUBLIC_PORT`）。  
2. 编辑仓库内模板或系统配置：

```bash
sudo cp /opt/meeting-record/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

把 `:443` 改成你的端口，例如 `:8443`。

3. 启动：

```bash
sudo systemctl enable --now caddy
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

4. 浏览器打开：`https://你的公网IP` 或 `https://你的公网IP:PUBLIC_PORT`  
   - 自签证书会报警 → **高级 → 继续访问**（自用可接受）  
   - 不要用 `http://` 访问生产（Cookie `Secure` + 录音 Secure Context）

防火墙示例（按你的端口改）：

```bash
# 若用 ufw
sudo ufw allow 8443/tcp
# 不要放行 8787
```

---

## 10. Bootstrap：只建你一个账号并关注册

1. `.env` 设 `ALLOW_REGISTER=true`  
2. `sudo systemctl restart meeting-record-api`  
3. 浏览器打开站点 → **注册**你的用户名/邮箱/密码（这就是以后网页登录账号）  
4. `.env` 改回 `ALLOW_REGISTER=false`  
5. `sudo systemctl restart meeting-record-api`  
6. 再开无痕窗口确认无法注册

---

## 11. 验收清单

| 步骤 | 期望 |
|---|---|
| `curl http://127.0.0.1:8787/api/health` | JSON `ok: true`，`asrEngine: funasr` |
| HTTPS 打开前端 | 登录页，无混合内容错误 |
| 登录 | 成功进入会议列表 |
| 上传短音频或录音 | Job 排队 → 成功（首次模型下载可能很久） |
| 自动纪要 | LLM 配置正确则生成 Minutes |
| 导出 MD/PDF | PDF 中文不乱码（依赖 `PDF_CJK_FONT`） |
| 直连 `http://公网IP:8787` | **应失败**（未放行或未监听公网） |

---

## 12. 日常升级

```bash
cd /opt/meeting-record
sudo systemctl stop meeting-record-api
git pull
pnpm install --frozen-lockfile
pnpm build
# 若 workers/asr/requirements.txt 有变：进 venv 再 pip install -r
sudo systemctl start meeting-record-api
sudo systemctl reload caddy
```

启动时会跑 SQLite migrate（见 server `migrate()`）。

---

## 13. 备份（最低限度）

停 API 或可接受短暂不一致时：

```bash
sudo systemctl stop meeting-record-api
sudo tar czf ~/meeting-record-backup-$(date +%F).tar.gz -C /var/lib meeting-record
sudo systemctl start meeting-record-api
```

恢复：解压回 `/var/lib/meeting-record`，属主改回 `meeting-record`，再启服务。

---

## 14. 常见问题

| 现象 | 排查 |
|---|---|
| 登录后立刻掉线 | 是否用 **HTTPS** 打开？`NODE_ENV=production` 时 Cookie 为 Secure |
| 无麦克风 | 必须 HTTPS（或 localhost）；HTTP 公网 IP 不行 |
| 转写 spawn failed | `ASR_WORKER_PYTHON` 路径、venv 属主、`ffmpeg` 是否在 PATH |
| 转写极慢/内存高 | 正常；**禁止**并行第二 Job；勿同时跑本机大模型 |
| PDF 中文 `????` | 配置独立 `PDF_CJK_FONT`（非 ttc） |
| 502 / 前端空白 | `app/web/dist` 是否已 build；Caddy `root` 路径；API 是否在 127.0.0.1:8787 |
| 注册按钮没有/失败 | `ALLOW_REGISTER`；改完需 restart API |

日志：

```bash
journalctl -u meeting-record-api -f
journalctl -u caddy -f
```

---

## 15. 文件索引

| 路径 | 用途 |
|---|---|
| [`deploy/meeting-record-api.service`](../../deploy/meeting-record-api.service) | systemd unit |
| [`deploy/Caddyfile`](../../deploy/Caddyfile) | 自签 HTTPS + 静态 + `/api` 反代 |
| [`deploy/.env.production.example`](../../deploy/.env.production.example) | 生产环境变量模板 |
| [`workers/asr/README.md`](../../workers/asr/README.md) | FunASR venv 细节 |
| 仓库根 [`.env.example`](../../.env.example) | 开发用变量说明（含 `HOST`） |
