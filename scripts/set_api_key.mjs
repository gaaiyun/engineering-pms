/**
 * 设置 AI API Key 到数据库（可选）
 * 或者直接告诉用户如何在前端设置
 */

const envKey = (process.env.SILICONFLOW_API_KEY || process.env.SF_API_KEY || '').trim()
const masked =
  envKey.length >= 12 ? `${envKey.slice(0, 6)}...${envKey.slice(-4)}` : (envKey ? '***' : '')

console.log(`
═══════════════════════════════════════════════════
     🔑 AI API Key 配置指南（不在仓库保存明文 Key）
═══════════════════════════════════════════════════

当前环境变量:
  - SILICONFLOW_API_KEY / SF_API_KEY: ${masked || '(未设置)'}

推荐配置方法:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

方法 1：前端页面配置（推荐）
  1) 登录系统
  2) 进入 “AI 决策” 或 “设置”
  3) 找到 “API Key” 配置项
  4) 粘贴你的 Key 并保存

方法 2：浏览器开发者工具（临时）
  1) 打开 Console（F12）
  2) 执行：
     localStorage.setItem('sf_api_key', 'sk-YOUR_SILICONFLOW_API_KEY')
  3) 刷新页面

⚠️ 安全提示：
  - 不要把真实 Key 写进 .md / .bat / .js 文件或提交到 Git
  - 若 Key 已泄露，请立即在平台侧作废并重签发

═══════════════════════════════════════════════════
`)
