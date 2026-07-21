# Polish: PDF 导出排版

**Date:** 2026-07-21  
**Scope:** `app/server/src/services/export.ts`

## Problem

PDF 几乎是 Markdown 源码直出：

- 顶部 YAML frontmatter（title/app/exportedAt）原样打印  
- `**加粗**` 星号、任务列表方框残留  
- 列表 `•` 在部分 CJK 字体变成 □  
- 无标题层级、页脚、分节线

## Fix

1. **PDF 不走 MD 字符串直绘**：优先用结构化 `MinutesDoc` 排版；无结构时再 parse Markdown blocks  
2. 去掉 YAML frontmatter；`stripMdInline` 清理 `**` / `_` / 链接等  
3. 文档样式：品牌头 + 导出时间、H1 珊瑚下划线、H2 分节线、中点项目符号、引用块左边条  
4. 页脚页码；续页小标题  
5. 测试：`export-pdf.test.ts` 覆盖 frontmatter / inline strip / block parse

## Verify

```
cd app/server
pnpm exec tsx --test src/export-pdf.test.ts src/meetings.test.ts
# 8/8 pass
```

## Follow-up (2026-07-21)

- 去掉 H2 / 页眉 / 分隔 `---` 的硬分割线，仅保留间距
- PDF / MD 导出：若已显式生成外脑则附加「AI 外脑」；未生成不出现空段
- HTML 外脑内容转为纯文本块再排版

## User action

重启 API → 会议详情 → **导出 PDF** 重新下载。
