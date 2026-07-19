# 垂直切片

> 厚切片 = 一条可演示用户路径。工程执行见 [workflow.md](../agents/workflow.md)。

## 切片表

| ID | 名称 | 用户路径（一句话） | 状态 |
|---|---|---|---|
| S0 | 文档与选型底座 | 文档/reference/DESIGN/ADR 可导航 | **done**（工程文档，非产品功能） |
| S0b | 账号与设置 | 注册登录 · LLM 三字段配置页 · API 鉴权 | **done**（`docs/progress/s0b-auth-settings-impl-1.md`） |
| S1 | 转写通路 | 上传或**浏览器录音自动上传** → CPU 转写+Speaker → 打开全文 | **done**（mock；`s1-capture-transcribe-impl-1`） |
| S1b | FunASR 旁路 | `ASR_ENGINE=funasr` → Python SenseVoice+VAD+CAM++ → 真 Speaker 原文 | **done**（接线；`s1b-funasr-sidecar-impl-1`） |
| S2 | 纪要通路 | 转写成功 → **自动** AI总结 → 编辑 → **导出 MD/PDF** | **done**（`s2-auto-minutes-export-impl-1`） |
| S3 | 追问子页 | 纪要右下角进入；基于本场原文/纪要提问作答 | **done**（`s3s4-qa-insights-impl-1`） |
| S4 | 外脑按需 | 详情外脑 Tab；显式生成，不自动 | **done**（同 `s3s4-qa-insights-impl-1`） |
| — | 后续 | 图解、换角度总结、Speaker 改名、搜索… | 待价值排序；**不做探索** |

## 状态词

| 状态 | 含义 |
|---|---|
| planned | 已命名，未开工 |
| in-progress | 当前 `feat/*` |
| done | 已合 main 且 intake 通过/有条件通过 |
| dropped | 明确不做 |

## 与进度文档

- Spec / tickets（可选）：`.scratch/<slug>/`  
- Closeout / intake：`docs/progress/<slug>-*.md`  
