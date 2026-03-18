/**
 * 直接往数据库注入讨论消息，便于跑通「进入实证 → 知乎 → 蓝图」流程。
 * 使用：node scripts/seed-debate-messages.mjs [projectId]
 * 不传 projectId 则选最新一个项目。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE_MESSAGES = [
  { senderLabel: "发起者", kind: "human", content: "我们想做一个小程序，帮用户记录每日习惯并打卡，目标是一个月内能上线 MVP。" },
  { senderLabel: "架构师", kind: "human", content: "技术栈我建议用 Taro + 云开发，但云开发的冷启动和并发上限需要提前评估，否则容易踩坑。" },
  { senderLabel: "运营", kind: "human", content: "习惯类产品同质化严重，获客成本会很高，首月如果只做功能不想清楚拉新和留存，很容易做出来没人用。" },
  { senderLabel: "设计师", kind: "human", content: "打卡的反馈要足够轻、足够爽，否则用户坚持不了几天。动画和成就体系不能省。" },
  { senderLabel: "产品经理", kind: "human", content: "争议点主要是：技术选型是否稳妥、首月目标到底是「上线」还是「有真实留存」、以及设计资源能不能跟上。" },
];

async function main() {
  const projectId = process.argv[2];

  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId } })
    : await prisma.project.findFirst({ orderBy: { createdAt: "desc" } });

  if (!project) {
    console.log(JSON.stringify({
      ok: false,
      error: projectId ? "项目不存在" : "数据库里还没有任何项目，请先在广场创建一个需求",
    }, null, 2));
    process.exit(1);
  }

  const created = await prisma.debateMessage.createMany({
    data: SAMPLE_MESSAGES.map((m) => ({
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
    projectTitle: project.title,
    inserted: created.count,
    totalMessages: total,
    next: `打开 http://127.0.0.1:3002/projects/${project.id} 参与本场辩论后即可点击「进入实证环节」跑通流程`,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
