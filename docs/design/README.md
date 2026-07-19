# 产品设计

本目录是**本产品要做成什么样**的设计真源，与 [reference/](./reference/)（别人怎么做 / 上游 clone）分离。

| 文件 | 内容 | 状态 |
|---|---|---|
| [vision.md](./vision.md) | 用户、路径、完成边界 | 已按 CPU+LLM 填写 |
| [architecture.md](./architecture.md) | 模块、部署草图、决策索引 | 方向锁定 |
| [roadmap.md](./roadmap.md) | 阶段 | D0 完成 |
| [slices.md](./slices.md) | 垂直切片 | S1/S2 planned |
| **[DESIGN.md](./DESIGN.md)** | **UI 真源（Claude）** | ADR 0002 |
| [reference/](./reference/) | catalog · product · asr · ui · repos | 已整理 |
| [research/](./research/) | 调研与选型备忘 | 已有 |
| **[prototype/mvp/](./prototype/mvp/)** | **可点击静态原型（开发/验收对照）** | Claude · 非生产 |

**阅读顺序：** vision → DESIGN → **prototype/mvp**（看交互）→ architecture → slices → roadmap。  
**工程进度：** [`docs/progress/`](../progress/)。  
**领域词：** [`CONTEXT.md`](../../CONTEXT.md)。  
**ADR：** [`docs/adr/`](../adr/)。  
**PRD：** [`.scratch/meeting-record-mvp/spec.md`](../../.scratch/meeting-record-mvp/spec.md)。

## 与 multi-agent 的差异（有意）

| multi-agent | 本仓 |
|---|---|
| 根目录 `design/` + `references/repos` | 设计在 `docs/design/`；clone 在 `docs/design/reference/repos/` |
| superpowers 树 | 不引入 |
| 后期 main 直推 | **main 直推**（ADR 0008） |
