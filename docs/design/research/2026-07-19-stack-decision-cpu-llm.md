# 选型锁定：单人 CPU 转写 + LLM 总结

- **Date:** 2026-07-19  
- **Status:** Accepted  
- **Constraints:** 无 GPU · 约 4 核 8G · **仅单人使用**

## Decision

| 层 | 选择 |
|---|---|
| 部署 | 单机自托管（Web + 串行 Worker；或本机） |
| 转写 (ASR) | **CPU 开源**：优先 **FunASR / SenseVoice**；备选 whisper.cpp / faster-whisper small·int8 |
| 说话人分离 | **非 P0** |
| 纪要 | **LLM 总结**（OpenAI 兼容 API 或 Ollama；输入为**转写文本**） |
| 不做默认 | MOSS · large-v3 实时 · WhisperX+pyannote 全家桶 |

## Why

- 无显卡时端到端大模型与 heavy diarization 不现实。  
- 单人并发 ≈ 1，CPU 队列足够。  
- LLM 只处理文本，算力与费用远低于 ASR。

## Reference layout

上游 clone 与笔记：[`docs/design/reference/`](../reference/README.md) · 总览 [`catalog.md`](../reference/catalog.md)

## Canonical ADR

本决策已提升为 **[ADR 0003](../../adr/0003-cpu-asr-and-llm-summary.md)**。UI 另见 **[ADR 0002](../../adr/0002-ui-design-claude.md)**。
