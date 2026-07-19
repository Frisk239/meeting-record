# Evidence: FunASR real-wav Job (CPU)

**日期：** 2026-07-19  
**Slug：** `s1b-funasr-sidecar` 补证  
**不 push：** 按人要求本地 commit 即可。

## 命令

```bash
# workers/asr venv 已装 funasr + torch CPU
export ASR_ENGINE=funasr
export ASR_WORKER_PYTHON=workers/asr/.venv/Scripts/python.exe
export ASR_WORKER_SCRIPT=workers/asr/worker.py
# from app/server:
pnpm exec tsx src/smoke-funasr.ts
```

样本：`docs/design/reference/repos/FunASR/runtime/funasr_api/asr_example.wav`（约 5.5s 中文）

## 结果（TS 串行 Job 全路径）

```json
{
  "ok": true,
  "meetingStatus": "ready",
  "jobStatus": "succeeded",
  "engine": "funasr",
  "errorMessage": "",
  "minutesStatus": "ready",
  "segmentCount": 1,
  "speakers": ["Speaker 0"],
  "segments": [
    {
      "speaker": "Speaker 0",
      "startMs": 940,
      "endMs": 4900,
      "text": "欢迎大家来体验达摩院推出的语音识别模型。"
    }
  ]
}
```

| 断言 | 结果 |
|---|---|
| `engine === "funasr"` | **是**（非 mock） |
| 真中文文本（非 mock 话术） | **是** |
| Speaker 标签字段 | **有**（本样本为单说话人 `Speaker 0`） |
| 时间码 | **940–4900 ms** |
| Auto Minutes 仍触发 | `minutesStatus: ready` |
| 串行队列 + 磁盘音频 | 上传 → Job → 旁路 worker |

## Worker 直调（同一音频）

```json
{
  "status": "succeeded",
  "engine": "funasr",
  "segments": [
    {
      "speaker": "Speaker 0",
      "startMs": 940,
      "endMs": 4900,
      "text": "欢迎大家来体验达摩院推出的语音识别模型。"
    }
  ],
  "model": "iic/SenseVoiceSmall",
  "vad": "fsmn-vad",
  "spk": "cam++"
}
```

## 注记

- 首跑下载 SenseVoice / VAD / CAM++ / ct-punc 模型；后续 RTF≈0.08（本机日志）。  
- 本样例为**单人**宣传音，故仅 Speaker 0；多说话人会议在 cam++ 开启时会出 Speaker N（parser 已覆盖 sentence_info）。  
- 已修：时间戳勿把 ms 当秒；剥离 SenseVoice `<|...|>` 标签；默认挂 `ct-punc` 改善 diarization 分段。

## 与北极星

**CPU 串行转写 + 说话人标签字段 + 真文本** 已在真栈 Job 路径验收。默认 `ASR_ENGINE` 仍可为 mock 方便开发；生产设 `funasr`。
