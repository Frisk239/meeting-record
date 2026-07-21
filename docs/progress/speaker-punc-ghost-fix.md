# Fix: 说话人标点鬼影（Speaker 1/2 几乎全是 ，。？）

**Date:** 2026-07-20  
**Scope:** FunASR diarization post-process + SenseVoice spk_mode

## Symptom

- 原文 Tab：Speaker 0 有正文；Speaker 1 / Speaker 2 大量只有 `，` `。` `？`
- 真库 `mtg_b70c…`：1124 段中 **1051 段纯标点**；真实正文仅约前 5 分钟时间轴（85 分钟会）

## Root cause

1. 默认 `spk_mode=punc_segment` + SenseVoice **无可靠字级 timestamp** 时，仍可能走 `timestamp_sentence`
2. 文本 token 与 punc/timestamp 流不对齐时，补丁版 `timestamp_sentence` 在空文本槽上 **按标点切句** → 产出纯标点 `sentence_info`
3. CAM++ `distribute_spk` 给这些鬼影句分配 Speaker 1/2 → UI 筛选出现「说话人只有逗号」

## Fix

1. `workers/asr/funasr_patches.py`
   - 中文 punc 字符用 Unicode 转义（防文件编码损坏）
   - 文本与 timestamp 优先 **按字对齐**
   - **禁止** 产出纯标点 sentence；空槽标点最多贴到上一句字符，不吞后续时间轴
2. `workers/asr/worker.py`
   - SenseVoice 默认 `spk_mode=vad_segment`（可用 `FUNASR_SPK_MODE` 覆盖）
   - `parse_funasr_result` → `_finalize_segments` **丢弃纯标点段**
3. `.env.example` / `workers/asr/README.md`：文档化 `FUNASR_SPK_MODE`

## Evidence

```
workers/asr/.venv/Scripts/python.exe workers/asr/test_speaker_punc_bug.py
# 3/3 passed
```

Parser on prod-shaped fixture: 1124 → 73 real segments, speakers {Speaker 0:72, Speaker 1:1}, pure_punc=0.

## User action

已有会议 **必须「重新转写」**（纯标点清理只能去掉鬼影，**不能恢复**被错误时间轴挤掉的后半场正文）。  
新转写走 SenseVoice + `vad_segment` + 纯标点过滤。

## Deferred

- 长会 soak：多说话人 VAD 分段质量
- 可选：库内一键清理纯标点段（不替代 retranscribe）
