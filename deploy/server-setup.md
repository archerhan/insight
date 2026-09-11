# 阿里云服务器上线手册（cn-beijing / 2C2G）

本地与服务器跑的是同一套 `docker-compose.yml`：Postgres 与应用同机，不依赖 Neon。
服务器只负责拉取镜像和运行容器，镜像由 GitHub Actions 构建后推到 ACR。

## 0. 需要在 GitHub 里配置的 Secrets

仓库 `Settings → Secrets and variables → Actions → New repository secret`：

| 名称 | 值 | 说明 |
| --- | --- | --- |
| `ACR_REGISTRY` | `registry.example.com` | 公网地址，CI 推送用 |
| `ACR_NAMESPACE` | `archerhan` | 命名空间 |
| `ACR_USERNAME` | `your-registry-user` | 控制台「访问凭证」页的登录用户名 |
| `ACR_PASSWORD` | 控制台设置的 Registry 固定密码 | |
| `SSH_HOST` | 服务器公网 IP | 不填则只推镜像、不自动部署 |
| `SSH_USER` | 登录用户，如 `root` | |
| `SSH_KEY` | 部署用私钥的完整内容 | 建议单独生成一对，见下 |
| `SSH_PORT` | `22` | 可选 |
| `SSH_APP_DIR` | `/opt/debate` | 可选，默认就是这个 |

生成一对专用部署密钥（公钥写进服务器 `~/.ssh/authorized_keys`，私钥内容粘进 `SSH_KEY`）：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/debate_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/debate_deploy
```

## 1. 服务器一次性准备

安全组只放行 80 / 443 与 SSH 端口。不要放行 3000 与 5432，它们只在服务器本机可访问。

```bash
# Alibaba Cloud Linux / CentOS
sudo dnf install -y docker && sudo systemctl enable --now docker
# Ubuntu / Debian 改用：sudo apt update && sudo apt install -y docker.io docker-compose-v2

sudo mkdir -p /opt/debate /opt/backups && sudo chown -R "$USER" /opt/debate /opt/backups
```

如果拉 Docker Hub 基础镜像不稳定（国内常见），配置镜像加速器：
控制台 → 容器镜像服务 → 镜像工具 → 镜像加速器，把地址写进 `/etc/docker/daemon.json` 后 `sudo systemctl restart docker`。
也可以改用 ACR 里的副本，见第 3 节。

## 2. 登录 ACR

```bash
# 内网地址（推荐：同地域，快且不计公网流量）
docker login --username=your-registry-user registry.example.com

# 内网不通（跨地域/跨 VPC）时改用公网地址
docker login --username=your-registry-user registry.example.com
```

登录后凭证存在服务器的 `/root/.docker/config.json`，之后拉取不再需要密码。

## 3. 写生产环境变量

```bash
cd /opt/debate
cp /path/to/deploy/.env.production.example .env.production   # 或按模板手动创建
chmod 600 .env.production
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

必填：`POSTGRES_PASSWORD`、`AUTH_SECRET`、`AUTH_URL`（正式域名，https）、`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`、`CRON_SECRET`。
GitHub OAuth App 的回调地址登记为 `{AUTH_URL}/api/auth/callback/github`。

邮箱注册（验证码）和忘记密码（重置链接）都需要 SMTP：`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
（阿里云邮件推送地址为 `smtpdm.aliyun.com`，端口 465、加密开启；发件地址需在控制台验证过）。
阿里云邮件推送的免费额度是「每个主账户共 2000 封、每天最多 200 封」；未配置 SMTP 时注册与找回密码都会提示"邮件服务尚未配置"。

也可以改用 Resend（免费 3000 封/月、每天 100 封，不要求域名备案，只需在 DNS 加 SPF/DKIM 记录）：

```bash
RESEND_API_KEY=re_xxx
MAIL_FROM=灼见 <no-reply@burninginsight.com>   # 域名需在 Resend 控制台验证通过
```

两个通道都配了时优先走 Resend；本地可用 `pnpm mail:test you@example.com` 验证发信是否通畅。

改用阿里云邮件推送（华东1）时，控制台里要先完成「发信域名验证 → 新建发信地址 → 设置 SMTP 密码」，
然后在 `.env.production` 写：

```bash
MAIL_PROVIDER=smtp                          # 关键：否则残留的 RESEND_API_KEY 会继续抢优先级
MAIL_FROM=灼见 <no-reply@burninginsight.com>  # 必须与控制台的发信地址一致
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@burninginsight.com
SMTP_PASS=控制台设置的 SMTP 密码
RESEND_API_KEY=                             # 切走 Resend 时清空
```

云服务器已禁用 25 端口，务必用 465（SSL）；新发信地址创建后需等 10 分钟才能发信。

可选：若服务器拉不动 Docker Hub 基础镜像，在 ACR 里再建 `postgres`、`node` 两个仓库，
从能拉动的机器把它们推上去，然后在 `.env.production` 里打开 `POSTGRES_IMAGE` / `NODE_IMAGE` 两行。

```bash
# 在本机（已能拉 Docker Hub）执行
docker tag postgres:16-alpine <ACR>/archerhan/postgres:16-alpine
docker tag node:24-alpine     <ACR>/archerhan/node:24-alpine
docker push <ACR>/archerhan/postgres:16-alpine
docker push <ACR>/archerhan/node:24-alpine
```

## 4. 首次启动

`docker-compose.yml` 与 `docker/scheduler.mjs` 由 Deploy 工作流每次发布时自动同步到 `/opt/debate`；
也可以先手动 scp 上去，或在 Actions 页手动跑一次 Deploy（没配 SSH Secret 时它只推镜像）。

```bash
cd /opt/debate
docker compose --env-file .env.production up -d --no-build
docker compose --env-file .env.production ps
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/    # 期望 200
```

启动顺序由 compose 保证：`db` 健康 → `migrate` 迁移成功 → `app` 起来 → `scheduler` 挂上。
注意始终带 `--no-build`：服务器上没有构建上下文（Dockerfile 不在这台机器上），镜像一律从 ACR 拉取。

## 5. Nginx + HTTPS

```nginx
# /etc/nginx/conf.d/debate.conf
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名      # 自动改写为 443 并配置续期
```

## 6. 备份与进程自愈

两个脚本由 Deploy 工作流自动同步到 `/opt/debate/`，只需在服务器上装一次 crontab：

```bash
chmod +x /opt/debate/db-backup.sh /opt/debate/heal.sh
sudo tee /etc/cron.d/debate > /dev/null <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/1 * * * * root /opt/debate/heal.sh >> /var/log/debate-heal.log 2>&1
0 */6 * * * root /opt/debate/db-backup.sh >> /var/log/debate-backup.log 2>&1
CRON
sudo chmod 644 /etc/cron.d/debate
sudo systemctl restart crond
cat /etc/cron.d/debate
```

用 `/etc/cron.d/` 而不是 `crontab -l | … | crontab -`：后者在 crontab 为空时会因为管道退出码
导致整个替换中断，反而写进一张空表。声明式文件没有这个坑，也方便版本化。

- `heal.sh`（每分钟）：把健康检查为 `unhealthy` 的容器重启、把意外停止的长驻容器拉起，
  并在证书续期后重载 nginx。日志在 `/var/log/debate-heal.log`。
- `db-backup.sh`（每 6 小时）：导出到 `/opt/backups/debate-日期-时间.sql.gz`，
  另外保留一份 `debate-latest.sql.gz`，自动清理 14 天前的文件。

手动执行与验证：

```bash
/opt/debate/db-backup.sh && ls -lh /opt/backups | tail -3
/opt/debate/heal.sh && tail -5 /var/log/debate-heal.log
```

恢复演练（恢复到临时库，不会影响生产库）：

```bash
cd /opt/debate
docker compose --env-file .env.production exec -T db psql -U debate -d postgres -c 'DROP DATABASE IF EXISTS restore_check'
docker compose --env-file .env.production exec -T db psql -U debate -d postgres -c 'CREATE DATABASE restore_check'
gunzip -c /opt/backups/debate-latest.sql.gz | docker compose --env-file .env.production exec -T db psql -U debate -d restore_check >/dev/null
docker compose --env-file .env.production exec -T db psql -U debate -d restore_check -tAc 'select count(*) from topics'
docker compose --env-file .env.production exec -T db psql -U debate -d postgres -c 'DROP DATABASE restore_check'
```

数据本体在 `db-data` 卷里，`docker compose down` 不会删；只有 `down -v` 才会清空。
注意本机备份与数据库在同一块云盘上，无法抵御整机或磁盘故障——异地备份（OSS）属于后续计划。

## 7. 日常发布与回滚

推送到 `main` → CI 跑门禁 → 通过后 Deploy 自动构建镜像、推送 ACR、SSH 拉取重启。
服务器全程不构建，整个过程约 1–2 分钟。

回滚时把镜像标签换成上一个 commit（迁移不可逆，跨含新迁移的版本前先确认）：

```bash
cd /opt/debate
APP_IMAGE=<repo>:<旧 sha> MIGRATE_IMAGE=<repo>:<旧 sha>-migrate \
  docker compose --env-file .env.production up -d --no-build
```

清理旧镜像用 `docker image prune -af`：它只删未被使用的镜像，不影响运行中的容器与 `db-data` 卷。

## 8. 排错

```bash
docker compose --env-file .env.production ps            # 看谁没起来
docker compose --env-file .env.production logs -f app   # 应用日志
docker compose --env-file .env.production logs migrate  # 迁移日志
docker compose --env-file .env.production exec db psql -U debate -d debate
```

2C2G 上若发现构建吃紧，先确认没有在服务器上执行 `docker compose build`——镜像应该在 CI 里构建。
另外建议给服务器加 2GB swap 作为兜底：

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
