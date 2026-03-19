#!/usr/bin/env node
/**
 * 从 .env.local 加载环境变量后执行 prisma db push（Prisma CLI 默认只读 .env）
 * 若未设置 DATABASE_DIRECT_URL，则用 DATABASE_URL（SQLite 或仅一条连接串时即可）
 * 若报 P1000 认证失败：到 Supabase Dashboard → Settings → Database 重置数据库密码，再复制 Session mode URI 到 DATABASE_DIRECT_URL
 */
import { config } from "dotenv";
import { execSync } from "child_process";

config({ path: ".env.local" });
if (!process.env.DATABASE_DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
}
// 避免 Prisma 读 .env 时覆盖掉 .env.local 的数据库连接串
const env = { ...process.env };
execSync("npx prisma db push", { stdio: "inherit", env });
