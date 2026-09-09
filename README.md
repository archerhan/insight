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
openssl rand -base64 32      # 结果填入 .env.local 的 AUTH_SECRET
# 另需 GitHub OAuth：https://github.com/settings/developers → OAuth Apps
# 回调地址：http://localhost:3000/api/auth/callback/github
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

## M1 状态（已达成）

- 认证：NextAuth（GitHub OAuth），首次登录即按 `auth_id` 创建 users 档案（`github:{id}`）；假名默认取 GitHub 名、头像随登录同步；
- 门槛：《理性讨论须知》占位页（六条讨论规则，约 5 分钟）完成即写 `course_completed_at`；`/topics/new` 未完成会自动转到须知页，领域层 `hasCompletedCourse / publishGateError` 供 M2 发布动作复用；
- 全局壳：顶栏 = 灼见品牌 + 导航（广场 / 我的战绩）+“发起话题”CTA + 登录/退出；议题页三视图切换组件（结论书 / 对线 / 论证地图，`?tab=` 深链）已就绪，M3 议题页接入；
- 路由占位：`/login`、`/guide`、`/me`（我的战绩）、`/topics/new`（发起话题向导骨架）；
- 设计 token：按《视觉呈现设计》落地暖纸底 / 紫品牌 / 语义色（pro/con/amber 等），浅深色各一套；
- 测试：Auth 建档回调、须知门槛、登录/守卫、顶栏与三视图组件、页面占位均有用例；users 服务集成测试在 CI 测试库自动运行。

### M1 环境变量（.env.local）

```bash
AUTH_SECRET=...            # openssl rand -base64 32
AUTH_URL=http://localhost:3000
AUTH_GITHUB_ID=...         # GitHub OAuth App Client ID
AUTH_GITHUB_SECRET=...     # GitHub OAuth App Client Secret
```

认证回调地址固定为 `{AUTH_URL}/api/auth/callback/github`；Vercel 部署时把 `AUTH_URL` 换成正式域名，并在 GitHub OAuth App 中登记该回调。

## M2 状态（已达成）

- 广场首页：正在对线（含未决反驳/参与人数/根立场/标签）、最新结论书（仅 published 版本 + 采纳条目数）、立帖为证·即将揭晓（未来 reveal_at）、右侧"我的战绩速览"（派生计数）与登录引导；全部按公开读从真实表聚合，不依赖可能失真的反规范化列；
- 发起话题：三步向导（类型 → 主张与论据 → 规则与发布），含类型卡、根立场、倾向、标签（≤3）、首条论据（可选）、立帖为证揭晓日期、悬赏/公开反驳开关与发布预览；
- 发布动作：登录 + 《理性讨论须知》门槛在 Server Action 二次校验，草稿规则由纯函数（`src/lib/domain/publish.ts`）校验，`topic + 理由层根立场 + 可选 evidence + tags` 单事务落库（`src/db/services/publish.ts`），成功后跳转话题落点页；
- 话题落点页：`/topics/[id]` 公开读话题、楼主、根立场与统计（对线视图由 M3 接入，见下）；
- 种子数据补充标签；广场查询（`plaza.ts`）与话题读（`topics.ts`）均有 CI 测试库集成用例，向导/动作/页面有组件与单测。

详细计划见 [第一期实现计划](docs/第一期实现计划.md)，页面示意稿在 `design/`。

## M3 状态（已达成）

对线核心（里程碑中的最高风险项）已接入，两账号可走通“反驳 → 未回应挂红（3/7/14 天阶段）→ 回应或承认击穿”的完整链路：

- **对线视图**：议题页按状态落默认视图（进行中 → 对线；已收敛 → 结论书占位），`?tab=arena&claim=` 支持焦点深链；面包屑逐级回跳、焦点卡、支持理由/反驳两栏、澄清请求（预留）、子卡状态 chip 与“未决反驳 N”计数；
- **发反驳流程**：先复述对方观点 → L0 程序检查（复述覆盖度/查重/侮辱，本地启发式默认开，LLM 经 `AI_PROGRAM_LLM_*` 环境开关增强）→ 通过后单事务建 con 节点 + challenge 挂红（3/7/14 天计时列），目标论点置 challenged；
- **作者侧**：未决红条内可直接“回应”（解除挂红、建回应节点）或两步确认“承认击穿”（refuted + 支撑型子孙自动悬空 + 反驳型后代 moot + 击杀链顶端提升为理由层）；焦点卡支持“修订观点”（supersedes）；新版焦点列出旧版可抢救的悬空子论点，作者本人可一键迁移；
- **程序留痕**：每次新建论点的程序检查（含通过项）落 `ai_flags`（本地 heuristic-v1 / LLM llm-v1），未通过不建节点只留审计；服务端为权威校验，客户端复述检验只是前置体验；
- **计时兜底**：`advanceChallengeTimersForTopic` 在读取路径惰性推进（幂等补写 orange/red/due 的 `challenge_timer` 事件），Cron 仍每日全局对账；
- **未决风险查询**：`getUnresolvedChallenges` 返回 open 反驳（反驳原文/目标论点/阶段/天数），为 M4 结论书“未决风险区与降权展示”备好数据源；
- **防护与一致性**：不允许反驳自己的论点、回应仅限被反驳论点作者、迁移/提升仅限论点作者、已回应后可再承认击穿、承认一条后同目标其它 open 反驳自动 moot、话题收敛后拒绝新论点；
- **测试**：对线写/读服务与树服务新增 25 条集成用例（覆盖验收链路、拦截、权限、多反驳 moot、抢救迁移、惰性计时）；动作层 11 条单测；输入条/红条/修订/抢救组件 12 条交互用例；复述检查/展示口径/LLM 编排等 40 条单测；全仓覆盖率（含 DB）行 ≥90%。

### M3 环境变量（默认启发式，LLM 可选）

```bash
AI_PROGRAM_LLM_ENABLED=false     # true 时启用 LLM 程序检查增强
AI_PROGRAM_LLM_URL=              # OpenAI 兼容 chat completions 地址
AI_PROGRAM_LLM_API_KEY=          # 对应密钥
AI_PROGRAM_LLM_MODEL=gpt-4o-mini
```

未启用/未配置/调用失败均自动降级为本地启发式结果，不阻塞用户。
