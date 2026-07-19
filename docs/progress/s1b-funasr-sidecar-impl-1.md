# Closeout: s1b-funasr-sidecar

**日期：** 2026-07-19  
**分支：** `main`  
**Slug：** `s1b-funasr-sidecar`

## 用户路径（Must）

配置 `ASR_ENGINE=funasr` + Python venv → 导入/录音上传 → 串行 Job 调 **FunASR CPU 旁路**（SenseVoiceSmall + fsmn-vad + cam++）→ 原文出现 **真引擎产出的** Speaker/时间/文本（非 mock 话术）。

## 交付

| 产物 | 路径 |
|---|---|
| Python worker | `workers/asr/worker.py` · `requirements.txt` · `README.md` |
| TS engine | `app/server/src/services/asr/funasr.ts` · `getAsrEngine()` 分支 |
| 配置 | `ASR_ENGINE` · `ASR_WORKER_PYTHON` · `FUNASR_*` · `ASR_FALLBACK_MOCK` |
| 契约测试 | `asr-funasr.test.ts`（JSON 解析 + `python worker.py --self-test-parse`） |

- 默认仍 **`ASR_ENGINE=mock`**，开发机无 venv 可跑。  
- `funasr` 失败时默认 **Job failed**（不静默 mock）；可选 `ASR_FALLBACK_MOCK=true`。  
- 串行队列不变（4C4G）。

## 证据

| 检查 | 结果 |
|---|---|
| `pnpm test` | 含 funasr 契约；全量应绿 |
| `python workers/asr/worker.py --self-test-parse` | 不下载模型 |
| 真模型推理 | **本机关刀时可能未装 funasr/torch**；接线已落地，首次 `pip install` + 模型下载后验收 |

## 不做

- 不把 FunASR 写进 Node 进程  
- 不默认 GPU / pyannote  
- 不在 CI 强制下载 GB 级模型  

## 演示

```bash
cd workers/asr && python -m venv .venv && source .venv/Scripts/activate  # Win
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
# 根 .env:
# ASR_ENGINE=funasr
# ASR_WORKER_PYTHON=workers/asr/.venv/Scripts/python.exe
pnpm dev
# 导入 wav → 原文应见 funasr engine + 真实文本（首跑很慢）
```

## 下一刀建议

Playwright 主路径 · 原文播放 · 4G 机 RTF/RSS 实测记录  
