# Fix: PDF 导出中文变成问号

**Date:** 2026-07-20  
**Scope:** pp/server PDF export

## Symptom

导出 PDF 能下载，但中文纪要显示为 ????，或整页几乎无中文。Markdown 导出正常。

## Root cause

pdf-lib 嵌入自定义 TTF 前必须 PDFDocument.registerFontkit(fontkit)。  
旧代码未注册 @pdf-lib/fontkit，embedFont(system TTF) 全部抛错并被吞掉 → 回退 Helvetica → 非 ASCII 被 sanitize 成 ?。

本机其实有 simhei.ttf / simfang.ttf / Deng.ttf 等可用字体；.ttc（如 msyh.ttc）仍不支持。

## Fix

1. 依赖：@pdf-lib/fontkit
2. export.ts：pdf.registerFontkit(fontkit) 后嵌入 CJK TTF；subset 失败则 full embed
3. 扩充 Windows 候选字体；支持 PDF_CJK_FONT 环境变量
4. 回归：src/export-pdf.test.ts 断言能嵌入系统 CJK 并绘制中文

## Evidence

`
cd app/server
pnpm exec tsx --test src/export-pdf.test.ts
# 2/2 pass
pnpm exec tsx --test src/meetings.test.ts
# 4/4 pass (export.pdf still 200 + %PDF)
`

## User action

重启 API 服务后，打开会议详情 → **导出 PDF**。  
中文应可读。若仍无中文：设置 PDF_CJK_FONT=C:\\Windows\\Fonts\\simhei.ttf 后重启。
