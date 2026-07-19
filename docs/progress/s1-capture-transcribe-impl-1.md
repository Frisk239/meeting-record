# Closeout: s1-capture-transcribe

**日期：** 2026-07-19  
**分支：** `main`  
**Slug：** `s1-capture-transcribe`

## 用户路径（Must）

登录 → **导入音频或浏览器录音**（点开始 / 长按结束 / 自动上传）→ 服务端串行 Transcription Job → **原文页**可见带 **Speaker** 与时间码的段落 → 列表展示状态。

## 交付

### 数据模型（SQLite）

`meetings` · `recordings` · `transcription_jobs` · `transcript_segments`（均带 `user_id` 或经 meeting 归属隔离）

### API

| 端点 | 行为 |
|---|---|
| `GET /api/meetings` | 当前用户列表 |
| `POST /api/meetings` | 空会议（可选） |
| `GET /api/meetings/:id` | 详情 + jobs + transcript |
| `PATCH /api/meetings/:id` | 改标题 |
| `POST /api/meetings/upload` | multipart `file` + 可选 `meetingId`/`title`/`source` → 落盘 + 入队 |

### 队列 / ASR

- 进程内 **串行** `queue`（同时仅 1 running）  
- **Pipeline port：** `services/asr`（`AsrEngine.transcribe`）  
- **默认 `ASR_ENGINE=mock`：** 产出多 Speaker 段落（不依赖 Python/FunASR）  
- 音频：`DATA_DIR/media/<userId>/…`

### UI

- 笔记列表 + 导入 + 状态 pill + 轮询  
- 录音页：getUserMedia · 暂停/丢弃 · **长按 ~0.8s 结束并上传**  
- 详情：纪要/原文/外脑 Tab；原文按时间/说话人；处理中轮询  

### 不做

- 真 FunASR/CAM++  
- Auto Minutes / 导出 / 追问 / 外脑生成  
- 播放器精确 seek  

## 证据

| 检查 | 结果 |
|---|---|
| `pnpm test` | **8/8**（auth 5 + meetings/upload/IDOR 3） |
| `pnpm typecheck` | 绿 |
| 路径 | 测试覆盖 upload → job succeeded → transcript speakers；UI 需本机 mic/HTTPS 手测录音手势 |

## 债务

1. FunASR Python 旁路尚未接线（port 已留）  
2. mock 非真实语音识别  
3. Playwright E2E 未跑  
4. SQLite 驱动仍为 `@libsql/client`（S0b 债务）

## 演示

```bash
pnpm dev
# 登录 → 导入任意小音频 或 录音页长按结束 → 打开会议 → 原文 Tab
```

## 下一刀建议

**S2 纪要通路**：Job 成功后 Auto Minutes（Chat Completions + Context Packer 雏形）+ 可编辑 + 导出 MD/PDF。
