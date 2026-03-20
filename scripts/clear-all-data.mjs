#!/usr/bin/env node
/**
 * 清空库中所有数据（包括用户、会话、项目、席位、讨论消息）。
 * 使用：node --env-file=.env.local scripts/clear-all-data.mjs  或  npm run db:clear
 * 仅删数据，不修改表结构。
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
if (!process.env.DATABASE_DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
}

const prisma = new PrismaClient();

async function main() {
  console.log("开始清空所有数据…");

  const dm = await prisma.debateMessage.deleteMany({});
  console.log("  已删除 debate_messages:", dm.count);

  const slots = await prisma.slot.deleteMany({});
  console.log("  已删除 slots:", slots.count);

  const projects = await prisma.project.deleteMany({});
  console.log("  已删除 projects:", projects.count);

  const sessions = await prisma.session.deleteMany({});
  console.log("  已删除 sessions:", sessions.count);

  const users = await prisma.user.deleteMany({});
  console.log("  已删除 users:", users.count);

  console.log("全部数据已清空。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
