# S6a: Minutes Visual Board（LLM-only，按钮分离）

**Date:** 2026-07-21  
**Scope:** 纪要图解总览

## Product decisions

- 图解 **仅 LLM** 生成，**无 heuristic 降级**
- 按钮分离：**重新生成纪要** / **生成·重新生成图解**
- 纪要页 **预设图解位**（占位 / 骨架 / 结果）
- 重生纪要 **保留** 旧图解

## Implemented

- `POST /api/meetings/:id/minutes/visual`
- `services/visualBoard.ts`：prompt + normalize/validate
- UI：`MinutesVisualSlot` + CSS 卡片渲染
- 导出 MD/PDF 附加「图解总览」纯文本（若有）
- 测试：`visual-board.test.ts`

## User

1. 配置 LLM（设置页或 env）
2. 先有纪要
3. 纪要 Tab 顶部图解位 → **生成图解**
4. 成功后渲染；失败显示错误文案

## Verify

```
cd app/server && pnpm exec tsx --test src/visual-board.test.ts src/meetings.test.ts
cd app/web && pnpm exec tsc --noEmit
```
