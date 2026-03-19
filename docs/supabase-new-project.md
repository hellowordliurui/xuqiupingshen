# 新建 Supabase 数据库项目步骤

按顺序做一遍即可把本项目的数据库接到新 Supabase 项目上。

---

## 一、在 Supabase 创建新项目

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，登录。
2. 点击 **New project**。
3. 填写：
   - **Name**：随便起名（如 `nitpicker-db`）。
   - **Database Password**：设一个**数据库密码**，**务必记下来**（后面要填进 `.env.local`）。
   - **Region**：选离你近的（如 Singapore）。
4. 点 **Create new project**，等一两分钟项目创建完成。

---

## 二、拿到两条连接串

1. 在项目里点左侧 **Settings**（齿轮）→ **Database**。
2. 找到 **Connection string** / **Connection pooling** 区域。
3. 复制两条 URI（把里面的 `[YOUR-PASSWORD]` 换成你在上一步设的**数据库密码**）：

   **第一条 — Transaction 模式（端口 6543）**  
   - 用于应用运行时（Next.js 读写的连接）。  
   - 在 **Connection pooling** 里选 **URI** → **Transaction**（或端口 **6543** 的那条）。  
   - 复制后检查：末尾要有 **`?pgbouncer=true`**，没有就自己加上。  
   - 示例格式：  
     `postgresql://postgres.xxxxxxxxxxxx:你的密码@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

   **第二条 — Session 模式（端口 5432）**  
   - 用于 Prisma 的 `db push` / migrate。  
   - 在 **Connection pooling** 里选 **URI** → **Session**（或端口 **5432** 的那条）。  
   - 复制后把 `[YOUR-PASSWORD]` 换成**同一个数据库密码**。  
   - 示例格式：  
     `postgresql://postgres.xxxxxxxxxxxx:你的密码@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`

---

## 三、写进本项目的 .env.local

1. 打开项目根目录下的 **`.env.local`**（没有就复制 `.env.example` 再改名为 `.env.local`）。
2. 找到或新增这两行，用上一步的两条 URI **整条替换**（不要保留旧项目的 URI）：

   ```env
   DATABASE_URL="这里贴 Transaction 模式(6543) 的那条，确保末尾有 ?pgbouncer=true"
   DATABASE_DIRECT_URL="这里贴 Session 模式(5432) 的那条"
   ```

3. 保存文件。

---

## 四、在本地建表并验证

在项目根目录执行：

```bash
npm run db:push
```

- 成功：会看到 Prisma 把当前 schema 推送到新库，并提示表已同步。
- 若报 **P1000**：说明密码或 URI 不对，回第二步确认密码、两条 URI 是否从**新项目**复制且密码一致。
- 若报 **P1001**：说明连不上（例如直连被墙），确保两条都用 **Connection pooling** 的 URI（Transaction 6543 + Session 5432），不要用直连 `db.xxx.supabase.co`。

---

## 五、可选：在 Supabase 里看一眼表

1. 在 Supabase 项目里点左侧 **Table Editor**。
2. 应能看到 `users`、`sessions`、`projects`、`debate_messages`、`slots` 等表（和 `prisma/schema.prisma` 一致）。

---

## 小结

| 步骤 | 做什么 |
|------|--------|
| 一 | Supabase 新建项目，设好并记住数据库密码 |
| 二 | Settings → Database → Connection pooling：复制 Transaction(6543) 和 Session(5432) 两条 URI，把密码填进去 |
| 三 | 把两条 URI 分别填进 `.env.local` 的 `DATABASE_URL` 和 `DATABASE_DIRECT_URL` |
| 四 | 本地执行 `npm run db:push` 建表并验证连接 |

之后跑 `npm run dev` 时，应用就会用这个新 Supabase 项目作为数据库。
