# 多阶段构建：依赖 → 构建 → 迁移工具 → 运行时。
# 运行时镜像只带 Next 的 standalone 产物，面向 2C2G 的轻量服务器。
# 构建期不连接数据库（所有页面都是动态渲染），DATABASE_URL 用占位值即可。

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ---- 依赖层：只在 lockfile 变化时失效 ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- 构建层：产出 .next/standalone ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 占位连接串：构建期不查库，仅为模块导入时不抛 "DATABASE_URL is not set"
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm build

# ---- 迁移/种子工具层：仅在 db:migrate / db:seed 时运行，不进生产运行时镜像 ----
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml drizzle.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src
CMD ["pnpm", "db:migrate"]

# ---- 运行时层 ----
FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app

# standalone 产物不含 static 与 public，需单独拷贝
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
