# ADR 0003 — 单人 CPU 转写 + LLM 总结

部署与智能管线默认：**无 GPU**、**约 4 核 4G RAM**（以用户当前服务器为准）、**单人**使用；**CPU 开源 ASR**（优先 FunASR/SenseVoice，whisper 系备选）做会后批处理转写；**LLM**（优先 OpenAI 兼容 **API**；Ollama 可选且须与 ASR **错峰**）基于**转写文本**生成纪要/待办。

**说话人分离：** 已提升为 **P0**，见 **[ADR 0004](./0004-speaker-diarization-p0-cpu.md)**（FunASR VAD+CAM++，非「非 P0」）。  
**仍非默认：** MOSS 端到端、WhisperX+pyannote 重流水线、实时字幕 SLA。

- **Status:** Accepted（部分条款由 ADR 0004 修订）  
- **Date:** 2026-07-19  
- **Deciders:** 人（产品/工程）

## Context

服务器无显卡；用户规模先按一人。硬件以 **4C4G** 为设计上限（文档中曾写 8G 处以此为准收紧）。云 ASR 非首选；用户锁定 **自托管 CPU ASR + 接入 LLM 总结**，并要求 **说话人标签**。

## Decision

1. **ASR：** CPU；串行队列；默认 FunASR/SenseVoice 方向。  
2. **Speaker：** 见 ADR 0004。  
3. **LLM：** 总结/结构化；输入为文本；4G 机器上 **优先外部 API**，避免与 ASR 同时占满内存。  
4. **产品闭环 P0：** 导入 →（带 Speaker 的）转写 → LLM 纪要 → 编辑/导出。

## Consequences

### Positive

- 与真实硬件一致。  
- 成本可控。

### Trade-offs

- 4G + diarization 更慢；需进度与失败降级。  
- 本机大模型总结空间极紧。
