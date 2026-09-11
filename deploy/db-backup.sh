#!/usr/bin/env bash
#
# 数据库本机备份：由服务器 crontab 每 6 小时执行一次，保留最近 14 天。
# 先写临时文件、成功后再改名，避免 dump 中途失败留下一个看似正常的坏备份。
#
# 安装：见 deploy/server-setup.md「数据库备份」一节

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/debate}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F-%H%M)"
TARGET="$BACKUP_DIR/debate-$STAMP.sql.gz"
TEMP="$BACKUP_DIR/.debate-$STAMP.sql.gz.part"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

docker compose --env-file "$APP_DIR/.env.production" exec -T db \
  pg_dump -U debate debate | gzip > "$TEMP"

mv "$TEMP" "$TARGET"
# 保留一份固定名字的副本，方便恢复演练和手动取用
cp -f "$TARGET" "$BACKUP_DIR/debate-latest.sql.gz"

find "$BACKUP_DIR" -name 'debate-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date -Is)] 备份完成：$TARGET（$(du -h "$TARGET" | cut -f1)）"
