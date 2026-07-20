# Fix: 原文页乱码（UTF-8 pipe）

**Date:** 2026-07-20  
**Scope:** ASR worker stdout encoding + retranscribe recovery

## Symptom

- 详情页「原文」全是 `��` / 方框乱码；Speaker / 时间轴正常。
- 「纪要」中文可读（LLM 结合标题 + 部分可恢复字元/语义猜测，**不代表原文入库正确**）。
- SQLite `transcript_segments.text` 大量 `U+FFFD`（`EF BF BD`），**不可逆**。

## Root cause

Windows 默认控制台代码页为 **GBK**。FunASR worker 用 `print(json.dumps(..., ensure_ascii=False))` 时，若 stdout 未强制 UTF-8，中文以 **GBK 字节**写出；Node `spawn` 侧按 **UTF-8** 解码 → 大量替换字符 `U+FFFD`，再写入 SQLite。

短样例（达摩院 wav / smoke DB）曾正确，是因为当时环境碰巧 UTF-8 或文本极短；长会议 m4a 任务上复现。

**不是** React 显示层字体问题；**不是** libsql 存储问题。

## Fix

1. `workers/asr/worker.py`
   - `PYTHONIOENCODING=utf-8` / `PYTHONUTF8=1`
   - `sys.stdout/stderr.reconfigure(encoding="utf-8")`
   - `emit_json()` → `sys.stdout.buffer.write(utf-8 bytes)`（不依赖控制台代码页）
2. `app/server/src/services/asr/funasr.ts`
   - spawn env 强制 `PYTHONIOENCODING` / `PYTHONUTF8`
   - stdout/stderr 按 Buffer UTF-8 解码
   - 解析后若文本 `U+FFFD` 占比 > 25% 则 **失败**（避免再写坏库）
3. 恢复路径：`POST /api/meetings/:id/jobs/retranscribe` + 原文 Tab「重新转写」  
   对已有录音重跑 ASR（无需重传文件）；成功后 Auto Minutes 会再跑。

## Evidence

```
pnpm exec tsx --test src/asr-funasr.test.ts
# 4 pass: speakers, mass-FFFD reject, self-test-parse 你好, gbk-env still UTF-8
```

Worker under `PYTHONIOENCODING=gbk` still emits UTF-8 `你好` (`e4bda0e5a5bd`).

## User action (corrupted meetings)

1. 重启后端（加载新 funasr.ts）。
2. 打开乱码会议 → **原文** → **重新转写**（或重传同一音频）。
3. 等 FunASR 完成；确认原文中文正常后纪要会自动重生。

已入库的乱码段落 **无法解码还原**，必须重跑 ASR。

## Deferred (user)

- 智在式更深纪要结构与细节
- 图表总结 / 思维导图（下一阶段）
