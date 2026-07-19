# ADR 0008 — 单人交付：main 直推；Issue 非必选

本仓为**单人**产品。默认允许在 **`main` 上开发、commit、并 `git push origin main`**（人授权的简化路径）。  
**GitHub Issue 不是开工前置条件**：PRD/规格以仓库内文档为准（当前 MVP 真源：`.scratch/meeting-record-mvp/spec.md` + `docs/design/*` + ADR）。Issue 仅在需要远端协作、公开看板或 Matt skill 强制 publish 时可选使用。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（工程）  
- **Supersedes in part:** ADR 0001 §合码「默认 feat + 人合」、merge.md 旧默认

## Context

Matt `to-spec` 默认把 PRD 发到 issue tracker，便于多智能体/多会话认领。用户质疑：单人直接 main 开发推送即可，何必 Issue。与 multi-agent 仓后期「main 直推」一致，且更贴当前现实（gh token 也曾失效）。

## Decision

1. **合码默认 = main 直推**（可 commit + push main）。  
2. **`feat/*` 可选**：大实验、并行试错、或需要隔离审查时再用。  
3. **规格真源：** 仓库 Markdown（vision/CONTEXT/ADR/`.scratch/.../spec.md`）；不强制 GitHub Issue。  
4. 关刀仍写 **progress 证据**（`docs/progress/`），不因 main 直推而省略自测记录。  
5. 密钥、大模型权重、用户数据仍不进 git。

## Consequences

### Positive

- 少仪式、与单人节奏一致。  
- 不依赖 `gh` 可用性也能推进。

### Trade-offs

- 失去「强制 PR 审查闸门」；靠自测 progress + 可选 code-review 补。  
- main 历史更忙；需要时可用 feat 分支冷静试验。
