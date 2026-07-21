# ASR Worker (FunASR · CPU)

Python **sidecar only** (ADR 0009). TypeScript owns the product API and serial job queue; this process runs FunASR:

**SenseVoiceSmall + fsmn-vad + cam++ · `device=cpu`** (ADR 0004).

## Setup (4C4G)

```bash
cd workers/asr
python -m venv .venv

# Windows Git Bash:
source .venv/Scripts/activate
# Linux/macOS:
# source .venv/bin/activate

# CPU torch first (recommended)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

First run downloads models from ModelScope/HF — keep disk free and patience.

### Audio formats

Worker **always** converts input to a temp **16 kHz mono WAV** before FunASR
(avoids Windows `WinError 2` on webm/mp3 and odd paths). Decoding order:

1. `soundfile` (wav/flac/ogg…)
2. `librosa` / audioread (needs **ffmpeg on PATH** for mp3/webm/m4a)
3. `torchaudio`

Install ffmpeg on Windows (example):

```bash
winget install Gyan.FFmpeg
# or choco install ffmpeg
# then restart the terminal so PATH updates
```

## CLI

```bash
# Parser smoke (no model download)
python worker.py --self-test-parse

# Transcribe one file → JSON on stdout
python worker.py --audio /path/to/meeting.wav

# Long-lived JSON-lines (used by Node optional serve mode)
python worker.py --serve
```

## Env (optional)

| 变量 | 默认 |
|---|---|
| `FUNASR_MODEL` | `iic/SenseVoiceSmall` |
| `FUNASR_VAD` | `fsmn-vad` |
| `FUNASR_SPK` | `cam++`（空字符串 = 不加载说话人） |
| `FUNASR_SPK_MODE` | 空=自动（SenseVoice→`vad_segment`；其它有 punc→`punc_segment`） |
| `FUNASR_DEVICE` | `cpu` |
| `FUNASR_HUB` | `ms` |
| `ASR_NCPU` | `4` |

## App config

In repo root `.env`:

```env
ASR_ENGINE=funasr
ASR_WORKER_PYTHON=workers/asr/.venv/Scripts/python.exe   # or python3
ASR_WORKER_SCRIPT=workers/asr/worker.py
# optional absolute override:
# ASR_WORKER_CMD=D:\code\meeting-record\workers\asr\.venv\Scripts\python.exe D:\code\meeting-record\workers\asr\worker.py
```

If the worker is missing or fails, the job is **failed** (or set `ASR_FALLBACK_MOCK=true` to degrade to mock — off by default when `ASR_ENGINE=funasr`).

## Memory

Only **one** transcription job at a time (enforced by the Node queue). Do not run a local heavy LLM while FunASR is loading models on 4G RAM.
