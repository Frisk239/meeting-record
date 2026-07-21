# UI: 外脑渲染 + 追问会话缓存/历史

**Date:** 2026-07-20  
**Scope:** pp/web + pp/server QA / Insights

## Problems

1. 纪要区右侧无意义嵌套滚动条  
2. 外脑 Tab 用 <pre> 裸显 Markdown（含 `html 围栏）  
3. 追问页返回后看不到历史，要再发一问才带出旧记录  
4. 缺少新会话 / 会话历史管理

## Fixes

### 外脑
- MarkdownView 轻量渲染：标题/列表/加粗/引用/代码块
- 自动剥掉整篇  `html  围栏
- insights-doc 样式：纵向可读、无横向溢出

### 追问
- DB：qa_sessions + qa_messages.session_id；旧消息回填为「历史会话」
- API：GET /qa → { sessions, activeSessionId, turns }；POST /qa/sessions 新会话；POST /qa 带 sessionId
- 前端：sessionStorage 即时缓存 + 进页 API 同步
- UI：会话历史面板、新会话、Markdown 助手气泡、去掉 50vh 嵌套滚动

### 纪要
- minutes panel overflow-y: visible，避免无用右侧滚动列

## Verify

`
cd app/server && pnpm exec tsx src/db/migrate.ts
pnpm exec tsx --test src/meetings.test.ts
cd app/web && pnpm exec tsc --noEmit
`
