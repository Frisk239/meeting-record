# E2E / path smoke — MVP main path

**日期：** 2026-07-19  

## Must 路径

注册/登录 → 导入或录音 → Job → 纪要 → 导出 → 追问 → 外脑显式生成

## 证据 A — API 全路径（mock ASR）

脚本一次性跑通（本机执行结果）：

```json
{
  "ok": true,
  "segments": 4,
  "minutesStatus": "ready",
  "engine": "mock"
}
```

覆盖：register → upload → wait job → transcript → auto minutes → export.md → qa → insights/generate。

另：`pnpm test` **10/10**。

## 证据 B — Playwright CLI（UI）

| 步骤 | 结果 |
|---|---|
| 打开 `http://127.0.0.1:5173` | 登录页 Meeting Record |
| 注册 `pwuser1` | 进入 `/` 笔记空态 |
| 导航「我的」 | 账号 + LLM 三字段 |
| 导航「录音」 | 计时 00:00 · 开始录音 · 长按结束文案 |

**缺口：** `playwright-cli upload` 需文件选择器 modal state，未在 CLI 里完成隐藏 file input 导入；上传/Job 以 **API 证据 A** 与单测为准。

## 证据 C — FunASR 旁路

| 检查 | 结果 |
|---|---|
| `workers/asr` venv + `funasr` import | **ok**（本机已装） |
| `python worker.py --self-test-parse` | **ok**（契约） |
| 真 wav 端到端 generate | **未在本刀跑满**（首下模型耗时长）；接线已合 main |

## 结论

产品主路径在真栈可演示；真 ASR 依赖部署时 `ASR_ENGINE=funasr` + venv。Playwright 覆盖注册与主导航；转写链路以 API/单测为硬证据。
