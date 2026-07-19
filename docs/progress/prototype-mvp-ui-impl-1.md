# Closeout: prototype-mvp-ui

## 交付
- 路径：`docs/design/prototype/mvp/`（纯静态 HTML/CSS/JS）
- 分支：随 main 文档提交即可
- Spec：`.scratch/meeting-record-mvp/spec.md`

## 回答的问题
完整 MVP 主路径在 **Claude DESIGN** 下如何呈现，并可作为开发/验收对照。

## 覆盖
登录/注册 · 列表 · 录音（长按结束）· 详情纪要/原文/外脑 · 追问子页 · 设置 LLM · 导出 mock · 状态 HUD

## 怎么开
见 `docs/design/prototype/mvp/README.md`

## 证据
- 本地打开 `index.html` 或 `python -m http.server 8765`
- 手势：录音页长按结束约 0.8s → 自动进入详情并模拟转写/纪要

## 偏离 / 未做
- 无真实麦克风编码上传（计时模拟）
- 无真实 ASR/LLM
- 非多 variant 切换（用户要求完整功能原型，非三套皮肤）

## 修订
- **ALLOW_REGISTER 已从所有前端页面移除**（登录/设置不再展示开关）；仅为服务端静默配置，与产品决策一致。
- **响应式导航：** 手机底栏（**笔记**/录音/我的）+ 电脑顶栏（链接 + 用户名，**无**开始录音 CTA）。
- 去掉列表底部「开始录音」与左侧模糊导入钮；导入改为 **file input**；设置含个人中心。

## 给实现
- IA 与文案可跟原型；视觉 token 跟 DESIGN.md
- 实现时重写，勿直接当生产前端
