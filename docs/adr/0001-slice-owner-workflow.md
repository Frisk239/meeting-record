# ADR 0001 — Slice Owner 工作流（无 superpowers / 无双角色）

Slice Owner 为一会话一厚垂直切片：intake → short-align → implement → 证据 → push `feat/*` → 人合 main → 关刀。不采用 superpowers 计划树，不采用计划者/执行者双角色；满血 grill 仅用于领域与难逆决策，调研默认外包。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（产品/工程）

## Context

新仓 `meeting-record` 从空目录起步。可参考同作者的 `multi-agent` 文档架构，但该仓带有 **superpowers 历史路径**，且后期授权过 **main 直推**。新仓明确：**不再使用 superpowers**，**保留 Slice Owner 执行模式**，并希望前期文档一次做对。

Matt skills 已配置：GitHub Issues、默认 triage 标签、single-context domain docs。

## Decision

1. **默认编排 = Slice Owner**（见 `docs/agents/workflow.md`），硬顺序与 skill `/slice-owner` 一致。  
2. **不引入** `docs/superpowers/` 或计划者/执行者双角色。  
3. **合码：** 初值曾为 feat + 人合；**已由 [ADR 0008](./0008-solo-mainline-delivery.md) 改为默认 main 直推**（单人简化）。  
4. **文档布局：**  
   - 宪法 `AGENTS.md` · 领域/方位 `CONTEXT.md`  
   - 产品设计 `docs/design/`（含 `reference/` 只读参考）  
   - 工程约定 `docs/agents/` · 难逆决策 `docs/adr/`  
   - 切片证据 `docs/progress/`（尚无 `app/` 时）；本地草稿 `.scratch/`  
5. **grill：** 立项与领域用 `/grill-with-docs`；日常切片默认短对齐。  
6. **tracker：** GitHub Issues 为发布面；`.scratch` 可作草稿。

## Consequences

### Positive

- 与当前技能栈一致，Slice Owner 能发现路径。  
- 无 superpowers 双轨文档，减少真源分裂。  
- feat + 人合提供最小偏见隔离，绿场更安全。

### Trade-offs

- 比 main 直推多一步人合并。  
- `docs/progress/` 与未来 `app/.progress/` 可能迁移一次——届时改 AGENTS/workflow 一行约定即可。

## Alternatives considered

| 方案 | 为何未选 |
|---|---|
| 照搬 multi-agent + superpowers 树 | 用户明确不用 superpowers |
| 默认 main 直推 | 绿场缺少 CI/习惯时风险更高；需要时人可授权例外 |
| 仅本地 `.scratch` 不做 GitHub Issues | 本仓 remote 已在 GitHub 且 setup 已选 gh |
