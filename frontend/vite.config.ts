import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: {
    force: true,
  },
  build: {
    // Bundle optimization (Agent D 建议)：route-level React.lazy 已减 43% gzip，
    // 这里再用 manualChunks 把大库拆出来供长期缓存。
    rollupOptions: {
      output: {
        manualChunks: {
          // antd-mobile 是体积最大的 UI 库（含图标 + 组件）
          'vendor-antd-mobile': ['antd-mobile', 'antd-mobile-icons'],
          // ECharts + Recharts 在 ProjectTimeline / AdminDashboard 等图表页面用
          'vendor-charts': ['echarts', 'echarts-for-react', 'recharts'],
          // framer-motion 动画库
          'vendor-motion': ['framer-motion'],
          // TanStack Query + Table
          'vendor-tanstack': ['@tanstack/react-query', '@tanstack/react-table', '@tanstack/react-virtual'],
          // react-icons 图标 tree-shaking 不彻底，拆出来
          'vendor-icons': ['react-icons/io5', 'react-icons'],
          // dnd-kit 系列
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // PocketBase SDK
          'vendor-pb': ['pocketbase'],
          // dayjs date
          'vendor-date': ['dayjs'],
        },
      },
    },
    // 主 chunk 警告阈值放宽到 600 KB（split 后单 chunk 应该 < 500 但留余地）
    chunkSizeWarningLimit: 600,
  },
})
