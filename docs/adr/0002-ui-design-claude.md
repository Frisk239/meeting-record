# ADR 0002 — UI 视觉真源采用 Claude DESIGN.md

本仓产品 UI 以 Claude 暖色编辑气质为唯一主参考：奶油画布、珊瑚主色、人文 sans/serif 层级。真源文件为 `docs/design/DESIGN.md`（自 awesome-design-md 的 claude 样本采纳并加本仓适配说明）。不混用第二品牌设计体系。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（产品）

## Context

立项参考集 `awesome-design-md` 含 70+ 品牌 DESIGN.md。会议纪要产品需要长时间阅读转写与结构化纪要，适合暖浅底与克制强调色，而非消费营销强对比或深色极客工具默认。

用户明确选择 **Claude 风格**（非 Notion / Linear）。

## Decision

1. 将 Claude 样本复制为 **`docs/design/DESIGN.md`**，并增加「本仓适配」表（列表 / 转写长文 / 纪要 CTA / 进度态）。  
2. 实现与 AI 生成 UI **只认** 该文件；`repos/awesome-design-md` 仅作样本库只读。  
3. 字体可按中文环境回退（见 DESIGN.md 适配段）；色板与圆角等 token 保持 Claude 体系。  
4. 需要改气质时修订 DESIGN.md 或新开 ADR supersede，不在代码里另起一套无名 token。

## Consequences

### Positive

- UI 决策有单一真源，避免「每个切片换一种风格」。  
- 与「AI 助手 + 长文」心智一致，适合纪要阅读。

### Trade-offs

- 上游 Claude 营销页偏 serif display；应用内须遵守适配表，否则过「落地页化」。  
- 与 meetily 等深色产品壳参考在视觉上不必一致——产品壳学交互，视觉跟 DESIGN.md。
