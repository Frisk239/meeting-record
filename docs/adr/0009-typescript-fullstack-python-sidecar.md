# ADR 0009 — TypeScript 全栈为主，Python 仅作必要旁路

**默认：TypeScript 全栈**（Web UI、HTTP API、业务编排、队列、鉴权、LLM Gateway、Context Packer、导出、SQLite 访问）。  
**Python 不默认成为第二套业务后端。** 仅当 TypeScript **搞不定或成本显著不合理** 时，增加 **一个或多个 Python 旁路/微服务**（典型：FunASR / SenseVoice / CAM++ 等 ASR·diarization 推理）。主 API 通过本地 HTTP/子进程与旁路通信；产品边界与测试主 seam 仍是 TS 侧 HTTP API。

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Deciders:** 人（工程）

## Context

产品已定自托管 Web、SQLite、Chat Completions、CPU 上 FunASR 向 ASR。FunASR 生态以 Python 为主，易被理解成「整站 Python」。用户明确：能 TS 全栈就 TS；**搞不定**（如 ASR 模型）再上 Python，而不是预置双栈。

## Decision

1. Application server & frontend: **TypeScript**.  
2. ASR/diarization: prefer **Python worker/sidecar** invoking FunASR pipeline; not rewrite models in TS.  
3. Do not introduce Python for CRUD, auth, settings, minutes orchestration, Q&A routing unless later proven necessary.  
4. Interface: stable job contract (audio path in → transcript JSON with speakers out); TS owns queue/state.

## Consequences

### Positive

- One primary language for product code.  
- Clear seam for heavy ML.  
- Matches 4C4G: one TS process + optional Python worker.

### Trade-offs

- Two runtimes to deploy when ASR is on-box (Node + Python).  
- Need packaging docs for FunASR deps.
