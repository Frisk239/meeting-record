# 源码深读笔记

对 `repos/` 的 **带 file:line 索引** 的阅读笔记。  
动手实现某层前，优先写/读对应笔记，避免在实现会话里灌上游全文。

## 约定

- 一项目一文件：`deep/<name>.md`（例：`meetily.md`、`funasr-sensevoice.md`）
- 结构建议：结论摘要 → 关键路径（path:line）→ 与本仓差异 → 可抄 / 不抄
- **尚未深读的项目不必占位空文件**；需要时再加

## 现状

| 文件 | 状态 |
|---|---|
| （暂无） | 克隆与 catalog 已就绪；首刀前按需补 meetily / FunASR 深读 |

## 建议优先深读顺序

1. `meetily` — 产品路径与总结接入  
2. `FunASR` + `SenseVoice` — CPU 转写落地  
3. `zabt-ai` — 仅当做 Web 队列拓扑时  
