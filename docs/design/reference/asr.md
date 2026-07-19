# 转写引擎参考（CPU）

> 对应 clone：`repos/FunASR` · `repos/SenseVoice` · `repos/whisper.cpp` · `repos/faster-whisper`  
> **默认路线：** FunASR 工具链 + **SenseVoice（或同等轻量）+ FSMN-VAD + CAM++**（中文 CPU，**含说话人 P0**）；whisper 系为备选 ASR。  
> **硬件上限：** **4 核 4G RAM** 无 GPU；见 [ADR 0004](../../adr/0004-speaker-diarization-p0-cpu.md)。

## FunASR

| | |
|---|---|
| 路径 | `repos/FunASR` |
| 学什么 | 模型选型（SenseVoice / Paraformer…）、VAD、标点、可选说话人 pipeline、服务化/OpenAI 兼容接口叙事 |
| 本仓用法 | **主工具箱**；在 4C8G 上以 SenseVoice（及 GGUF/llama.cpp 运行时文档）为主 |
| 先读 | README · SenseVoice 相关 example · `runtime/llama.cpp`（若存在） |

## SenseVoice

| | |
|---|---|
| 路径 | `repos/SenseVoice` |
| 学什么 | 推理 API、语言/情感标签、**CPU / GGUF** 部署说明 |
| 本仓用法 | **默认 ASR 模型候选** |
| 注意 | 「谁在说」= FunASR 侧 **VAD+CAM++** 组合，**不是** Small 单模型输出；**P0 必须组合**（ADR 0004） |

## whisper.cpp

| | |
|---|---|
| 路径 | `repos/whisper.cpp` |
| 学什么 | 纯 C++ 部署、量化、内存表（tiny→large）、无 Python 依赖的边界运行 |
| 本仓用法 | 备选引擎；中文效果预期弱于 SenseVoice 档，多语/英语场景有用 |

## faster-whisper

| | |
|---|---|
| 路径 | `repos/faster-whisper` |
| 学什么 | Python 集成、CPU int8、batch、与 openai/whisper 的性能差 |
| 本仓用法 | 备选；若 Python Worker 已存在可快速接入 `small`/`base` |

## 4 核 4G 操作约定（本仓）

1. 同时只跑 **1** 个 Transcription Job（含 diarization）。  
2. ASR 用 **SenseVoiceSmall / 同等轻量**；**必须**挂 `fsmn-vad` + `cam++`（可用时）；`device=cpu`。  
3. Web + Worker 同机：Worker 跑时其它重进程让路；**总结优先外部 LLM API**，勿与 ASR 同时占满 4G。  
4. 长会接受更长批处理延迟；进度 UX 必做。  
5. OOM/失败：可降级「仅 ASR、无 Speaker」，但默认路径以有 Speaker 为准。  
6. **上线前在 4G 机实测** RTF 与峰值 RSS；不通过则再缩模型，不默默改回「无说话人」。