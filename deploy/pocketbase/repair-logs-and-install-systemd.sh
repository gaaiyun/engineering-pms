#!/usr/bin/env bash
set -Eeuo pipefail

BASE=/www/server/pocketbase
DATA_DIR="$BASE/pb_data"
PB_BIN="$BASE/pocketbase"
UNIT=/etc/systemd/system/pocketbase.service
STAMP="$(date +%Y%m%d_%H%M%S)"
MAINT_ROOT="$BASE/maintenance_backups/$STAMP"
BACKUP_DIR="$MAINT_ROOT/pb_data"
QUARANTINE_DIR="$MAINT_ROOT/corrupt_logs"
HEALTH_URL=http://127.0.0.1:8090/api/health
SERVICE_READY=0

fail() {
  echo "ERROR: $*" >&2
  return 1
}

start_fallback() {
  if ! ss -lnt | grep -q ':8090 '; then
    echo "Restoring temporary PocketBase process..."
    cd "$BASE"
    nohup "$PB_BIN" serve --http=0.0.0.0:8090 > "$BASE/pb.log" 2>&1 &
  fi
}

on_error() {
  code=$?
  echo "Maintenance failed with exit code $code." >&2
  if [[ $SERVICE_READY -eq 0 ]]; then
    systemctl stop pocketbase.service >/dev/null 2>&1 || true
    start_fallback || true
  fi
  exit "$code"
}
trap on_error ERR

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Run this script as root."
[[ -x "$PB_BIN" ]] || fail "PocketBase executable not found: $PB_BIN"
[[ -f "$DATA_DIR/data.db" ]] || fail "Business database not found: $DATA_DIR/data.db"
[[ -f "$DATA_DIR/logs.db" ]] || fail "Log database not found: $DATA_DIR/logs.db"
command -v sqlite3 >/dev/null || fail "sqlite3 is required."
command -v systemctl >/dev/null || fail "systemd is required."

echo "PocketBase: $($PB_BIN --version)"
data_bytes="$(du -sb "$DATA_DIR" | awk '{print $1}')"
free_bytes="$(df -PB1 "$BASE" | awk 'NR==2 {print $4}')"
required_bytes=$((data_bytes + 5 * 1024 * 1024 * 1024))
(( free_bytes >= required_bytes )) || fail "Not enough disk space for backup plus 5 GiB reserve."

mkdir -p "$MAINT_ROOT" "$QUARANTINE_DIR"
echo "Stopping the temporary PocketBase process..."
pkill -TERM -x pocketbase || true
for _ in $(seq 1 20); do
  ss -lnt | grep -q ':8090 ' || break
  sleep 1
done
ss -lnt | grep -q ':8090 ' && fail "Port 8090 is still listening."

echo "Copying cold backup to $BACKUP_DIR ..."
cp -a "$DATA_DIR" "$BACKUP_DIR"
[[ -f "$BACKUP_DIR/data.db" ]] || fail "Backup verification failed."

echo "Checking business database..."
data_check="$(sqlite3 "$DATA_DIR/data.db" 'PRAGMA quick_check;')"
printf '%s\n' "$data_check" | tee "$MAINT_ROOT/data.quick_check.txt"
[[ "$data_check" == "ok" ]] || fail "data.db quick_check is not ok; log repair aborted."

echo "Checking and quarantining the damaged log database..."
sqlite3 "$DATA_DIR/logs.db" 'PRAGMA quick_check;' > "$MAINT_ROOT/logs.quick_check.txt" 2>&1 || true
for file in logs.db logs.db-wal logs.db-shm; do
  [[ -e "$DATA_DIR/$file" ]] && mv "$DATA_DIR/$file" "$QUARANTINE_DIR/$file"
done

if [[ -f "$UNIT" ]]; then
  cp -a "$UNIT" "$MAINT_ROOT/pocketbase.service.previous"
fi

cat > "$UNIT" <<'UNIT_EOF'
[Unit]
Description=EngineeringPMS PocketBase
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/www/server/pocketbase
ExecStart=/www/server/pocketbase/pocketbase serve --http=0.0.0.0:8090
Restart=always
RestartSec=5
LimitNOFILE=4096
SyslogIdentifier=engineering-pms-pocketbase

[Install]
WantedBy=multi-user.target
UNIT_EOF

systemctl daemon-reload
systemctl enable --now pocketbase.service
for _ in $(seq 1 30); do
  curl -fsS "$HEALTH_URL" >/dev/null && break
  sleep 1
done
curl -fsS "$HEALTH_URL" | tee "$MAINT_ROOT/health-after-repair.json"
[[ -f "$DATA_DIR/logs.db" ]] || fail "PocketBase did not recreate logs.db."
[[ "$(sqlite3 "$DATA_DIR/logs.db" 'PRAGMA quick_check;')" == "ok" ]] || fail "Recreated logs.db is not healthy."

echo "Testing systemd automatic restart..."
old_pid="$(systemctl show -p MainPID --value pocketbase.service)"
kill -TERM "$old_pid"
for _ in $(seq 1 20); do
  sleep 1
  new_pid="$(systemctl show -p MainPID --value pocketbase.service)"
  [[ "$new_pid" != "0" && "$new_pid" != "$old_pid" ]] && curl -fsS "$HEALTH_URL" >/dev/null && break
done
new_pid="$(systemctl show -p MainPID --value pocketbase.service)"
[[ "$new_pid" != "0" && "$new_pid" != "$old_pid" ]] || fail "systemd did not restart PocketBase."

echo "Migrating to a dedicated service account..."
id pocketbase >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /sbin/nologin pocketbase
systemctl stop pocketbase.service
chown -R pocketbase:pocketbase "$DATA_DIR" "$BASE/maintenance_backups"
find "$DATA_DIR" -type d -exec chmod 750 {} +
find "$DATA_DIR" -type f -exec chmod 640 {} +
chown root:root "$PB_BIN"
chmod 755 "$PB_BIN"
sed -i 's/^User=root$/User=pocketbase/; s/^Group=root$/Group=pocketbase/' "$UNIT"
systemctl daemon-reload
systemctl start pocketbase.service
for _ in $(seq 1 30); do
  curl -fsS "$HEALTH_URL" >/dev/null && break
  sleep 1
done
curl -fsS "$HEALTH_URL" | tee "$MAINT_ROOT/health-dedicated-user.json"
systemctl is-enabled pocketbase.service
systemctl is-active pocketbase.service
SERVICE_READY=1

echo "Monitoring PocketBase journal for 10 minutes..."
monitor_start="$(date '+%Y-%m-%d %H:%M:%S')"
for _ in $(seq 1 20); do
  sleep 30
  if journalctl -u pocketbase.service --since "$monitor_start" --no-pager | grep -qi 'database disk image is malformed'; then
    fail "Malformed database error returned during monitoring."
  fi
  curl -fsS "$HEALTH_URL" >/dev/null
done

echo "PocketBase recovery completed. Backup: $MAINT_ROOT"
echo "Next: configure Nginx /pb, verify Web/APK, then bind PocketBase to 127.0.0.1 and close public 8090."
