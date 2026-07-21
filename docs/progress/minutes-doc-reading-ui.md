# UI: 纪要 Tab 文档化阅读（禁左右滑）

**Date:** 2026-07-20  
**Scope:** `app/web` 会议详情 · 纪要 Tab

## Problem

纪要长字段用单行 `input`，手机/窄屏只能在输入框内左右滑动，阅读体验差。

## Direction

对齐智在式「AI 总结」阅读流：

- 默认 **纵向文档阅读**（标题居中、分区标题+下划线、自动换行正文）
- 长字段不再塞进单行 input
- **编辑** 模式才进入表单；参与主体/目标/要点/时间轴用 `textarea` 全宽换行
- 待办在窄屏纵向堆叠，避免横排挤出

## Files

- `app/web/src/pages/MeetingDetailPage.tsx`
- `app/web/src/styles.css`

## Verify

```
cd app/web && pnpm exec tsc --noEmit
```
