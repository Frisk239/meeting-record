# ADR 0011 — Drizzle ORM + better-sqlite3

SQLite 访问使用 **Drizzle ORM**，Node 驱动优先 **better-sqlite3**（同步、适合单机 4C4G API 进程）。  
与 ADR 0009/0010 一致：数据层在 TypeScript 应用内，不引入独立 DB 服务。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（工程）

## Context

已定磁盘文件 + SQLite。需选定 TS 访问方式。用户选定 Drizzle + better-sqlite3。

## Decision

1. ORM: **Drizzle**.  
2. Driver: **better-sqlite3** (default).  
3. Schema/migrations live in the TS app package; implement-time paths TBD.  
4. Not Prisma for MVP.

## Consequences

### Positive

- Typed queries; small footprint.  
- Fits single-process Hono API.

### Trade-offs

- better-sqlite3 is native addon — needs build toolchain on deploy host.  
- If deploy pain appears, can swap driver (e.g. libsql) without changing product seams.
