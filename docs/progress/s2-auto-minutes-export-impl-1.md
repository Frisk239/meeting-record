# Closeout: s2-auto-minutes-export

**日期：** 2026-07-19  
**分支：** `main`  
**Slug：** `s2-auto-minutes-export`

## 用户路径（Must）

转写 Job **成功后自动生成 Minutes** → 详情「纪要」Tab 可读/编辑 Markdown → **导出 Markdown + PDF**（可选含原文）。

## 交付

- `meetings.minutes_status|minutes_json|minutes_markdown`
- 转写成功回调 `generateMinutesForMeeting`（Auto Minutes）
- LLM Gateway：OpenAI Chat Completions 兼容；无 key 时 **mock 结构化纪要**（仍可演示）
- Context Packer 雏形（L0 系统 + 标题 + 转写装入预算）
- API：`GET/PUT .../minutes` · `POST .../minutes/generate` · `export.md` · `export.pdf`
- UI：纪要编辑、重新生成、导出按钮
- `pdf-lib`；尝试嵌入系统 TTF（无 CJK 字体时 Latin 回退并提示用 MD）

## 证据

| 检查 | 结果 |
|---|---|
| `pnpm test` | **8/8**（含 auto minutes + MD/PDF magic） |
| `pnpm typecheck` / web build | 绿 |

## 债务

1. PDF 中文依赖本机 TTF（.ttc 未嵌）；MD 为完整中文真源  
2. FunASR 仍未接  
3. Context Packer 无 Digest 缓存表  
4. 无 Playwright  

## 下一刀

**S3 追问子页**（纪要右下角入口 · Context Pack · 多轮）
