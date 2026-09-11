#!/usr/bin/env bash
#
# 容器自愈：由服务器 crontab 每分钟执行一次。
#   - 健康检查为 unhealthy 的容器 → 重启（覆盖"进程没死但已经不可用"的假活）
#   - 长驻容器意外处于 exited/dead → 启动（restart policy 已放弃或被人为停止时兜底）
#   - 证书续期后 nginx 不会自动加载新证书 → 检测到变更即重载
# 一次性任务（migrate）不在此管理范围内。
#
# 安装：见 deploy/server-setup.md「进程自愈」一节

set -uo pipefail

APP_DIR="${APP_DIR:-/opt/debate}"
PROJECT="${PROJECT:-debate}"
SELF_LOG="${SELF_LOG:-/var/log/debate-heal.log}"
RELOAD_MARKER="/var/lib/debate-cert-reload"
CERT_PATH="/etc/letsencrypt/live/burninginsight.com/fullchain.pem"
LOG_LIMIT_BYTES=$((1024 * 1024))
ONESHOT_SERVICES="migrate"

log() { echo "[$(date -Is)] $*"; }

# 日志自身也要轮转，避免长期运行把磁盘写满
if [ -f "$SELF_LOG" ] && [ "$(stat -c %s "$SELF_LOG" 2>/dev/null || echo 0)" -gt "$LOG_LIMIT_BYTES" ]; then
  tail -n 200 "$SELF_LOG" > "$SELF_LOG.tmp" && mv "$SELF_LOG.tmp" "$SELF_LOG"
fi

cd "$APP_DIR" || exit 1

for container in $(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT"); do
  service="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container" 2>/dev/null)"
  [ -n "$service" ] || continue
  case " $ONESHOT_SERVICES " in *" $service "*) continue ;; esac

  name="$(docker inspect -f '{{.Name}}' "$container" 2>/dev/null | sed 's|^/||')"
  state="$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null)"

  if [ "$health" = "unhealthy" ]; then
    log "重启不健康容器 $name"
    docker restart "$container" >/dev/null
  elif [ "$state" = "exited" ] || [ "$state" = "dead" ]; then
    log "启动已停止容器 $name（state=$state）"
    docker start "$container" >/dev/null
  fi
done

# 证书续期后 nginx 仍持有旧证书：文件更新时间变化时重载一次
cert_mtime="$(docker exec debate-certbot-1 stat -c %Y "$CERT_PATH" 2>/dev/null || true)"
if [ -n "$cert_mtime" ]; then
  last_mtime="$(cat "$RELOAD_MARKER" 2>/dev/null || echo '')"
  if [ "$cert_mtime" != "$last_mtime" ]; then
    if docker exec debate-web-1 nginx -s reload >/dev/null 2>&1; then
      log "证书已更新（mtime=$cert_mtime），nginx 已重载"
      echo "$cert_mtime" > "$RELOAD_MARKER"
    else
      log "nginx 重载失败，下一轮重试"
    fi
  fi
fi
