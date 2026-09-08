# 灼见（debate）

思想与立场的碰撞：让观点接受检验、让讨论沉淀结论、让"被说服"被记录。

## 技术栈

- Next.js（App Router）+ TypeScript
- TailwindCSS + shadcn/ui
- PostgreSQL（宿主 Neon）+ Drizzle ORM
- Vitest + React Testing Library（单元/组件测试）
- GitHub Actions（CI）→ Vercel（部署）

## 目录

```text
src/
  app/              # 页面与 API（Vercel Cron 入口）
  db/               # Drizzle schema / client / 种子数据 / 树服务
  lib/domain/       # 纯领域函数：树、状态机、击穿传播、计时（带单测）
design/             # HTML 界面示意稿
docs/               # 产品与设计文档（含数据库设计 v0.2）
drizzle/            # 生成的 SQL 迁移
```

## 本地开发

```bash
pnpm install
cp .env.example .env.local   # 填入 Neon DATABASE_URL 与 CRON_SECRET
pnpm db:generate             # 由 schema 生成迁移
pnpm db:migrate              # 执行迁移
pnpm db:seed                 # 写入演示话题
pnpm dev
```

质量门禁（CI 与本地一致）：

```bash
pnpm lint
pnpm typecheck
pnpm test          # 覆盖率：pnpm test:coverage
pnpm build
```

## M0 状态

- 领域层：论点树祖先链/重挂、状态机迁移、击穿传播（悬空/moot/击杀链提升）、反驳计时 —— 已实现并有单测；
- 服务层：话题创建、挂反驳（自动挂红）、回应、承认击穿（含自动传播）、提升到理由层 —— 事务内实现；
- 数据库：Neon 迁移脚本可生成；种子脚本待真实数据库执行；
- Cron：Vercel Cron 骨架（到期事件留痕，治理动作第二期接入）；
- CI：GitHub Actions（lint / typecheck / test / build）。

详细计划见 [第一期实现计划](docs/第一期实现计划.md)，页面示意稿在 `design/`。
