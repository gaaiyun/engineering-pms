# SQLite 安全备份脚本 (Windows PowerShell)
# 使用 sqlite3 .backup 命令确保 WAL 数据完整
# 策略：每12小时执行一次，保留60天，超期自动清理
# Windows 计划任务: schtasks /create /tn "PB_Backup" /tr "powershell -File backup.ps1" /sc hourly /mo 12

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DbPath = Join-Path $ScriptDir "pb_data\data.db"
$BackupDir = Join-Path $ScriptDir "backups"
$RetentionDays = 60
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "data_${Timestamp}.db"

if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

if (!(Test-Path $DbPath)) {
    Write-Host "[ERROR] 数据库文件不存在: $DbPath"
    exit 1
}

# 使用 sqlite3 .backup 安全备份（包含 WAL 未刷盘数据）
$sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
if (!$sqlite) {
    # 尝试使用 PocketBase 内置的 SQLite 复制（通过 API）
    Write-Host "[WARN] sqlite3 未找到，使用文件复制（请确保 PocketBase 未在写入）"
    Copy-Item $DbPath $BackupFile
    $walFile = "$DbPath-wal"
    if (Test-Path $walFile) { Copy-Item $walFile "$BackupFile-wal" }
} else {
    & sqlite3 $DbPath ".backup '$BackupFile'"
}

if (Test-Path $BackupFile) {
    $size = (Get-Item $BackupFile).Length / 1MB
    Write-Host "[OK] 备份成功: $BackupFile ($([math]::Round($size,2)) MB)"
} else {
    Write-Host "[ERROR] 备份失败"
    exit 1
}

# 清理超过60天的旧备份
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$old = Get-ChildItem $BackupDir -Filter "data_*.db" | Where-Object { $_.LastWriteTime -lt $cutoff }
$count = ($old | Measure-Object).Count
$old | Remove-Item -Force
Write-Host "[CLEANUP] 已清理 ${count} 个过期备份"
