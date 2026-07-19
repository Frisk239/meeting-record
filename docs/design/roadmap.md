# 路线图

> 服务「个人日用纪要」，不服务答辩清单。切片真源：[slices.md](./slices.md)。  
> 锁定前提：[ADR 0003](../adr/0003-cpu-asr-and-llm-summary.md)。

## 阶段

| 阶段 | 目标 | 退出标准 |
|---|---|---|
| **D0 文档与约定** | 宪法、workflow、reference 布局、选型与 DESIGN | ✅ 已完成骨架 + CPU/LLM + Claude DESIGN |
| **D1 需求收紧** | grill 钉术语、导出形态、LLM 字段、存储细节 | `CONTEXT.md` Language 非空；vision 无大段 TBD |
| **D2 垂直切片 0** | 第一条端到端路径：上传 → CPU 转写 → 可查看文本 | closeout + 证据在 `docs/progress/` |
| **D3 纪要智能** | 转写文本 → LLM 纪要 → 可编辑 | 同刀可演示「生成 + 改一处 + 导出」 |
| **D4+** | 体验加厚（搜索、模板、说话人等按价值） | 每刀仍须可演示用户路径 |

## 原则

- 一阶段至少一条 **可演示用户路径**，禁止「只铺空壳框架」。  
- 算力假设不变：无 GPU 时不把 realtime diarization 写进退出标准。  
- 路线图随 `CONTEXT.md` 更新；过期阶段标 Historical。
