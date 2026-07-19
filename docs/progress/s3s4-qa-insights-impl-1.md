# Closeout: s3s4-qa-insights

**日期：** 2026-07-19  
**分支：** `main`  
**Slug：** `s3s4-qa-insights`

## 用户路径

1. **S3：** 纪要 Tab 右下角「追问」→ 子页多轮问答（基于本场转写/纪要 Context Pack；无自动灌屏）  
2. **S4：** 详情「外脑」Tab → **仅显式**点「一键生成」；转写成功不自动生成  

## 交付

- 表 `qa_messages`；`meetings.insights_status|insights_markdown`  
- API：`GET/POST /api/meetings/:id/qa` · `GET/POST .../insights`  
- UI：`/meetings/:id/qa` · 纪要 FAB · 外脑生成按钮  
- mock LLM 路径可演示  

## 证据

`pnpm test` 8/8（含 QA + insights 生成）；typecheck / web build 绿  

## 不做 / 债务

- 真 FunASR；PDF CJK 字体依赖本机 TTF；Playwright 未跑；Digest 缓存表未建  

## 下一刀

polish：真 ASR 旁路、播放器、Speaker 改名、Playwright 主路径  
