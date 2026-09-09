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
pnpm db:seed                 # 写入两棵演示树（幂等，可重复执行）
pnpm db:demo                 # M0 验收走查：反驳→击穿→击杀链自动提升 + 事件回放
pnpm dev
```

质量门禁（CI 与本地一致）：

```bash
pnpm lint
pnpm typecheck
pnpm test                      # 单元测试；设置 TEST_DATABASE_URL 后自动加入 DB 集成用例
pnpm test:coverage             # 全仓行覆盖率门槛 ≥70%（CI 跑在 Postgres 测试库上）
pnpm test:coverage:core        # 核心状态机/树操作分支覆盖率门槛 ≥85%
pnpm build
```

## M0 状态（已达成）

- 领域层：论点树祖先链/重挂、状态机迁移、击穿传播（悬空/moot/击杀链提升）、反驳计时 —— 已实现并有单测；
- 服务层：话题创建、挂反驳（自动建 challenge + 3/7/14 计时列）、回应、承认击穿（含自动传播与击杀链提升）、修订（supersedes）、抢救迁移/提升 —— 全部在事务内完成，depth 恒等于 ancestors 链长；
- 数据库：Neon 迁移脚本已执行；两棵演示树（裸辞去大理开民宿 / AI 编程是否提高效率）按"理由层 → 子论点 → 证据"幂等落库；
- 验收走查：`pnpm db:demo` 可把演示树从"反驳挂上"走到"击穿并自动提升击杀链顶端"，并打印 claim_events 时间轴；
- 计时：Cron 每日推进 3/7/14 天阶段（幂等写 claim_events），14 天后默认判负等治理动作按设计留待第二期陪审；
- 测试基座：Vitest + React Testing Library + 纯函数/组件/路由用例；CI 起 Postgres 测试库跑 DB 服务层集成测试；
- 覆盖率门槛：核心状态机与树操作分支 ≥85%，全仓（执行代码）行 ≥70%；
- UI 骨架：shadcn/ui（base-nova 风格）已初始化，占位首页/布局就位；
- CI：GitHub Actions（lint / typecheck / test / coverage / build），main 与 PR 全绿才可合并。

详细计划见 [第一期实现计划](docs/第一期实现计划.md)，页面示意稿在 `design/`。
