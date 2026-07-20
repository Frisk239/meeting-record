# Closeout: s5-prototype-parity

**日期：** 2026-07-19  
**分支：** `main`（本地 commit；按人要求不 push）  
**Slug：** `s5-prototype-parity`

## 目标

对齐 `docs/design/prototype/mvp/` 中可点击能力，做到真栈完善可演示（硬指标）。

## 本刀补齐

| 原型能力 | 实现 |
|---|---|
| 纪要分块（头/议题/争议/待办/时间轴）可编辑 | 详情纪要 Tab 结构化表单 + `PUT /minutes` 结构化保存 |
| 原文播放条 · 进度 · 时长 · 倍速 | `<audio>` + `/api/meetings/:id/audio` + 1x/1.25/1.5/2x |
| 点句 seek | 点击说话人/时间码 seek |
| 按时间 / 说话人 / 单人筛选 | 筛选 chips |
| 详情内导入音频 · 追加录音 | 原文 Tab 底部动作；录音页支持 `appendMeetingId` |
| Job 状态横幅 | `job-banner`（排队/转写/纪要中/失败） |
| 录音页圆形控件 · 波形 · 长按结束 · 60min 截断 | `RecordPage` 原型布局 |
| 我的 · 显示名称 | `display_name` + `PUT /settings/profile` |
| 导出 MD/PDF 入口 | 详情顶栏保留 |

## 证据

- `pnpm test` 10/10（含 audio / structured minutes / profile）  
- `pnpm typecheck` · web build 绿  

## 相对原型仍可 polish（非能力缺失）

- 播放器用真实文件，webm 在部分浏览器依赖编码兼容  
- 纪要「议题副标题 sub」LLM 可能为空（字段已支持）  
- Playwright 完整 UI 导入手势仍建议另补脚本  

## 演示

```bash
pnpm dev
# 注册 → 导入/录音 → 详情：分块纪要编辑、原文播放与 seek、追加录音、外脑、追问、导出
```
