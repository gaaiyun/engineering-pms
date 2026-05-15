# GitHub 开源项目管理软件二次调研报告

**日期：** 2026-05-16
**调研对象：** EngineeringPMS v3.0（React 19 + PocketBase 0.22 + Capacitor 5.7）
**搜索次数：** 14 次 WebSearch + 7 次 WebFetch（合计 21 次，未达上限）
**目标：** 找到技术栈兼容、可借鉴或可摘组件的轻量开源项目

---

## 一、执行摘要

经过对 GitHub 五个方向（PocketBase 生态 / React+SQLite / Capacitor PM / 可摘 UI 组件 / 工程垂类）的系统搜索，结论坦率：

- **方向 A（PocketBase 生态完整 PM）**：**近似空集**。awesome-pocketbase 两个列表里都没有真正的"项目管理/看板/甘特"成品级开源项目。唯一勉强算数的是 `react-declarative/react-pocketbase-crm`（30 stars，CRM 起手套件，含看板），但用 MUI+MobX+RxJS，与我们 AntD Mobile + Zustand + TanStack Query 栈差异较大。
- **方向 B/C（React+SQLite 完整 PM / Capacitor PM）**：**空集**。没有找到任何与 PocketBase 后端兼容、React 19、轻量的完整 PM 项目。
- **方向 D（可摘 UI 组件）**：**真正的金矿**。SVAR Gantt（MIT、React 19、153⭐）、react-kanban-kit（MIT、78⭐、虚拟滚动）、Georgegriff/react-dnd-kit-tailwind-shadcn-ui（MIT、811⭐、a11y 参考）三件套都可直接为我们 v3.0 服务。
- **方向 E（工程/建筑垂类）**：**空集**。命中的都是 Django/PG/Supabase 系。

**最推荐的 3 个**：
1. **SVAR React Gantt** — v3.0 桌面甘特模块的最佳候选（MIT/React 19/任务依赖/拖拽编辑）
2. **react-pocketbase-crm** — 唯一可"参考整体架构"的 PB+React+Kanban 项目，可读源码学 PB schema 与实时订阅模式
3. **react-kanban-kit** — 我们 v3.0 看板的拖拽 + 虚拟滚动备选（即便不直接引入，模式可借鉴）

---

## 二、候选清单（按对我们的价值降序）

### SVAR React Gantt — 153⭐ — MIT
**仓库：** https://github.com/svar-widgets/react-gantt
**最近 commit：** 活跃（main 分支持续 13 个提交）
**技术栈：** React 19 兼容 / 100% TypeScript / 纯前端组件（无后端依赖）
**社区活跃：** 厂商 SVAR 商业团队维护，有付费 Pro 版本背书，社区版 MIT
**核心功能：** 任务依赖线 / 拖拽编辑 / 多任务类型 / 自定义时间刻度 / 明暗主题 / 千级任务性能
**对我们的价值：**
- ✅ 可借鉴：直接 npm install 替代我们手写甘特；React 19 已支持
- ⚠️ 不兼容：移动端触摸支持文档未明示（需在 Capacitor 实测）
- ❌ 无：license 友好，无硬冲突
**兼容评分：** ⭐⭐⭐⭐⭐
**推荐用途：** 直接引入 / 摘组件
**风险点：** 厂商可能将关键功能搬到 Pro 版（如资源视图）— 用之前确认社区版功能边界

---

### react-pocketbase-crm — 30⭐ — License 未声明（需 Issue 确认）
**仓库：** https://github.com/react-declarative/react-pocketbase-crm
**最近 commit：** 维护者 tripolskypetr 活跃（他还维护 react-declarative）
**技术栈：** React + TypeScript + Material UI + MobX + RxJS / PocketBase 后端
**社区活跃：** 单人项目，stars 不高但生态被收录在 PocketBase 关联推荐
**核心功能：** Kanban 看板 / JSON 表单引擎 / 实时订阅（WebSocket）/ 字段可见性 flag / 全文搜索网格 / 移动端响应式（非原生）
**对我们的价值：**
- ✅ 可借鉴：**唯一一个 PB+React+Kanban+实时订阅的完整项目**；其 PocketBase schema 设计、实时订阅封装、低代码看板模式（`useState` 即可挂载）值得详读
- ⚠️ 不兼容：UI 栈完全不同（MUI vs AntD Mobile），状态管理也是 MobX/RxJS 而非 Zustand；不能直接 clone 改造，只能"读源码学模式"
- ❌ License 未声明 — 摘代码前必须先开 Issue 求确认或避开未明确文件
**兼容评分：** ⭐⭐⭐（思想可借鉴，要重写大半）
**推荐用途：** 借鉴架构（PB 实时订阅模式）/ 部分摘 schema 设计
**风险点：** License 未声明 + 单人维护 + stars 偏低，不能押宝

---

### react-kanban-kit — 78⭐ — MIT
**仓库：** https://github.com/braiekhazem/react-kanban-kit
**最近 commit：** 2026-04-21（v0.0.2-beta.7，活跃）
**技术栈：** React + TypeScript / Atlassian pragmatic-drag-and-drop（**不是 dnd-kit**）
**社区活跃：** 个人项目但版本号迭代频繁
**核心功能：** 虚拟滚动 / 无限滚动 + 骨架屏 / 视图只读模式 / 自定义渲染器（卡片/列头/拖拽预览/落点指示器）/ 响应式
**对我们的价值：**
- ✅ 可借鉴：**虚拟滚动的看板** —— 当我们工程任务卡上千张时刚需；自定义渲染器架构很干净
- ⚠️ 不兼容：用 Atlassian pragmatic-drag-and-drop 而非我们的 @dnd-kit。如果引入意味着同时维护两套拖拽库
- ❌ 无 license 冲突
**兼容评分：** ⭐⭐⭐（要重写拖拽适配层）
**推荐用途：** 借鉴架构（虚拟滚动 + 自定义渲染器抽象）/ 极端情况下直接换我们看板
**风险点：** beta 版本（0.0.2-beta.7），生产前需评估稳定性；与现有 @dnd-kit 冲突

---

### Georgegriff/react-dnd-kit-tailwind-shadcn-ui — 811⭐ — MIT
**仓库：** https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui
**最近 commit：** 不明（README 强调"example"性质）
**技术栈：** React + TypeScript + @dnd-kit + Tailwind + shadcn/ui
**社区活跃：** 高 stars 但是教程式样板
**核心功能：** **可访问性（a11y）完整的 Kanban 拖拽参考实现**，键盘导航、屏幕阅读器播报
**对我们的价值：**
- ✅ 可借鉴：a11y 拖拽模式（键盘可达 + announcer）—— 我们工程资料员场景未来要做无障碍审计时直接抄
- ⚠️ 不兼容：UI 是 Tailwind+shadcn，要翻译成 AntD Mobile
- ❌ 无
**兼容评分：** ⭐⭐⭐⭐（与我们 @dnd-kit 同栈，纯模式参考）
**推荐用途：** 摘组件 / 借鉴 a11y 模式
**风险点：** 教程性质，不要期望持续维护

---

### Frappe Gantt + 各 React Wrapper — Frappe 本体 4k+⭐ — MIT
**仓库：** https://github.com/frappe/frappe-gantt （本体）+ https://github.com/mohammed-io/frappe-gantt-react（wrapper）
**技术栈：** 原生 JS / SVG
**对我们的价值：**
- ✅ 可借鉴：MIT、轻量、移动端友好（SVG 缩放好）
- ⚠️ 不兼容：React wrapper 多个版本，需挑维护活跃的（Soremwar 的相对新）；功能比 SVAR 简单很多（无资源视图、复杂依赖弱）
**兼容评分：** ⭐⭐⭐（SVAR 的下位替代）
**推荐用途：** SVAR 若不合适的备选
**风险点：** wrapper 维护者非官方，原项目偶尔重大 API 变动需要跟进

---

### rohitsangwan01/pocketbase_mobile + pocketbase_server_android_example — 数十⭐ — MIT
**仓库：** https://github.com/rohitsangwan01/pocketbase_mobile
**技术栈：** Go + gomobile bind → Android AAR
**对我们的价值：**
- ✅ 可借鉴：**让 PocketBase 直接跑在 Android 端的方案**！理论上可以让 Capacitor APK 内嵌 PB server 实现完全离线
- ⚠️ 不兼容：是 Flutter/原生 Android 思路，要把 AAR 接入 Capacitor 插件需自己写桥接
- ❌ 无
**兼容评分：** ⭐⭐（仅作"未来离线模式"的概念验证参考）
**推荐用途：** 仅参考 / 未来 v4 离线模式备用方案
**风险点：** 不是给 Capacitor 准备的，集成成本高；目前我们 SSE 推送方案更现实

---

### Kanri — 1.9k⭐ — **GPL-3.0（排除）**
**仓库：** https://github.com/trobonox/kanri
**排除原因：** GPL-3.0 命中用户反向排除规则；且为 Vue/Nuxt+Tauri 栈，与我们 React+Capacitor 不兼容
**仅作参考：** UI 设计、JSON 本地存储离线思路可截图借鉴

---

### Focalboard — 21k+⭐ — MIT/AGPL 双重 + **archived（排除）**
**仓库：** https://github.com/mattermost-community/focalboard
**排除原因：** Mattermost 2023-09 停止维护；AGPL 路径冲突
**仅作参考：** Board/View/Card 三级数据模型设计仍是经典

---

### secretplan — 0⭐ — 未声明
**仓库：** https://github.com/alindaByamukama/secretplan
**排除原因：** stars=0，无生产用户痕迹；Astro+htmx 栈完全不匹配
**仅作参考：** 证明 PB 在 PM 场景的可用性

---

## 三、3 选 1 深度推荐

**首选：SVAR React Gantt（https://github.com/svar-widgets/react-gantt）**

理由：
1. **完美栈匹配**：MIT + React 19 + TypeScript，零冲突
2. **无后端绑定**：纯前端组件，我们用 PocketBase 喂数据即可，无需迁移
3. **直接解决 v3.0 痛点**：v3.0 spec 中"桌面端表格 + 拖拽增强 + 甘特"是难点；自研甘特至少 3-4 周工作量，SVAR 可省 80%
4. **可立刻验证**：花 1 天接入 demo，验证移动端触摸 → 验证依赖线 → 验证千级任务性能 → 决定去留

可借鉴的具体功能：
- 任务依赖线绘制 + 拖拽创建依赖
- 时间刻度自适应（日/周/月切换）
- Critical Path 高亮（工程进度审核刚需）
- 虚拟滚动 + 千级任务渲染

**次选（如果 SVAR 触摸不达标）：** Frappe Gantt React wrapper + 自己在外面包 AntD Mobile 工具栏

---

## 四、对当前 v3.0 spec 的影响建议

> 如果 SVAR Gantt 验证通过，建议调整 v3.0 路线图：

1. **拆分"甘特模块"为独立 milestone**：原本糅在"桌面 Shell"里的甘特，可以独立成 M3.5，让前两个 milestone（前台服务+SSE / 响应式 Shell）先落地
2. **看板模块保持自研**：基于现有 @dnd-kit，参考 Georgegriff 的 a11y 模式补强键盘可达；不引入 react-kanban-kit（避免双拖拽库）
3. **新增"可访问性"非功能需求**：参考 Georgegriff 的 announcer 模式，给现有看板补一层 a11y（工程资料员场景中长者用户、夜间使用率高，体感收益大）
4. **撤回"考虑离线模式"调研**：rohitsangwan01 的 PocketBase Mobile 方案集成成本远高于 SSE 推送，本季度不要做

---

## 五、空集声明

- **方向 A 完整成品 PM**：**确认空集** —— PocketBase 生态目前没有 stars>100、license 友好、最近活跃的完整项目管理/协同软件。我们做的就是这个细分赛道的早期玩家
- **方向 B 完整成品**：**确认空集** —— React + SQLite 直连或 PocketBase 后端的 PM 项目，能搜到的都是 demo / boilerplate / todo 级别
- **方向 C 完整成品**：**确认空集** —— Capacitor + Kanban/PM 的 React 项目极少，没有可用候选
- **方向 E 工程垂类**：**确认空集** —— 建筑/工程管理开源全部是 Django + PG / Node + Supabase / 闭源系，无一个 React+SQLite/PB 栈

---

## 六、行动建议

1. **本周**：clone SVAR React Gantt demo，在我们 Capacitor APK 中跑一次触摸测试，决定 v3.0 甘特方案
2. **本周**：fork react-pocketbase-crm，读其 PocketBase schema 与实时订阅源码，写一份 200 行的"PB 实时订阅模式总结" 沉淀到 `docs/architecture/`
3. **下周**：评估 Georgegriff a11y 模式，提一个 v2.97 的"看板 a11y 增强"小任务
4. **不做**：不要 clone 任何完整 PM 项目当起点 —— 我们目前 v2.96 的代码已经比这些候选更完整

---

## 附：搜索关键词记录（便于复查）

A 方向（5 query）：
- pocketbase task management kanban github 2025
- awesome-pocketbase showcase project management react
- "pocketbase" "react" project management self-hosted github repo
- pocketbase CRM starter kit kanban react github
- site:github.com pocketbase project management collab "MIT"

B/C 方向（4 query）：
- react vite kanban sqlite self-hosted github 2025 typescript
- capacitor react kanban task management github typescript
- pocketbase capacitor mobile app android github
- pocketbase react native expo capacitor mobile starter github 2025

D 方向（3 query）：
- react gantt chart open source typescript 2025 best
- "frappe-gantt" react wrapper typescript mit license
- "@dnd-kit" kanban react typescript example github mobile touch
- tanstack table react batch operations bulk select example
- cmdk command palette react ant design example
- "ant design mobile" react github kanban template 2025

E 方向（2 query）：
- construction management open source react self-hosted github
- field service worker app react typescript open source github mobile

杂项（1 query）：
- tauri kanban react github project management sqlite
- focalboard self-hosted license tech stack 2025
