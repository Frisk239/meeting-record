# ADR 0004 — 说话人分离为 P0（CPU · FunASR CAM++）

首版产品 **P0 需要带说话人标签的转写**（`Speaker 0/1/…`）。实现默认走 **FunASR 组合流水线：ASR（SenseVoice/轻量中文模型）+ FSMN-VAD + CAM++**，在 **无 GPU · 4 核 · 4G RAM** 上 **CPU 批处理、串行单任务**。不靠 LLM 从无标签正文「听」出说话人；LLM 仅可在已有标签上写纪要或辅助改名。失败时可降级为无说话人全文，但产品默认路径以「有 Speaker」为准。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（产品）  
- **Relates:** 修订 [ADR 0003](./0003-cpu-asr-and-llm-summary.md) 中「说话人非 P0」条款

## Context

用户确认说话人识别很重要，并选 **P0 声学 diarization**。硬件更正为 **4 核 4G**（严于早期文档中的 8G 假设）。FunASR 官方支持 `spk_model="cam++"` 且 `device="cpu"`；CAM++ 参数量约 7.2M，适合与轻量 ASR 同机串行。SenseVoice 本身不输出说话人，须组合 VAD+CAM++。

## Decision

1. **P0：** Transcription 默认产出逐句（或分段）**Speaker id + 文本 + 时间**（能力范围内）。  
2. **引擎：** FunASR 流水线；优先 **SenseVoiceSmall（或同等轻量）+ fsmn-vad + cam++**，CPU。  
3. **资源：** 同时仅 1 个 Transcription Job；避免与重型本机 LLM 同时占满 4G（总结优先 **外部 LLM API**，Ollama 仅在错峰/更小模型时可选）。  
4. **命名：** 默认 `Speaker N`；用户重命名为 P1。  
5. **非默认：** pyannote/WhisperX 全家桶、MOSS、纯 LLM 分说话人。

## Consequences

### Positive

- 纪要可写「谁说了什么」，接近飞书/智在核心体验。  
- 与已选 FunASR 生态一致，不新开 GPU 依赖。

### Trade-offs

- 4G 上总耗时更长；长会需耐心与进度 UX。  
- 重叠说话、人多嘈杂时标签会错；需接受「可手改」。  
- 实测 OOM 风险：必须以 small/量化与串行为硬约束，上线前在 4G 机上 benchmark。
