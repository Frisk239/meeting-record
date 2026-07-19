# Slice 交接 — 关刀 · 验上一刀 · 开下一刀

> 真源配套：`AGENTS.md` · [workflow.md](./workflow.md) · [merge.md](./merge.md)

## 两种交接

| 类型 | 何时 | 下一会话干什么 |
|---|---|---|
| **续作** | 同一切片窗满 / 未做完 | 读 handoff + 继续同一主题（默认仍在 main） |
| **跨刀** | 上一刀已交付（通常已 push main） | **先 intake 上一刀 → 再 short-align 下一刀** |

下文默认 **跨刀**。

---

## 关刀清单（当前 Owner 结束前）

1. **证据：** 本刀 Must 路径可复核（命令、截图说明、Playwright 步骤或 API smoke）写入 progress  
2. **偏离：** 与 spec / 短对齐不一致处（无则写「无」）  
3. **未做 / 债：** 刻意不做、已知坑  
4. **push：** 默认 **main 已推远程**（或说明 feat/* / 文档-only）  
5. **关刀文档：** `docs/progress/<slug>-impl-*.md`（可选 `/handoff`；Issue 非必须）  
6. **CONTEXT.md：** 更新当前方位与「再下一刀建议」  

### 关刀文档建议结构

```markdown
# Closeout: <slug>

## 交付
- 分支：main（或 feat/<slug>）@ <sha>
- Spec：.scratch/.../spec.md / docs/design
- 已 push origin：是/否

## 证据
- typecheck / tests
- 路径自测：步骤 / URL / 断言（或失败原因 + 替代）

## 偏离 / 未做 / 债
- …

## 给下一 Owner
- 验收时优先看：…
- 建议下一主题（若有）：…
```

---

## 下一 Slice Owner 开场顺序

**禁止**一上来就对新主题满血 implement。

### 1. 读方位与上一刀包

- `AGENTS.md` · `CONTEXT.md` · `docs/agents/merge.md`  
- 上一刀：spec / issues Status · **`docs/progress/<prev>-*.md`**  
- 可选：上一会话 `/handoff` 文件  

### 2. intake 上一刀

| 检查 | 做法 |
|---|---|
| 合并状态 | `git fetch`；上一刀是否已在 `origin/main`（main 直推则看 commit 是否已推） |
| 证据 | 抽查 progress 中的命令/路径 |
| Spec vs 声称 | 抽 2～3 条 acceptance；缺口记「上一刀债」 |
| 安全 | 无密钥、无误提交大模型权重/本地 DB 等（以 `.gitignore` 为准） |

**Verdict 唯一三选一：** `通过` | `有条件通过` | `需返工`  
写入 `docs/progress/<prev>-intake.md`（或上一 closeout 的 Comments）。

### 3. 再 short-align 下一刀

仅当通过 / 有条件通过（或**续作**同 slug）。  
人确认 Must / Out / slug 后再 implement。
