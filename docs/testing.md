# 测试规范文档

## 零、项目路径与适用范围

- 本文档适用于项目 **`G:\项目管理软件_v2`**。
- 以下所有命令均在 **`G:\项目管理软件_v2\frontend`** 目录下执行（`npm test`、`npm run test:watch`、`npm run test:coverage`、`npm run test:e2e`）。
- 测试文件与目录结构均相对于 `项目管理软件_v2/frontend/src/`，请勿与其它项目（如 `G:\项目管理软件`）混淆。

## 一、技术栈

| 工具 | 用途 |
|------|------|
| Vitest | 测试运行器 + 断言库 |
| @testing-library/react | 组件渲染与交互测试 |
| @testing-library/jest-dom | DOM 断言扩展 |
| @testing-library/user-event | 用户交互模拟 |
| happy-dom | 浏览器环境模拟 |
| @vitest/coverage-v8 | 覆盖率收集 |

## 二、命令

```bash
# 运行全部测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 三、目录与命名约定

- 测试文件与源码**同目录**放置
- 命名：`<源文件名>.test.ts` 或 `<源文件名>.test.tsx`
- Setup 文件：`src/test/setup.ts`

```
src/
├── lib/
│   ├── task-parser.ts
│   ├── task-parser.test.ts      ← 单元测试
│   ├── api.ts
│   ├── api.test.ts              ← 单元测试
│   ├── queryClient.ts
│   ├── queryClient.test.ts      ← 单元测试
│   └── hooks.test.tsx           ← API hooks 集成测试
├── components/
│   ├── EmptyState.tsx
│   ├── EmptyState.test.tsx      ← 组件测试
│   └── kanban/
│       └── TaskCard.test.tsx    ← 组件测试
├── App.tsx
├── App.test.tsx                 ← 路由/权限测试
└── test/
    └── setup.ts                 ← 全局 setup
```

## 四、测试分层

### 4.1 单元测试（纯函数/工具）

- 目标：`lib/` 下的纯函数（`task-parser`、`queryKeys`、`isManagerRole` 等）
- 不依赖 DOM，不需要 React 渲染
- 覆盖率目标：`task-parser.ts` ≥ 90%

### 4.2 组件测试

- 目标：UI 组件的渲染与交互
- 使用 `@testing-library/react` 的 `render` + `screen`
- 只测用户可见行为，不测内部实现

### 4.3 集成测试（Hooks）

- 目标：TanStack Query hooks（`useProjects`、`useTask` 等）
- 使用 `renderHook` + `QueryClientProvider`
- Mock `pb.collection()` 方法，验证请求与返回

## 五、用例书写规范

1. **一条用例只验证一个行为**
2. **描述使用中文**，格式：`it('当 X 时，应 Y')`
3. **每类输入至少覆盖**：正常值、边界值、非法值
4. **不测实现细节**：不断言内部 state 变量名，只测对外行为

```typescript
// 好的写法
it('当日期为 +7 时，应解析为 baseDate 后 7 天', () => {
  const d = parseFlexibleDate('+7', '2026-03-01')
  expect(d?.getDate()).toBe(8)
})

// 避免的写法
it('test parseFlexibleDate', () => {
  // 描述不清晰，多个断言混在一起
  expect(parseFlexibleDate('+7', '2026-03-01')).toBeTruthy()
  expect(parseFlexibleDate('abc', '2026-03-01')).toBeUndefined()
})
```

## 六、Mock 规范

### 6.1 PocketBase Mock

所有涉及 `pb` 的测试统一 mock `lib/pocketbase` 模块：

```typescript
vi.mock('./pocketbase', () => ({
  pb: {
    authStore: {
      isValid: true,
      model: { id: 'u1', role: 'admin' },
    },
    collection: () => ({
      getFullList: vi.fn().mockResolvedValue([]),
      getOne: vi.fn().mockResolvedValue({}),
    }),
  },
}))
```

### 6.2 路由 Mock

使用 `MemoryRouter` 控制初始路径：

```typescript
render(
  <MemoryRouter initialEntries={['/protected']}>
    <Routes>
      <Route path="/login" element={<div>Login</div>} />
      <Route path="/protected" element={<GuardedComponent />} />
    </Routes>
  </MemoryRouter>
)
```

### 6.3 第三方库 Mock

- `@dnd-kit/sortable`：mock `useSortable` 返回空对象
- `@capacitor/app`：mock `addListener` 为 `vi.fn()`

## 七、覆盖率

| 范围 | 语句/分支目标 |
|------|--------------|
| `lib/task-parser.ts` | ≥ 90% |
| 新增代码 | ≥ 80% |
| 旧代码 | 逐步提升 |

配置位于 `vitest.config.ts` 的 `test.coverage` 字段。

## 八、新功能开发要求

- 新增纯函数/工具：**必须**附带单元测试
- 新增组件：**建议**附带基本渲染测试
- 新增 API hook：**建议**附带 mock 集成测试
- PR 中测试不通过则不允许合并
