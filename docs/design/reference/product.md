# 产品壳参考

> 对应 clone：`repos/meetily` · `repos/zabt-ai` · `repos/anarlog`  
> 本仓目标形态：单人可用的「上传/录音 → 转写 → LLM 纪要 → 编辑导出」，非企业套件。

## meetily（最高优先）

| | |
|---|---|
| 路径 | `repos/meetily` |
| 学什么 | 会议录音/导入、本地转写、**Ollama / 云 LLM 总结**、隐私默认本地（说话人 UX 可选学，非本仓 P0） |
| 不直接抄 | Tauri/Rust 全家桶（除非以后做桌面端）；默认 Parakeet/大模型假设 |
| 先读 | 根 README · 文档目录（若有 docs/）· 总结 provider 相关代码 |

**对本仓：** 功能清单与「转写后接 LLM」的产品叙事最接近；实现语言可不同。

## zabt-ai（服务端骨架）

| | |
|---|---|
| 路径 | `repos/zabt-ai` |
| 学什么 | `docker compose` 单机：API + Worker + 存储；上传 → 队列 → 转写 → 总结；**CPU-only compose** 注释 |
| 慎抄 | 默认 faster-whisper + **pyannote**（我们说话人非 P0）；Supabase 等账号栈可按需简化 |
| 先读 | README · `docker-compose*.yml` · `.env.example` · worker/转写入口 |

**对本仓：** 4C8G 上「轻 Web + 串行 Worker」可对标其拓扑，**引擎换成 SenseVoice/FunASR**。

## anarlog（极简）

| | |
|---|---|
| 路径 | `repos/anarlog` |
| 学什么 | 一文一会、markdown 落盘、BYO LLM、低仪式感 |
| 不抄 | 当作唯一架构（缺队列/多会管理时不够） |

**对本仓：** 第一版数据模型可以「一场会一个文件夹/一条记录」这么简单。
