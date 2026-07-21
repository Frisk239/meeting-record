# Minutes Visual Engine — 图解总结引擎

> **状态：** 设计草案（可实现）  
> **日期：** 2026-07-21  
> **优先级：** P1（愿景「图解 / 可视化」；`CONTEXT.md` 下一阶段）  
> **视觉真源：** [`DESIGN.md`](./DESIGN.md)（Claude）  
> **IA 参考：** 智在图解（非皮肤复制）— [`research/2026-07-19-zhizai-ui-ia-notes.md`](./research/2026-07-19-zhizai-ui-ia-notes.md)  
> **关联：** Minutes 列表型结构 P0 已交付；本引擎是其 **可选可视化层**，不替代可编辑结构化纪要。

---

## 1. 要解决什么

用户需要在 **任意会议类型**（实习动员、周会、立项、1:1、答辩、客户会、培训…）下，在「纪要」Tab **顶部**看到一块 **信息图总览**：扫一眼抓住结构，再往下读列表型正文。

**不是：**

- 为「实习与毕业」写死三列模板  
- LLM 直接吐整页 HTML/CSS（难编辑、难导出、易与 DESIGN 冲突）  
- ECharts 类统计图默认主路径  
- 思维导图 / 自由画布（后置）

**是：**

- **场景无关** 的 **结构化 Visual IR（中间表示）**  
- 小而闭合的 **图元（primitives）** + **组合配方（recipes）**  
- **产品路径：仅 LLM 填 IR**（不按规则假造图解）  
- React **只渲染 IR**；与列表型 `MinutesDoc` 并存

一句话：

> **Minutes Visual Engine = Intent 识别 → Recipe 选择 → 有界 VisualBoard JSON → 确定性渲染 / 导出。**

---

## 2. 设计原则

| # | 原则 | 含义 |
|---|---|---|
| 1 | **列表纪要是真源** | 图解是投影；编辑/追问/导出仍以 `MinutesDoc` 文本结构为准 |
| 2 | **IR 封闭** | 模型不能发明新 section type；未知 type 丢弃并记 log |
| 3 | **场景靠内容，不靠行业模板** | 不维护 `internship.json` / `standup.json` 行业包；用 **会议形态 intent** + 通用 recipe |
| 4 | **有界生成** | 卡数、bullet 数、section 数有硬上限，防 4G/阅读过载 |
| 5 | **图解不假造** | 无 LLM / JSON 坏 → **硬失败提示**，不写 heuristic 板；列表纪要仍可用 |
| 6 | **视觉本仓化** | tone → DESIGN token；禁止模型指定 hex/字体 |
| 7 | **按钮分离** | 「重新生成纪要」与「生成/重新生成图解」分开；互不自动串跑 |
| 8 | **导出友好** | 任何 board 都能压成 Markdown 列表与 PDF 纯文本块 |

---

## 3. 引擎分层

```
┌─────────────────────────────────────────────────────────────┐
│  Input Pack                                                  │
│  MinutesDoc + (optional) transcript digest + meeting meta    │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Planner（规则 + 可选 LLM）                                   │
│  1) Meeting Intent（形态，非行业）                             │
│  2) Recipe 选择 / 编排 section 骨架                           │
│  3) 预算：maxSections / maxCards / maxBullets                 │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Filler（产品仅 A）                                           │
│  A. LLM：按 schema 填 VisualBoard                            │
│  （不做 heuristic 假图；配置缺失直接报错）                      │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Validator / Normalizer                                      │
│  类型白名单 · 裁剪 · tone 映射 · 空段删除 · 去 HTML            │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  VisualBoard IR  →  Renderer (Web) · Exporters (MD/PDF)      │
└─────────────────────────────────────────────────────────────┘
```

**禁止短路：** LLM → HTML 字符串 → iframe（外脑历史坑；图解默认路径不走这条）。

---

## 4. 会议形态 Intent（场景无关分类）

Intent 描述 **这场会在信息结构上像什么**，而不是「医疗/教育/互联网」。

| Intent | 信号（示例） | 用户扫一眼想看到 |
|---|---|---|
| `briefing` | 宣讲、动员、政策/规范说明、培训 | 核心要求维度 + 注意/风险 + 关键节点 |
| `decision` | 评审、立项、拍板、选型 | 选项/结论 + 争议 + 待办 owner |
| `sync` | 站会、周会、进度同步 | 进展条 + 阻塞 + 下一步 |
| `planning` | 排期、里程碑、OKR | 时间阶段卡 + 依赖/风险 |
| `one_on_one` | 1:1、反馈、绩效 | 主题条 + 行动项 + 关注点 |
| `retro` | 复盘、事故、总结 | Keep/Problem/Try 或 因果卡 |
| `mixed` / `general` | 信号弱或不纯 | 稳妥通用配方 |

**识别来源（优先级）：**

1. 用户/模板显式指定（P1「换角度总结」可挂接，后置）  
2. LLM 在生成 board 时自报 `intent`（需在枚举内）  
3. 启发式：关键词 + 结构形状  
   - 多 `timeline` + 规范口吻 → `briefing`  
   - 多 `disputes` + `actionItems` → `decision`  
   - 短 `topics` + 大量 owner 待办 → `sync`  
   - 时间词密集 → `planning`  
4. 默认 `general`

**行业词只进内容，不进 type：**  
「实习」「客户」「代码评审」可以出现在卡片标题里，但 section type 仍是 `stage_row` / `compare_cards` 等通用图元。

---

## 5. 图元（Primitives）— 闭合集合

引擎 **只允许** 下列 `section.type`。扩展必须改本文件 + renderer + validator（半难逆，宜 ADR）。

### 5.1 `hero`（可选，通常 0～1）

```ts
{ type: "hero"; title: string; subtitle?: string }
```

会议一句话定位。可与文档流大标题二选一，避免重复：  
**阅读态建议：** board 内 `hero.title` 若与 `MinutesDoc.topic` 相同可只显示 subtitle 横幅。

### 5.2 `stage_row` — 横向关键维度 / 阶段

```ts
{
  type: "stage_row";
  heading: string;
  items: Array<{
    title: string;
    badge?: string;      // 短标签，如「时间节点」
    body: string;        // 1～3 句
    icon?: VisualIcon;   // 枚举，非任意 URL
    tone?: VisualTone;
  }>; // 2～4 项，推荐 3
}
```

适用：核心要求、流程步骤、讨论的三大块。

### 5.3 `compare_cards` — 双栏（或 2～3）对照

```ts
{
  type: "compare_cards";
  heading: string;
  cards: Array<{
    title: string;
    badge?: string;
    tone: VisualTone;    // 建议成对：success vs warning
    bullets: string[];   // 2～5
    footer?: string;     // 卡底说明
    icon?: VisualIcon;
  }>; // 2～3 张
}
```

适用：合规 vs 风险、现状 vs 目标、甲方 vs 乙方、Keep vs Problem。

### 5.4 `card_grid` — 多色信息宫格

```ts
{
  type: "card_grid";
  heading: string;
  columns: 2 | 3 | 4;
  cards: Array<{
    title: string;
    badge?: string;
    tone?: VisualTone;
    bullets: string[];
    footer?: string;
    icon?: VisualIcon;
  }>; // 3～6 张（硬上限 6）
}
```

适用：时间节点、工作流阶段、多主题并行。

### 5.5 `action_board` — 待办强调（可选）

```ts
{
  type: "action_board";
  heading: string; // 默认「待办」
  items: Array<{ owner: string; action: string; due?: string }>; // ≤ 8
}
```

适用：决策会、同步会；与正文待办可部分重复（图解做「置顶」）。

### 5.6 `callout` — 通栏提示

```ts
{
  type: "callout";
  tone: "tip" | "warn" | "info";
  text: string; // 单段
}
```

适用：总结寄语、最大风险一句话、下次会前必读。

### 5.7 枚举

```ts
type VisualTone =
  | "neutral"
  | "coral"      // primary 品牌点缀，慎用大面积
  | "teal"
  | "amber"
  | "success"    // 合规/正向
  | "warning"    // 风险/注意
  | "danger"     // 严重问题，少用
  | "purple"     // 节点/条件
  | "info";      // 说明/规划

/** 前端映射到 emoji 或内置 SVG，模型禁止传 URL */
type VisualIcon =
  | "doc" | "clock" | "people" | "flag" | "check"
  | "alert" | "shield" | "target" | "calendar"
  | "link" | "star" | "bolt" | "folder" | "chat";
```

Tone → CSS：只在 renderer 查表到 `DESIGN.md` token（如 `success` → 绿边浅绿底；`warning` → amber 边；`coral` → primary 点缀）。

---

## 6. VisualBoard IR（存库形态）

```ts
type VisualBoard = {
  version: 1;
  intent: MeetingIntent;
  recipeId: string;          // 如 "briefing.v1"
  title: string;             // 通常 = 会议主题
  subtitle?: string;         // 一句话摘要横幅
  sections: VisualSection[]; // 有序
  source: "llm" | "heuristic" | "user";
  model?: string;
  generatedAt: string;       // ISO
};
```

挂载：

```ts
// MinutesDoc 增量（向后兼容）
type MinutesDoc = {
  // ...existing fields...
  visualBoard?: VisualBoard | null;
};
```

- 存于现有 `meetings.minutes_json`，**不新开表**（首版）  
- `visualBoard == null` / 缺字段 → UI 不渲染图解区  
- 重新生成列表纪要时：默认 **保留** 旧 board，直到用户点「刷新图解」或选择「纪要与图解一起重生」（产品开关，默认保留更稳）

---

## 7. Recipe（配方）— 组合而不是行业模板

Recipe = **intent → 建议 section 序列 + 预算**。  
Filler 按骨架填内容；允许在预算内 **删空段**，不允许新增未声明 type。

| recipeId | intent | 默认骨架 |
|---|---|---|
| `briefing.v1` | briefing | hero/subtitle → `stage_row`(3) → `compare_cards`(2) → `card_grid`(3～4) → `callout` |
| `decision.v1` | decision | subtitle → `stage_row` 或 `card_grid`(选项/结论) → `compare_cards`(争议维) → `action_board` → `callout` |
| `sync.v1` | sync | subtitle → `stage_row`(进展维度) → `compare_cards`(阻塞 vs 进展) → `action_board` |
| `planning.v1` | planning | subtitle → `card_grid`(里程碑, cols=4) → `compare_cards`(风险/依赖) → `action_board`? → `callout` |
| `one_on_one.v1` | one_on_one | subtitle → `stage_row`(2～3 主题) → `action_board` → `callout` |
| `retro.v1` | retro | subtitle → `compare_cards` 或 3-col `card_grid`(Keep/Problem/Try) → `action_board` → `callout` |
| `general.v1` | general/mixed | subtitle → `stage_row` from top topics → `card_grid` or `action_board` → `callout` from goal |

### 全局预算（硬编码校验）

| 项 | 上限 |
|---|---|
| sections | 6 |
| 单 `stage_row` items | 4 |
| 单 `compare_cards` cards | 3 |
| 单 `card_grid` cards | 6 |
| 单 card bullets | 5 |
| 单 bullet 字符 | 120（中文约） |
| `action_board` items | 8 |
| 全文 board JSON | 建议 ≤ 8～12KB |

超限：截断 tail + `console`/progress log，不失败整单。

---

## 8. 生成管线

### 8.1 触发

| 触发 | 首版建议 |
|---|---|
| Auto Minutes 成功后 | **不**连环生成图解 |
| 纪要 Tab「生成图解 / 重新生成图解」 | **唯一产品路径**（LLM） |
| 重新生成纪要 | 只改列表纪要；**保留**旧 visualBoard |
| 无 API key / LLM 失败 | 报错，占位区仍在，不写假板 |

（若后续验证 LLM 稳、耗时可控，可加设置项「纪要生成后自动出图解」。）

### 8.2 API（草案）

```
POST /api/meetings/:id/minutes/visual
Body: { "force": boolean }  // true = 无视缓存重生成
→ { minutes: MinutesDoc }   // 含 visualBoard
```

- 鉴权 + 属主与现有 minutes 一致  
- 无纪要时：`400`「请先生成纪要」  
- 幂等：相同内容可覆盖 `visualBoard` 字段

### 8.3 LLM Prompt 契约

- 输入：压缩后的 MinutesDoc（topic/goal/topics/disputes/actionItems/timeline）+ intent 提示  
- 输出：**仅** `VisualBoard` JSON（可无 markdown 围栏）  
- System 约束：  
  - 禁止 HTML/CSS/JS  
  - `type`/`tone`/`icon` 必须在枚举内  
  - 内容必须可回溯到纪要，禁止编造未出现的关键事实  
  - 使用中文  
  - 遵守 recipe 骨架与预算  

Context Packer：走现有 ADR 0005 路径，图解调用 **次要压缩**（不必全文 transcript）。

### 8.4 Heuristic Filler（无 LLM / 失败回落）

确定性映射，保证任意会议有「还过得去」的板：

| 来源 | 映射 |
|---|---|
| `goal` / 首段摘要 | `subtitle` 或 `callout` |
| `topics[0..2]` | `stage_row` items（title + 首条 bullet 作 body） |
| `disputes` | `compare_cards` 中 warning 卡；另一侧用 topics 提炼「共识/规范」或 goal |
| `timeline[0..3]` | `card_grid` cols=2/4 |
| `actionItems` | `action_board` |
| 全空 | 不写 board（`null`） |

Intent 启发式选 recipe，再只填有数据的段。

### 8.5 Validator

1. `version` 强制 1  
2. 未知 section → drop  
3. 未知 tone/icon → `neutral` / `doc`  
4. 剥离任何 `<tag>`、`javascript:`  
5. 空 heading + 空 cards 的 section → drop  
6. 预算裁剪  
7. `recipeId` 非法 → `general.v1`

---

## 9. 渲染（Web）

### 9.1 位置

```
纪要 Tab · 阅读态
├─ toolbar
├─ MinutesVisualBoard   ← 有 visualBoard 才挂载
└─ minutes-doc（现有文档流）
```

编辑态：首版 board **只读** 置于表单上方或隐藏；避免两套编辑源冲突。

### 9.2 组件

- `MinutesVisualBoard`：遍历 `sections`，switch 渲染  
- `VisualStageRow` / `VisualCompareCards` / `VisualCardGrid` / `VisualActionBoard` / `VisualCallout`  
- 响应式：  
  - `stage_row`：桌面 3 列，窄屏横向 scroll 或纵向 stack  
  - `card_grid`：`columns` 为上限，窄屏 `min(columns, 2)` → 1  

### 9.3 与智在截图的关系

| 智在元素 | 本引擎 |
|---|---|
| 三节点阶段条 | `stage_row` |
| 绿/橙双卡 | `compare_cards` + success/warning |
| 四色节点宫格 | `card_grid` |
| 底黄提示条 | `callout` |
| 猫头鹰/品牌插画 | **不做** |
| 花哨渐变抄皮 | **不做**；用 Claude cream/coral/teal/amber |

---

## 10. 导出

| 目标 | 策略 |
|---|---|
| Markdown | `## 图解总览` + 各 section → `### heading` + bullets；不输出 tone |
| PDF | 复用 export block 模型：h2/h3/li/quote；色块非必须 |
| 「MD+原文」 | 图解段夹在纪要与原文之间（若存在） |

无 `visualBoard`：导出与现网一致。

---

## 11. 编辑与生命周期

| 阶段 | 能力 |
|---|---|
| V1 | 只读 + 生成/刷新；失败保留旧 board |
| V1.1 | 卡片标题/bullet 就地编辑 → `source: "user"` |
| V2 | 增删 section、换 recipe、换角度总结驱动 intent |
| 非目标 | 自由拖拽画布、自定义 HTML 块、用户上传图当 board |

**过期策略：**  
`minutes.updatedAt > visualBoard.generatedAt` → UI 显示「纪要已更新，图解可能过期」+ 一键刷新。

---

## 12. 非目标（本引擎边界）

- 探索 Tab、自动外脑灌屏  
- 思维导图 / 流程图编辑器  
- 实时协作白板  
- 模型指定像素级布局（x/y/width）  
- 为每个客户行业维护模板市场（可用「换角度」后置，但仍应编译到同一 IR）

---

## 13. 测试矩阵

| 层 | 用例 |
|---|---|
| Validator | 未知 type 丢弃；超限裁剪；HTML 剥离 |
| Heuristic | 仅 topics / 仅 actions / 空纪要 → 行为符合预期 |
| Recipe | 各 intent 骨架 section 类型合法 |
| API | 无纪要 400；有纪要 200 且 `visualBoard.version===1` |
| UI | 无 board 不占位；有 board 在文档流之上；窄屏无横向页面级滚动 |
| Export | 有/无 board 的 MD/PDF 均 200 |

Mock 会议建议覆盖：`briefing`（长宣讲）、`sync`（短站会）、`decision`（有争议+待办）。

---

## 14. 分阶段交付

### Slice V1 — 引擎可演示（建议下一厚切片）

1. 本设计收口 + `MinutesDoc.visualBoard` 类型  
2. Heuristic filler + validator  
3. `POST .../minutes/visual`  
4. `MinutesVisualBoard` 阅读态  
5. 刷新按钮；过期提示（简单时间戳比）  
6. MD/PDF 附加图解纯文本  
7. 测试 + `docs/progress/*`

**仍可不做：** LLM filler、编辑、自动跟随 Auto Minutes。

### Slice V2 — LLM 质量

1. Prompt + schema 填充  
2. Intent 自报 + recipe 绑定  
3. 失败回落 heuristic  
4. 可选「随纪要自动生成」设置  

### Slice V3 — 深度

1. 用户改卡  
2. 换角度 / 换 recipe  
3. 与追问联动（「根据图解第 2 卡展开」）

---

## 15. 决策摘要（实现时遵守）

1. **全场景 = Intent + Recipe + 闭合 Primitives**，不是 N 套行业模板。  
2. **JSON IR，禁止默认 HTML 图解。**  
3. **列表纪要真源；图解可空、可刷新、可过期。**  
4. **Tone/Icon 枚举化，视觉只认 DESIGN.md。**  
5. **有界预算 + validator**，保 4C4G 与阅读体验。  
6. **首版启发式即可上线演示；LLM 为增强而非唯一路径。**

---

## 16. 开放问题（实现前可短对齐）

| # | 问题 | 默认假设 |
|---|---|---|
| Q1 | Auto Minutes 后是否自动出图解？ | **否**，按钮触发 |
| Q2 | 重生纪要是否清 board？ | **否**，标过期 |
| Q3 | 图解是否进默认 PDF？ | **是**（若存在） |
| Q4 | 是否需要 `visual_only` 导出？ | 否，后置 |
| Q5 | 外脑与图解是否合并？ | **否**；图解属纪要，外脑仍按需 |

若默认假设可接受，实现窗无需再 grill；推翻时改本节并记 progress。
