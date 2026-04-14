#!/usr/bin/env bash
set -euo pipefail

SERVICE=sub2api
SRC_BIN=/tmp/sub2api-embed
DST_BIN=/opt/sub2api/sub2api
BACKUP_DIR=/opt/sub2api
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_BIN="$BACKUP_DIR/sub2api.bak.$STAMP"

if [[ ! -f "$SRC_BIN" ]]; then
  echo "Missing $SRC_BIN"
  exit 1
fi

echo "Stopping $SERVICE..."
sudo systemctl stop "$SERVICE"

echo "Backing up current binary to $BACKUP_BIN..."
sudo cp "$DST_BIN" "$BACKUP_BIN"

echo "Installing embed binary..."
sudo cp "$SRC_BIN" "$DST_BIN"
sudo chown root:root "$DST_BIN"
sudo chmod 755 "$DST_BIN"

echo "Starting $SERVICE..."
sudo systemctl start "$SERVICE"
sudo systemctl status "$SERVICE" --no-pager

echo
echo "Verifying / endpoint..."
curl -sSI http://127.0.0.1:8080/ | sed -n '1,10p'

echo
echo "If needed, rollback with:"
echo "  sudo cp '$BACKUP_BIN' '$DST_BIN' && sudo systemctl restart '$SERVICE'"
