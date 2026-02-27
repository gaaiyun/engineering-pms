#!/bin/bash
# SQLite 安全备份脚本 - 使用 .backup 命令确保 WAL 数据完整
# 策略：每12小时执行一次，保留60天，超期自动清理
# cron 示例: 0 */12 * * * /path/to/backup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="$SCRIPT_DIR/pb_data/data.db"
BACKUP_DIR="$SCRIPT_DIR/backups"
RETENTION_DAYS=60
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/data_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "[ERROR] 数据库文件不存在: $DB_PATH"
  exit 1
fi

# 使用 sqlite3 .backup 安全备份（包含 WAL 未刷盘数据）
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
if [ $? -eq 0 ]; then
  echo "[OK] 备份成功: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "[ERROR] 备份失败"
  exit 1
fi

# 清理超过60天的旧备份
DELETED=$(find "$BACKUP_DIR" -name "data_*.db" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "[CLEANUP] 已清理 ${DELETED} 个过期备份"
