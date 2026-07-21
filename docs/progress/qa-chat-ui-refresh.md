# 追问页：对齐主流 AI 聊天 UI

**Date:** 2026-07-21  
**Scope:** MeetingQaPage + styles

## Research (agent-reach / web / GitHub)

参考来源：
- Nielsen Norman Group: chatbot UX — 固定输入、短气泡、建议问题、空状态引导
- GitHub 高星：huggingface/chat-ui、libaba/ChatUI、nt-design/x、mckaywrigley/chatbot-ui
- 产品惯例：ChatGPT / Claude — 顶栏精简、消息流全高滚动、底栏 sticky composer、用户右/助手左

共性结构：
1. 全高消息流（不是表单卡片堆叠）
2. 底部固定输入（多行 textarea + 发送）
3. 空状态 + suggestion chips
4. typing dots
5. 会话历史侧栏/抽屉
6. Enter 发送 / Shift+Enter 换行

## Changes

- qa-shell 全高布局 + sticky topbar + sticky composer
- 用户气泡右对齐；助手左对齐 + AI 头像 + Markdown
- 空状态建议问题 chips
- 历史改为右侧抽屉
- 去掉「大标题 + 说明 + 卡片线程」的旧表单感

## Verify

`
cd app/web && pnpm exec tsc --noEmit
`
