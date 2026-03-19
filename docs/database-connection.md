# 数据库连接排查（Supabase + Prisma）

## 现象与原因

| 错误码 | 含义 | 常见原因 |
|--------|------|----------|
| **P1000** | 认证失败（credentials not valid） | 密码错误、用户名格式不对、或用了 Transaction 模式(6543) 的 URI 当直连 |
| **P1001** | 连不上数据库服务器（Can't reach database server） | 直连 `db.xxx.supabase.co` 在你网络下不可达（例如仅 IPv6）、或项目已暂停 |

## 正确配置两条 URL

- **DATABASE_URL**：应用运行时用，必须是 **Transaction 模式**（端口 **6543**），且带 `?pgbouncer=true`。
- **DATABASE_DIRECT_URL**：只给 Prisma `db push` / migrate 用，可以是：
  - **Session 模式**：`pooler.supabase.com:5432`（推荐，和 DATABASE_URL 同主机）
  - **直连**：`db.项目ref.supabase.co:5432`（若你这边能连通且不想用 pooler 做迁移再用）

两条里的用户名都必须是 **postgres.项目ref**（例如 `postgres.snhlsyffkkbhareuufdb`），不能是单独的 `postgres`。密码都是 **数据库密码**（在 Dashboard → Settings → Database 里查看/重置），不是 anon key。

## 推荐步骤（解决 P1000 认证失败）

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard) → 你的项目 → **Settings** → **Database**。
2. **重置数据库密码**：点 **Reset database password**，设一个新密码（记下来），保存。
3. 在 **Connection string** 区域，用**新密码**：
   - 选 **URI** → **Transaction**（端口 6543）：复制整条，把 `[YOUR-PASSWORD]` 换成新密码，粘贴到 `.env.local` 的 **DATABASE_URL**，确保末尾有 `?pgbouncer=true`。
   - 选 **URI** → **Session**（端口 5432）：复制整条，把 `[YOUR-PASSWORD]` 换成**同一新密码**，粘贴到 `.env.local` 的 **DATABASE_DIRECT_URL**。
4. 若密码里含 `@`、`#`、`%` 等，在 URI 里要做 URL 编码（如 `@` → `%40`）。
5. 保存 `.env.local` 后执行：`npm run db:push`。

若仍报错，把终端里 **完整错误信息**（含 P1000/P1001 和 Prisma 输出的那行 `Datasource "db": ... at "..."`）贴出来便于继续排查。

## 若直连报 P1001

说明当前网络连不上 `db.xxx.supabase.co`（常见于仅 IPv6 或公司网络限制）。解决方式：

- **DATABASE_DIRECT_URL** 改用 **Session 模式**（同上：pooler 主机、端口 5432），再按上面步骤核对密码和用户名。
- 或在 Supabase 项目里购买 **IPv4 Add-on** 后再用直连。

## 之前能写表、现在不能

- 若之前用的是 **本地 SQLite**（`file:./dev.db`），现在改成 Supabase 后需要按上面配好两条 URL 和密码。
- 若本来就是 Supabase：多半是 **数据库密码被改过** 或 **项目被暂停**（免费项目长期不用会暂停）。到 Dashboard 确认项目为 Active，并按上面重置/复制密码和 Session 模式 URI。
