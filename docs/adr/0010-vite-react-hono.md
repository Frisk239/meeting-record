# ADR 0010 — Vite + React 前端 · Hono API

前端：**Vite + React**（TypeScript）。  
HTTP API / 业务编排：**Hono** 跑在 Node（TypeScript），与前端同仓。  
与 ADR 0009 一致：产品逻辑在 TS；ASR 等必要时由 Python 旁路承担。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（工程）

## Context

已定 TS 全栈。需选定 Web 组装方式。自托管会议纪要几乎不需要 SEO/SSR；4C4G 上宜轻量。用户选定 Vite React + Hono。

## Decision

1. SPA：Vite + React + TS.  
2. API：Hono on Node, TS.  
3. Prefer monorepo layout under `app/` or `packages/*` when scaffolding (exact folder names at implement time).  
4. Not Next.js for MVP unless requirements change.

## Consequences

### Positive

- Fast dev loop; small runtime surface.  
- Clear browser vs API boundary (matches API test seam).

### Trade-offs

- Need separate static hosting or reverse-proxy to API in production (one process can still serve static + API if desired).
