# Agent I — 性能 + Bundle 分析报告

**日期**：2026-05-16
**前端**：`G:/项目管理软件_v2/frontend`（Vite 6.4.1 + React 19.2 + TypeScript 5.9）
**测量基线**：`vite build` 生产构建（fresh from clean dist），`vite preview` 静态托管 + Playwright 1.58 chromium-headless-shell。

---

## TL;DR

**任务书前提已部分过时**：
1. `App.tsx` 已经实现路由级 `React.lazy`（11 页全部）—— 显然是上一轮 Agent D 落地的。
2. `vite.config.ts` 已经配置 `manualChunks`（antd-mobile / charts / motion / tanstack / dnd / icons / pb / date 共 8 个 vendor split）。
3. 当前 bundle 已经不是任务书描述的 `1.55 MB / 474 KB gz` 单 chunk，而是 23 个 JS chunk + 4 个 CSS chunk。

**真实现状**：员工端首屏 eager 总量 **1082 KB raw / 313 KB gz**（含 CSS），grand total **1700 KB raw / 501 KB gz**。Admin 路由额外按需拉 **416 KB raw / 121 KB gz**（recharts + AdminDashboard + DataImportCenter）。

**剩余 ROI**：进一步压缩首屏 gz 还能再砍 **70~130 KB gz**，关键不在拆 chunk，在于 **(1) framer-motion 大库现在被 Login 钉死在 eager 路径，(2) react-icons/io5 全包导入 (3) vendor-antd-mobile chunk 卷入了 react-dom + react-spring + ahooks**。

---

## 1. Bundle 现状（精确数字）

**Fresh build, `dist/assets/`**

| Chunk | Raw bytes | Gzip bytes | Eager? | 说明 |
|---|---:|---:|:---:|---|
| `vendor-antd-mobile-nDG9QJ11.js` | 500 513 | 167 552 | ✓ | antd-mobile + 它静态依赖的 react-dom/rc-field-form/react-spring/ahooks/@floating-ui 全卷在一起 |
| `vendor-charts-AdsePKzB.js` | 350 766 | 104 418 |  | recharts 全家桶（含 d3-scale/shape/format/time/array + decimal.js-light） |
| `index-CepobEbd.js` | 158 378 | 45 941 | ✓ | App 主入口 = App.tsx + Login + Register + Home + AppShell + lib/* |
| `vendor-motion-Bowb_QPz.js` | 121 550 | 40 078 | ✓ | framer-motion + motion-dom + motion-utils |
| `vendor-tanstack-DLisKG37.js` | 91 872 | 25 431 | ✓ | @tanstack/react-query + react-table |
| `AdminDashboard-CBn0YDmO.js` | 58 783 | 15 089 |  | AdminDashboard + AIConsole + ai-service |
| `vendor-dnd-DgJTdPzD.js` | 49 791 | 16 569 |  | @dnd-kit/core+sortable+utilities（只被 ProjectKanban 用） |
| `vendor-pb-CaoJqTZh.js` | 37 845 | 10 691 | ✓ | pocketbase SDK |
| `vendor-icons-DUlGWw25.js` | 32 609 | 8 066 | ✓ | react-icons/io5（全 io5 子集，未做 babel-plugin-import 优化） |
| `ProjectKanban-C2QR-PGH.js` | 21 545 | 7 831 |  | Kanban 页 |
| `TaskCreate-C3PiO4vZ.js` | 21 020 | 5 383 |  | |
| `TaskDetail-HJla7tkA.js` | 17 422 | 4 976 |  | |
| `MyProjects-CCnOHj7D.js` | 16 445 | 5 981 |  | |
| `DataImportCenter-Dk9Ewcsv.js` | 16 251 | 4 403 |  | |
| `ProjectTimeline-CZrzcMpD.js` | 14 524 | 5 262 |  | |
| `ReviewCenter-v6QLZt5c.js` | 13 674 | 4 804 |  | |
| `MyTasks-dylrIwx4.js` | 12 554 | 4 523 |  | |
| `BatchTaskEditor-eXvBB8KO.js` | 8 075 | 2 821 |  | 共享 chunk |
| `Notifications-C7BXWxdj.js` | 7 888 | 3 034 |  | |
| `SettingsPage-DoYXqRrS.js` | 7 868 | 3 120 |  | |
| `web-DtF20oJh.js` / `web-Czx-d2DG.js` | 4 292 | 1 613 |  | antd-mobile 子组件 helpers |
| **`vendor-date-l0sNRNKZ.js`** | **1** | **45** | ✓ | **空 stub —— manualChunks 配置错误：dayjs 实际通过子路径 import 没被识别** |
| **CSS** | | | | |
| `vendor-antd-mobile-C4mWCVA6.css` | 149 420 | 18 714 | ✓ | antd-mobile 全部组件样式 |
| `index-8iwtc-Lx.css` | 15 465 | 4 071 | ✓ | tailwind / app 全局 CSS |
| `ProjectKanban-COaPpdAd.css` | 9 685 | 2 426 |  | Kanban 专属 |
| `ReviewCenter-Bva8Cjfo.css` | 2 496 | 863 |  | |

**Eager (首屏 modulepreload + entry)** —— 来自 `dist/index.html`：
```
index.js + vendor-antd-mobile + vendor-motion + vendor-tanstack + vendor-pb + vendor-icons
+ vendor-antd-mobile.css + index.css
= 1 081 706 raw / 312 943 gz  （JS+CSS, 8 个文件）
```
**Admin lazy**（员工端无负担）：
```
AdminDashboard + vendor-charts + DataImportCenter = 415 800 raw / 120 949 gz
```
**总计**：23 JS + 4 CSS = **1 699 882 raw / 501 067 gz**。

> 任务书的「1.55 MB / 474 KB gz Vite warning > 500 KB」是 Agent D 改造**之前**的数字。当前唯一仍 > 500 KB 的 chunk 是 `vendor-antd-mobile-nDG9QJ11.js` (500 513 raw)，由 `chunkSizeWarningLimit: 600` 抑制了警告。

---

## 2. Top 10 依赖体积排行（按 gzip）

来源：`vite-bundle-visualizer -t list --open false` 生成 `bundle-list.json`，再按 node_modules 顶层包聚合 gzip 字节。

| # | Package | Rendered (raw) | Gzip | 所在 chunk | 是否员工端 eager |
|---:|---|---:|---:|---|:---:|
| 1 | `recharts` | 560 700 | **175 202** | vendor-charts | 否（admin only） |
| 2 | `__source__` (业务源码合计) | 616 692 | 132 457 | 分散在 index + 各页 chunk | 部分 |
| 3 | `react-dom` | 562 112 | **98 390** | vendor-antd-mobile（被它静态依赖） | **是** |
| 4 | `motion-dom` | 269 401 | **88 742** | vendor-motion | **是** |
| 5 | `antd-mobile` | 168 963 | **63 687** | vendor-antd-mobile | **是** |
| 6 | `framer-motion` | 94 866 | **32 351** | vendor-motion | **是** |
| 7 | `es-toolkit` | 58 119 | 23 336 | vendor-charts（recharts 依赖） | 否 |
| 8 | `@dnd-kit/core` | 101 801 | 21 359 | vendor-dnd | 否（只在 Kanban） |
| 9 | `rc-field-form` | 82 467 | **21 030** | vendor-antd-mobile | **是** |
| 10 | `@tanstack/table-core` | 111 335 | **19 937** | vendor-tanstack | **是**（但 react-table 只被 TasksTableView 用） |

**11-20 提一笔**：`@tanstack/query-core` 19 412 gz, `react-router` 18 799 gz, `@babel/runtime` 16 874 gz, `decimal.js-light` 13 179 gz（recharts 子依赖）, `antd-mobile-icons` 12 269 gz, `immer` 11 627 gz, `@react-spring/core` 11 619 gz, `pocketbase` 10 486 gz, `d3-scale` 10 015 gz, `@use-gesture/core` 9 990 gz。

**3 个核心发现**：

1. **`recharts` 不在 eager 路径**（vendor-charts 不在 modulepreload 名单）—— 任务书担心的"员工端首屏白载 admin 代码"在 chart 维度已不存在。
2. **`react-dom` (98 KB gz) 被打进了 `vendor-antd-mobile` chunk**。原因：`manualChunks` 只显式列了 `antd-mobile` / `antd-mobile-icons`，但 antd-mobile 静态依赖 react-dom，所以 rollup 把 react-dom 合并进了同一 chunk。这是 antd-mobile 一旦加载就必带 98 KB react-dom 的代价 —— 实际是必要开销，但目前 chunk 名误导。
3. **`framer-motion` + `motion-dom` 合计 ~121 KB gz 强制 eager**，因为 Login 和 Home 都静态 import `motion` —— 这两个页都在 eager 路径。下面有具体优化建议。

---

## 3. Admin-only 代码混入主 bundle 的"证据"

任务书提到 17 个页面都是静态 import，员工端白载 admin 代码。**该结论已不成立**，证据如下。

**对照 `src/App.tsx` line 16-26**：
```tsx
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'))
const DataImportCenter = React.lazy(() => import('./pages/admin/DataImportCenter'))
const TaskCreate = React.lazy(() => import('./pages/TaskCreate'))
const TaskDetail = React.lazy(() => import('./pages/TaskDetail'))
const ProjectTimeline = React.lazy(() => import('./pages/ProjectTimeline'))
const ProjectKanban = React.lazy(() => import('./pages/ProjectKanban'))
const MyProjects = React.lazy(() => import('./pages/MyProjects'))
const MyTasks = React.lazy(() => import('./pages/MyTasks'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const Notifications = React.lazy(() => import('./pages/Notifications'))
const ReviewCenter = React.lazy(() => import('./pages/ReviewCenter'))
```
只有 `Login / Register / Home` 是同步 import（首屏关键路径）。

**rollup 输出确认**：
- `dist/index.html` 的 `modulepreload` 列表**不含** `AdminDashboard-*.js / vendor-charts-*.js / DataImportCenter-*.js`。
- 反查 `grep -c recharts dist/assets/index-CepobEbd.js` → 0（recharts 不在主 chunk）。
- 反查 `grep -c recharts dist/assets/AdminDashboard-CBn0YDmO.js` → 72 个匹配（确实在 admin chunk）。
- `ManagerDashboard.tsx` 内有 `echarts-for-react`，但该文件没有任何静态/动态 import 引用（孤儿文件） —— Vite tree-shaking 后整个 echarts 包未进入任何 chunk，节省了 ~3.8 MB raw。

**唯一可疑点**：`vendor-charts-AdsePKzB.js` 显式声明在 manualChunks 中包含 `'echarts', 'echarts-for-react'`，但因没有源码 import，rollup 把它们丢了，chunk 里只有 recharts。这是配置冗余但**不浪费体积**。

---

## 4. 性能 baseline 测试数据

环境：Windows 11, Vite 6.4.1, Chromium-headless-shell 145.0.7632.6, localhost loopback。

**测试脚本**：`frontend/e2e/perf-baseline.spec.ts`（新建）+ `playwright.perf.config.ts` (prod preview) / `playwright.perf-dev.config.ts` (dev) (新建)。

### 4.1 Cold-load `/login`（production preview, vite preview --port 4173）

| 指标 | 值 |
|---|---:|
| First Paint (FP) | **772 ms** |
| First Contentful Paint (FCP) | **1612 ms** |
| DOMContentLoaded | 802 ms |
| load event | 803 ms |
| Wall time → networkidle | **2217 ms** |
| JS heap used | 4.43 MB |
| Eager chunks fetched | 9 个 (index, 5 vendor-*, web-*, 2 CSS) |

### 4.2 Cold-load `/login`（dev server, vite --port 5175）

| 指标 | 值 |
|---|---:|
| First Paint (FP) | 4120 ms |
| **FCP** | **4880 ms** |
| DOMContentLoaded | 4116 ms |
| load event | 4852 ms |
| Wall time → networkidle | 6231 ms |
| JS heap used | 11.78 MB |
| Eager modules fetched | **数百个**（含 antd-mobile 的每个组件 CSS：button.css、tabs.css、calendar-picker-view.css 等单独请求） |

**结论**：dev → prod 加速比 **FCP 3.0×, heap 2.6×**。Dev server 的瓶颈是 antd-mobile 没 chunk 化时浏览器并行请求 200+ 单独 CSS/JS 模块。

### 4.3 Navigate `/login → /admin`（未登录，触发 redirect 回 login）

- prod preview: **1152 ms** 完成跳转 + AdminDashboard chunk 加载完毕（实际未登录会立即 redirect，但 chunk 因 lazy 触发已 fetch）。
- dev server: 1824 ms

### 4.4 任务列表 100 条 / 看板拖拽响应（未完成）

由于这两个场景需要登录态 + 真实 PocketBase 数据，且本任务限制 50 分钟 / 40 次 Bash 调用，未运行。建议后续在 `e2e/perf-baseline.spec.ts` 添加：

```ts
test.beforeEach(loginViaAPI)  // 复用 smoke.spec.ts 的 loginViaAPI
test('100-task render', async ({page}) => {
  await page.goto('/my-tasks')
  const t0 = Date.now()
  await page.waitForSelector('[data-task-id]:nth-of-type(100)')
  console.log('100-task render:', Date.now() - t0)
})
```

启动条件：本机 PocketBase 必须有 ≥100 个 task fixture。可在 backend seed 脚本中加预置数据。

---

## 5. 优化建议（按 ROI 排序）

ROI = 预计 gzip 减少 / 实施难度。下面只列**当前未做**的优化，已经被 Agent D 落地的（路由级 lazy / vendor manualChunks）不再讨论。

### 5.1 [★★★★★] 修复 `vendor-date` chunk 空 stub（5 分钟）

`vite.config.ts` 第 26 行 `'vendor-date': ['dayjs']`，但项目里用法都是 `import dayjs from 'dayjs'` 或 `import 'dayjs/plugin/utc'` 这种子路径。Rollup `manualChunks` 用字符串匹配只匹配根包名，dayjs 子模块没被命中导致 chunk 为空（1 字节 stub）。dayjs 当前去了 `index-CepobEbd.js` 主 chunk（7 489 gz）。

**修法**：改成函数式 manualChunks，或干脆删掉 vendor-date 这行。
**收益**：dayjs 抽出后，主 chunk 减 7 KB gz，HTTP 多 1 个并行请求（cache 友好）。

### 5.2 [★★★★★] `framer-motion` 移出 Login eager 路径（30 分钟）

`Login.tsx` 第 5 行 `import { motion } from 'framer-motion'`，整页只用了 1 处装饰性 fade-in 动画（grep 第 22 行）。但这把 `vendor-motion-Bowb_QPz.js` (121 550 raw / **40 078 gz**) 钉死在 eager 路径。

**修法 A（推荐）**：把 Login 的 `motion.div` 换成纯 CSS animation（@keyframes fadeIn 一行）。该页就不再依赖 framer-motion。
**修法 B**：把 framer-motion 用法包成 `React.lazy` 的子组件，Login 用 Suspense fallback 一个静态 div。
**修法 C**：用 framer-motion 的 lighter export `m` + LazyMotion + domAnimation（官方 tree-shaking pattern），可砍 ~60% framer-motion 体积。

**收益**（保守）：Login 不再 eager 121 KB raw / **40 KB gz**；首屏 gz **313 → ~273 KB（-13%）**，FCP 预计 1612 → ~1300 ms。
**风险**：Home.tsx 也用 framer-motion，且 Home 是登录后默认页 —— 但因为 Home 是 lazy 路由，已脱离首屏。需确认 `App.tsx` line 5 `import Home from './pages/Home'` 是同步 import，所以 Home 上的 motion 也连带 eager 了。这条建议要求 **同时把 Home 也改 lazy**（或剥离 motion 用法）。

### 5.3 [★★★★] `react-icons` 改用按需 import 或 SVG sprite（1 小时）

当前 `vendor-icons` chunk 32 609 raw / **8 066 gz**，包含整个 io5 子库。代码里所有 `IoXxx` 都是命名导入：

```tsx
import { IoNotificationsOutline, IoCheckmarkCircleOutline, ... } from 'react-icons/io5'
```

react-icons 库的 io5 包是 30+ MB 源码量，tree-shaking 看似生效但其实把每个图标都编进了 chunk。

**修法**：改用 `react-icons/lib/index.esm.js` 子路径 + `unplugin-icons` 或 `@iconify/react` 按名加载。或者把每个图标拆成单独 SVG 内联（项目里实际只用了 30+ 个 io5 图标，全部 SVG inline 约 8 KB gz）。

**收益**：vendor-icons 从 8 KB gz 降到 ~2 KB gz（-6 KB gz）。
**风险**：低，纯替换 import 语句。

### 5.4 [★★★] `vendor-tanstack` chunk 拆分（25 分钟）

当前 `vendor-tanstack-DLisKG37.js` 91 872 raw / **25 431 gz**，含 `react-query` (19 412 gz) + `react-table` (19 937 gz) + `react-virtual` (4 gz, 几乎空)。

- `react-query` 全 app 都用，必须 eager。
- `react-table` 只在 `TasksTableView.tsx` 用（桌面 web 任务列表的表格视图）。
- `react-virtual` 在 `package.json` 但没人 import。

**修法**：把 `@tanstack/react-table` 从 manualChunks 移走，让它自然进入它的消费者 chunk（`MyTasks-*.js` 或 `TasksTableView` 单独 chunk）；删除未使用的 `@tanstack/react-virtual`。

**收益**：首屏 gz **-19 KB（-6%）**，admin/manager 端 MyTasks 路由 fetch 时再拿。

### 5.5 [★★★] 删除孤儿文件 `ManagerDashboard.tsx` & 卸载未用包（15 分钟）

孤儿源文件 + dev dependency 体积优化：

| 包 | 大小 (node_modules raw) | 实际用？ |
|---|---:|---|
| `echarts` | 3 813 KB | 否（仅 ManagerDashboard.tsx 引用，孤儿） |
| `echarts-for-react` | 12 KB | 否 |
| `openai` | 905 KB | 否（grep 无 src 引用） |
| `lottie-react` | 96 KB | 否 |
| `@tanstack/react-virtual` | 4 KB | 否 |
| `recharts` | 960 KB | 是（AdminDashboard） |

**修法**：
1. 删除 `src/pages/ManagerDashboard.tsx` + `ManagerDashboard.css`。
2. `npm uninstall echarts echarts-for-react openai lottie-react @tanstack/react-virtual`。
3. 同步把 `vite.config.ts` 的 manualChunks 里 `echarts`/`echarts-for-react` 移除（避免 rollup warning）。

**收益**：bundle 大小不变（已 tree-shaken），但安装时间 -10s，CI bandwidth -5 MB，依赖审计面积 ~减少 30%。

### 5.6 [★★] AntdMobile 子组件按需引入（2 小时，需 babel/plugin-transform-imports）

`vendor-antd-mobile` 500 513 raw / **167 552 gz** 是 eager 最大单 chunk。当前 17 个文件都 `import { ... } from 'antd-mobile'` 命名导入，rollup tree-shaking 已生效但 antd-mobile 5.x 的 ES modules 把所有共享 base 组件（NavBar/Card/Toast/Button/...）都拉一遍。

**修法**：用 `babel-plugin-import` 或 `vite-plugin-imp` 把 `import { Button } from 'antd-mobile'` 改写成 `import Button from 'antd-mobile/es/components/button'`，绕过桶文件。

**收益**：估算 -30 KB gz（约 18%）。
**风险**：中。antd-mobile-icons 也要同步处理；CSS 拆分链路要重测；可能破坏 ConfigProvider 的全局主题。

### 5.7 [★] 图片资源（基本无可优化）

`public/icons/` 总 1248 KB —— 全是 iOS splash 屏（9 张 PNG, 41~178 KB），由 `index.html` 第 28-38 行的 `apple-touch-startup-image` 引用，且都加了 `media=...` 媒体查询，只匹配的设备才下载。**实际首屏不下载这些**。无需优化。

PWA icon (icon-32 ~ icon-512) 总 54 KB，浏览器只下载 favicon + 当前尺寸，合理。

---

## 6. 推荐先做的 3 个动作（具体到代码）

### 动作 #1：Login.tsx 去掉 framer-motion，改 CSS animation

**文件**：`src/pages/Login.tsx`

```diff
- import { motion } from 'framer-motion'
  // ...
- <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.3}}>
-   { /* form */ }
- </motion.div>
+ <div className="login-fade-in">
+   { /* form */ }
+ </div>
```

在 `src/pages/Login.css`（或 `App.css`）追加：
```css
@keyframes loginFadeIn { from {opacity:0} to {opacity:1} }
.login-fade-in { animation: loginFadeIn .3s ease-out both }
```

如果 Register.tsx 也用，做同样的替换。

**配套**：把 `App.tsx` line 5 的 `import Home from './pages/Home'` 也改成 `const Home = React.lazy(() => import('./pages/Home'))`，让 Home 的 framer-motion 也脱离首屏。

**预期收益**：首屏 gzip **313 KB → ~273 KB**（-13%），FCP **1612 ms → ~1300 ms**。

### 动作 #2：vite.config.ts manualChunks 改用函数式 + 移除冗余

**文件**：`frontend/vite.config.ts`

```diff
       rollupOptions: {
         output: {
-          manualChunks: {
-            'vendor-antd-mobile': ['antd-mobile', 'antd-mobile-icons'],
-            'vendor-charts': ['echarts', 'echarts-for-react', 'recharts'],
-            'vendor-motion': ['framer-motion'],
-            'vendor-tanstack': ['@tanstack/react-query', '@tanstack/react-table', '@tanstack/react-virtual'],
-            'vendor-icons': ['react-icons/io5', 'react-icons'],
-            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
-            'vendor-pb': ['pocketbase'],
-            'vendor-date': ['dayjs'],
-          },
+          manualChunks(id) {
+            if (!id.includes('node_modules')) return
+            if (id.includes('antd-mobile')) return 'vendor-antd-mobile'
+            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
+            if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion'
+            if (id.includes('@tanstack/react-query')) return 'vendor-tanstack'
+            if (id.includes('react-icons')) return 'vendor-icons'
+            if (id.includes('@dnd-kit')) return 'vendor-dnd'
+            if (id.includes('pocketbase')) return 'vendor-pb'
+            if (id.includes('dayjs')) return 'vendor-date'
+            // 让 react-table 自然合并到使用它的页面 chunk
+          },
         },
       },
```

**预期收益**：
- `vendor-date` 真正生效，主 chunk -7 KB gz。
- `react-table` 从 `vendor-tanstack` 移出，eager `vendor-tanstack` 从 25 KB → ~6 KB gz（react-query only）。
- 主 chunk gz **-26 KB**，员工端首屏 313 KB → ~287 KB。

### 动作 #3：删孤儿 + 卸未用包

**Shell**：
```bash
cd frontend
rm src/pages/ManagerDashboard.tsx src/pages/ManagerDashboard.css
npm uninstall echarts echarts-for-react openai lottie-react @tanstack/react-virtual
```

**配套 vite.config.ts**：动作 #2 中已经移除了 `echarts`/`echarts-for-react` 字符串引用，再次确认。

**预期收益**：bundle 体积零变化（本来就 tree-shaken），但：
- `node_modules/` 体积 -5.8 MB（echarts 3.8 + openai 0.9 + recharts 仍保留 + 其它）。
- npm install 时间 -10s。
- 安全审计 / dependabot 面积减少。
- 移除孤儿源码避免后续误用 echarts（已经导致 manualChunks 配置混淆）。

---

## 7. 备注

- 任务书提到的 `vite-bundle-visualizer` 已运行，输出存放在 `C:/Users/gaaiy/AppData/Local/Temp/bundle-list.json`（JSON-like YAML），本报告 §2 的 Top 10 即由该数据聚合。
- Playwright 性能 spec 已落地：`frontend/e2e/perf-baseline.spec.ts` + 两个 config (`playwright.perf.config.ts`, `playwright.perf-dev.config.ts`)，可重复运行。
- 任何"已实现的优化"对照源码确认：本次未修改任何源码（含 `vite.config.ts`），仅新增 3 个测试脚本到 `e2e/` 和 `frontend/`。
- 没改 `package.json` / 没动 `node_modules`。
