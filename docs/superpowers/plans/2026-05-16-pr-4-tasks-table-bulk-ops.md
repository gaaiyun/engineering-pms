# PR 4: 任务表格视图 + 批量操作 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`. Steps use checkbox.

**Goal:** 桌面端 (≥1024px) 在 MyTasks 页显示 TanStack Table 表格视图，支持列排序、多选、批量改状态/指派；移动端保留原卡片视图。

**Architecture:** 新建 `<TasksTableView>` 组件用 @tanstack/react-table v8；在 `MyTasks.tsx` 内根据 `useBreakpoint()` 切换；批量操作通过 mutation 调用现有 `useUpdateTask`。

**Tech Stack:** @tanstack/react-table v8（新依赖，+~50KB gzip）+ AntD Mobile（Tag/Toast/Dialog 沿用）+ 现有 useMyTasks / useUpdateTask。

**Spec：** `docs/superpowers/specs/2026-05-16-pms-notification-and-desktop-design.md` §4 PR 4

---

## 0. 文件结构

| 文件 | 状态 |
|---|---|
| `frontend/package.json` | 加 `@tanstack/react-table` 依赖 |
| `frontend/src/components/tasks/TasksTableView.tsx` | 新建 — 桌面表格 |
| `frontend/src/components/tasks/TasksBulkBar.tsx` | 新建 — 批量操作栏 |
| `frontend/src/components/tasks/TasksTableView.test.tsx` | 新建 — 测试 |
| `frontend/src/pages/MyTasks.tsx` | 修改 — 桌面 fallback 到 TasksTableView |

---

## Task 1: 装依赖 + 测试基础设施 ready

- [ ] **Step 1.1:**

```bash
cd "G:/项目管理软件_v2/frontend"
npm install @tanstack/react-table@^8.21.0 --save 2>&1 | tail -5
```

Expected: 1 package added, 0 vulnerabilities new。

- [ ] **Step 1.2: Commit lock file 变化**

```bash
cd "G:/项目管理软件_v2"
git add frontend/package.json frontend/package-lock.json
git commit -m "build(deps): add @tanstack/react-table v8 for desktop tasks table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 2: TasksTableView 组件

- [ ] **Step 2.1: 创建 `frontend/src/components/tasks/TasksTableView.tsx`**

完整内容（代码在 plan 文件外的实际执行 step 里展示）。

- [ ] **Step 2.2: 写单元测试**

完整内容（同上）。

- [ ] **Step 2.3: 跑测试 + tsc**

```bash
cd "G:/项目管理软件_v2/frontend"
npx vitest run src/components/tasks/
npx tsc --noEmit
```

Expected: all pass, 0 errors

- [ ] **Step 2.4: Commit**

```bash
git add frontend/src/components/tasks/
git commit -m "feat(tasks): add TasksTableView with sortable columns + multi-select

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 3: 接入 MyTasks.tsx

- [ ] **Step 3.1: 修改 MyTasks.tsx 在桌面端 render TasksTableView**

- [ ] **Step 3.2: tsc + test + build**

- [ ] **Step 3.3: Commit + push**

---

## 验收

- npm test 全绿
- tsc 0 错
- build 成功
- 浏览器：桌面端看到表格、移动端看到卡片

详细代码与命令在执行时一次性产出。
