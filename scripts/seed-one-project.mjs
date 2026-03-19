#!/usr/bin/env node
/**
 * 在库中创建一条项目数据，并插入多轮讨论内容。
 * 使用：node scripts/seed-one-project.mjs  或  npm run seed:project
 * 会从 .env.local 加载数据库连接；需至少有一名用户（先登录一次）。
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
if (!process.env.DATABASE_DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
}

const prisma = new PrismaClient();

const PROJECT = {
  title: "习惯打卡小程序 MVP",
  goal: "一个月内上线一款帮用户记录每日习惯并打卡的小程序，验证留存与日活。",
  category: "tech",
  stage: "debating",
  roles: ["架构师", "产品", "设计师", "运营"],
};

const MESSAGES = [
  { senderLabel: "发起者", kind: "human", content: "我们想做一个小程序，帮用户记录每日习惯并打卡，目标是一个月内能上线 MVP，先验证有没有人愿意持续用。" },
  { senderLabel: "架构师", kind: "human", content: "技术栈我建议用 Taro + 云开发，开发快、一个人能扛。但云开发的冷启动和并发上限要提前评估，大促或突然爆量容易踩坑。" },
  { senderLabel: "产品", kind: "human", content: "争议点我觉得主要是三块：技术选型是否稳妥、首月目标到底是「上线」还是「有真实留存」、以及设计资源能不能跟上，否则体验拉胯留不住人。" },
  { senderLabel: "设计师", kind: "human", content: "打卡的反馈一定要够轻、够爽，否则用户坚持不了几天。动画和成就体系不能省，哪怕先做一版简单的，也比纯文字打卡强。" },
  { senderLabel: "运营", kind: "human", content: "习惯类产品同质化严重，获客成本会很高。首月如果只做功能不想清楚拉新和留存，很容易做出来没人用。建议先定一个最小获客渠道和留存指标。" },
  { senderLabel: "架构师", kind: "human", content: "云开发这边我可以先压测一版，把冷启动和并发上限摸清楚再定技术方案。如果上限不够，我们得提前考虑迁到自建或混合方案。" },
  { senderLabel: "发起者", kind: "human", content: "那首月我们就定两个硬指标：上线可用的 MVP + 至少 100 个真实用户的 7 日留存数据，用来判断要不要继续投入。" },
];

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.log(JSON.stringify({
      ok: false,
      error: "库里还没有用户，请先在本地登录一次（Second Me 登录）后再执行本脚本。",
    }, null, 2));
    process.exit(1);
  }

  const project = await prisma.project.create({
    data: {
      hostUserId: user.id,
      title: PROJECT.title,
      goal: PROJECT.goal,
      category: PROJECT.category,
      stage: PROJECT.stage,
    },
  });

  await prisma.slot.createMany({
    data: [
      { projectId: project.id, role: "host", type: "human", userId: user.id },
      ...PROJECT.roles.map((role) => ({ projectId: project.id, role, type: "agent" })),
    ],
  });

  const created = await prisma.debateMessage.createMany({
    data: MESSAGES.map((m) => ({
      projectId: project.id,
      kind: m.kind,
      senderLabel: m.senderLabel,
      content: m.content,
    })),
  });

  const total = await prisma.debateMessage.count({ where: { projectId: project.id } });

  console.log(JSON.stringify({
    ok: true,
    projectId: project.id,
    title: project.title,
    goal: project.goal,
    slots: 1 + PROJECT.roles.length,
    messagesInserted: created.count,
    totalMessages: total,
    url: `http://localhost:3002/projects/${project.id}`,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
