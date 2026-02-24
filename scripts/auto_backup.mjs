/**
 * 🔄 PocketBase 自动备份脚本
 * 
 * 策略：每12小时备份一次，保留60天（约120份）
 * 
 * 用法：
 *   node auto_backup.mjs
 * 
 * 定时任务（Linux crontab）：
 *   0 */12 * * * cd /www/server/pocketbase && node /path/to/auto_backup.mjs >> /var/log/pb_backup.log 2>&1
 * 
 * 环境变量（可选）：
 *   PB_DATA_DIR  - pb_data 目录路径，默认 ../backend/pb_data（本地）或 /www/server/pocketbase/pb_data（服务器）
 *   BACKUP_DIR   - 备份存放目录，默认 ../backups
 *   KEEP_DAYS    - 保留天数，默认 60
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============ 配置 ============
const isLinux = process.platform === 'linux'
const defaultDataDir = isLinux
  ? '/www/server/pocketbase/pb_data'
  : path.resolve(__dirname, '../backend/pb_data')

const PB_DATA_DIR = (process.env.PB_DATA_DIR || defaultDataDir).trim()
const BACKUP_DIR = (process.env.BACKUP_DIR || path.resolve(__dirname, '../backups')).trim()
const KEEP_DAYS = parseInt(process.env.KEEP_DAYS || '60', 10)
const DB_FILE = path.join(PB_DATA_DIR, 'data.db')

// ============ 主逻辑 ============
function main() {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  
  console.log(`\n[${now.toLocaleString('zh-CN')}] 🔄 开始备份...`)
  console.log(`  源文件: ${DB_FILE}`)
  console.log(`  备份目录: ${BACKUP_DIR}`)

  // 1. 检查源文件
  if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ 数据库文件不存在: ${DB_FILE}`)
    process.exit(1)
  }

  // 2. 创建备份目录
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  // 3. 使用 sqlite3 .backup 安全备份（处理 WAL 模式）
  const backupName = `data_${timestamp}.db`
  const backupPath = path.join(BACKUP_DIR, backupName)
  
  try {
    // 优先使用 sqlite3 的 .backup 命令，确保 WAL 数据完整
    try {
      execSync(`sqlite3 "${DB_FILE}" ".backup '${backupPath}'"`, { timeout: 60000 })
    } catch {
      // sqlite3 不可用时，回退到复制 db + wal + shm
      console.log(`  ⚠️ sqlite3 不可用，回退到文件复制（含 WAL）`)
      fs.copyFileSync(DB_FILE, backupPath)
      const walFile = DB_FILE + '-wal'
      const shmFile = DB_FILE + '-shm'
      if (fs.existsSync(walFile)) fs.copyFileSync(walFile, backupPath + '-wal')
      if (fs.existsSync(shmFile)) fs.copyFileSync(shmFile, backupPath + '-shm')
    }
    const sizeMB = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(2)
    console.log(`  ✅ 备份完成: ${backupName} (${sizeMB} MB)`)
  } catch (e) {
    console.error(`  ❌ 复制失败: ${e.message}`)
    process.exit(1)
  }

  // 4. 压缩（如果有 gzip）
  try {
    if (isLinux) {
      execSync(`gzip "${backupPath}"`)
      console.log(`  ✅ 已压缩: ${backupName}.gz`)
    }
  } catch {
    console.log(`  ℹ️ 跳过压缩（gzip 不可用）`)
  }

  // 5. 清理过期备份
  cleanOldBackups()

  console.log(`  🎉 备份流程完成\n`)
}

function cleanOldBackups() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
  let cleaned = 0

  try {
    const files = fs.readdirSync(BACKUP_DIR)
    for (const file of files) {
      if (!file.startsWith('data_')) continue
      const filePath = path.join(BACKUP_DIR, file)
      const stat = fs.statSync(filePath)
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log(`  🧹 已清理 ${cleaned} 个过期备份（>${KEEP_DAYS}天）`)
    } else {
      console.log(`  ℹ️ 无过期备份需清理`)
    }
  } catch (e) {
    console.error(`  ⚠️ 清理失败: ${e.message}`)
  }
}

main()
