# repos/ — 上游源码（只读）

每个子目录是独立 `git clone`，**不要在这里改上游代码**。

本目录默认被根 `.gitignore` 忽略，避免把他人完整仓库推进本仓。

| 目录 | 上游 |
|---|---|
| meetily | https://github.com/Zackriya-Solutions/meetily |
| FunASR | https://github.com/modelscope/FunASR |
| SenseVoice | https://github.com/FunAudioLLM/SenseVoice |
| whisper.cpp | https://github.com/ggml-org/whisper.cpp |
| faster-whisper | https://github.com/SYSTRAN/faster-whisper |
| zabt-ai | https://github.com/afeef/zabt-ai |
| anarlog | https://github.com/fastrepl/anarlog |
| awesome-design-md | （设计样本集；以该仓 README 为准） |

更新示例：

```bash
cd docs/design/reference/repos/meetily && git pull --ff-only
```
