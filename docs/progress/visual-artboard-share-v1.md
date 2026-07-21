# Visual artboard + share link (Scheme A)

**Date:** 2026-07-21

## Delivered

### 图解（方案 A）
- 固定 **720px 画板**，列布局不随窄屏 reflow
- 容器 **等比 scale** 适配宽度
- **去 emoji**，改 SVG 图标
- **点击图解 /「放大」** → 灯箱全屏预览（Esc / 点遮罩关闭）
- **下载图解 PNG**（`html-to-image`，2x）

### 分享链接（只读）
- `POST /api/meetings/:id/share` → token，默认 7 天
- `GET /api/share/:token` 公开读
- 前端 `/s/:token` 只读页：图解 + 纪要，**无原文/音频**，无需登录
- 详情顶栏 **分享链接** 按钮（复制 URL）

## Verify

```
cd app/server && pnpm exec tsx src/db/migrate.ts
pnpm exec tsx --test src/visual-board.test.ts src/meetings.test.ts
cd app/web && pnpm exec tsc --noEmit
```

## User

1. 重启 API + Web  
2. 生成图解 → 点图或「放大」  
3. 「下载图解」得 PNG  
4. 「分享链接」复制后无痕窗口打开 `/s/...`
