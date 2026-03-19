#!/usr/bin/env node
/**
 * 在库中创建一个「三部判断」完整流程的测试项目：
 * 第一阶段 自发性逻辑排雷 → 第二阶段 知乎知识实锤 → 第三阶段 刘看山蓝图
 * 使用：node scripts/seed-three-phase.mjs  或  npm run seed:three-phase
 * 会从 .env.local 加载数据库连接；需至少有一名用户（先登录一次）。
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
if (!process.env.DATABASE_DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
}

const prisma = new PrismaClient();

const CONTROVERSY_POINTS = ["技术选型与云开发上限", "首月目标上线 vs 真实留存", "设计资源与留存体验", "获客与留存指标"];

// 第一阶段：自发讨论（human/agent）
const PHASE1_MESSAGES = [
  { senderLabel: "发起者", kind: "human", slotRole: "host", content: "我们想做一个小程序，帮用户记录每日习惯并打卡，目标是一个月内能上线 MVP，先验证有没有人愿意持续用。" },
  { senderLabel: "架构师", kind: "agent", slotRole: "架构师", content: "技术栈我建议用 Taro + 云开发，开发快、一个人能扛。但云开发的冷启动和并发上限要提前评估，大促或突然爆量容易踩坑。" },
  { senderLabel: "产品", kind: "agent", slotRole: "产品", content: "争议点我觉得主要是三块：技术选型是否稳妥、首月目标到底是「上线」还是「有真实留存」、以及设计资源能不能跟上，否则体验拉胯留不住人。" },
  { senderLabel: "设计师", kind: "agent", slotRole: "设计师", content: "打卡的反馈一定要够轻、够爽，否则用户坚持不了几天。动画和成就体系不能省，哪怕先做一版简单的，也比纯文字打卡强。" },
  { senderLabel: "运营", kind: "agent", slotRole: "运营", content: "习惯类产品同质化严重，获客成本会很高。首月如果只做功能不想清楚拉新和留存，很容易做出来没人用。建议先定一个最小获客渠道和留存指标。" },
  { senderLabel: "架构师", kind: "agent", slotRole: "架构师", content: "云开发这边我可以先压测一版，把冷启动和并发上限摸清楚再定技术方案。如果上限不够，我们得提前考虑迁到自建或混合方案。" },
  { senderLabel: "发起者", kind: "human", slotRole: "host", content: "那首月我们就定两个硬指标：上线可用的 MVP + 至少 100 个真实用户的 7 日留存数据，用来判断要不要继续投入。" },
];

// 第二阶段：刘看山引导 + 知乎·证据（system）
const PHASE2_LIUKANSHAN_GUIDE = `大家已经围绕「${CONTROVERSY_POINTS.join("」「")}」等有了不同看法。接下来用知乎上的真实问答与文章来验证一下，请基于检索到的证据继续讨论或修正观点。`;

const PHASE2_ZHIHU_MESSAGES = [
  {
    senderLabel: "知乎·证据",
    kind: "system",
    content: `【关键词「技术选型与云开发上限」】知乎检索结果：

1. 微信小程序云开发冷启动与并发实践
   云开发免费版并发有限，建议上线前做压测；冷启动在 2s 内可接受，超过需考虑混合方案。
   https://zhihu.com/question/xxx （权威度: 高）

2. Taro 多端开发踩坑记录
   Taro + 云开发适合 MVP 快速验证，但数据量上来后要考虑迁移成本。
   https://zhihu.com/question/yyy （权威度: 中）`,
  },
  {
    senderLabel: "知乎·证据",
    kind: "system",
    content: `【关键词「首月目标上线 vs 真实留存」】知乎检索结果：

1. 习惯类产品如何定义「有效留存」
   7 日留存比首日下载更能反映习惯养成；建议首月先看 7 日留存曲线再决定是否加功能。
   https://zhihu.com/question/zzz （权威度: 高）`,
  },
  {
    senderLabel: "知乎·证据",
    kind: "system",
    content: `【关键词「获客与留存指标」】知乎检索结果：

1. 小程序冷启动获客的几种方式
   裂变、公众号、搜索优化；首月建议选一个主渠道做到可复用的转化漏斗。
   https://zhihu.com/question/aaa （权威度: 中）`,
  },
];

// 第三阶段：刘看山蓝图存在 project 的 report 字段中，不单独插消息；下面为示例文案
const REPORT_DEADLY_SPOTS = `1. 云开发并发与冷启动未压测就上线，大促或爆量会导致服务不可用。
2. 首月只盯「上线」不盯「留存」，容易做出没人用的壳。
3. 设计资源不足时强上复杂动效，拖慢节奏且体验不统一。
4. 获客渠道未定就开发，上线后不知道去哪拉人。`;

const REPORT_PITFALLS = `1. 技术：先用云开发快速上线，同时做压测和迁移预案，避免被锁死。
2. 目标：首月 KPI 定为「可用的 MVP + 100 人 7 日留存」，用数据说话。
3. 设计：先做一版轻量成就与反馈，再迭代动效，避免过度设计。
4. 运营：选定一个主渠道（如公众号或裂变）跑通转化，再扩量。`;

const REPORT_PATH = `第一步：确定技术方案（Taro + 云开发），并完成冷启动/并发压测，写出迁移预案。
第二步：定义首月硬指标（MVP 上线 + 100 人 7 日留存），产品与运营对齐。
第三步：设计最小可行反馈（打卡动效 + 简单成就），优先保证「轻」和「爽」。
第四步：选定一个获客渠道并设计留存钩子，上线后按周看留存曲线并迭代。`;

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
      title: "习惯打卡小程序 MVP（三部判断示例）",
      goal: "一个月内上线一款帮用户记录每日习惯并打卡的小程序，验证留存与日活。",
      category: "tech",
      stage: "finalizing",
      reviewPhase: "blueprint",
      controversyPoints: JSON.stringify(CONTROVERSY_POINTS),
      reportDeadlySpots: REPORT_DEADLY_SPOTS,
      reportPitfalls: REPORT_PITFALLS,
      reportPath: REPORT_PATH,
    },
  });

  await prisma.slot.createMany({
    data: [
      { projectId: project.id, role: "host", type: "human", userId: user.id },
      { projectId: project.id, role: "架构师", type: "agent" },
      { projectId: project.id, role: "产品", type: "agent" },
      { projectId: project.id, role: "设计师", type: "agent" },
      { projectId: project.id, role: "运营", type: "agent" },
    ],
  });

  const allMessages = [
    ...PHASE1_MESSAGES.map((m) => ({
      projectId: project.id,
      kind: m.kind,
      senderLabel: m.senderLabel,
      content: m.content,
      slotRole: m.slotRole ?? null,
    })),
    {
      projectId: project.id,
      kind: "system",
      senderLabel: "刘看山",
      content: PHASE2_LIUKANSHAN_GUIDE,
      slotRole: null,
    },
    ...PHASE2_ZHIHU_MESSAGES.map((m) => ({
      projectId: project.id,
      kind: m.kind,
      senderLabel: m.senderLabel,
      content: m.content,
      slotRole: null,
    })),
  ];

  for (const msg of allMessages) {
    await prisma.debateMessage.create({ data: msg });
  }

  const total = await prisma.debateMessage.count({ where: { projectId: project.id } });

  console.log(JSON.stringify({
    ok: true,
    projectId: project.id,
    title: project.title,
    stage: project.stage,
    reviewPhase: project.reviewPhase,
    controversyPoints: CONTROVERSY_POINTS,
    slots: 5,
    totalMessages: total,
    phases: "第一阶段(自发讨论) + 第二阶段(刘看山引导+知乎证据) + 第三阶段(刘看山蓝图已写入 project)",
    url: `http://localhost:3002/projects/${project.id}`,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
