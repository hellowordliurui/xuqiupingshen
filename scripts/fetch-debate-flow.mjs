/**
 * 调取对话数据并打印，验证「讨论 → 争议点 → 证据 → 报告」流程是否可读。
 * 使用：node scripts/fetch-debate-flow.mjs [projectId]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const projectId = process.argv[2];

  const project = projectId
    ? await prisma.project.findUnique({
        where: { id: projectId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : await prisma.project.findFirst({
        orderBy: { createdAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

  if (!project) {
    console.log(JSON.stringify({ ok: false, error: "未找到项目" }, null, 2));
    process.exit(1);
  }

  let controversyPoints = [];
  if (project.controversyPoints) {
    try {
      controversyPoints = JSON.parse(project.controversyPoints);
    } catch {}
  }

  const out = {
    ok: true,
    projectId: project.id,
    title: project.title,
    goal: project.goal,
    stage: project.stage,
    reviewPhase: project.reviewPhase,
    controversyPoints,
    messageCount: project.messages.length,
    messages: project.messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      senderLabel: m.senderLabel,
      content: m.content.slice(0, 80) + (m.content.length > 80 ? "…" : ""),
      createdAt: m.createdAt.toISOString(),
    })),
    report: {
      hasDeadlySpots: !!project.reportDeadlySpots,
      hasPitfalls: !!project.reportPitfalls,
      hasPath: !!project.reportPath,
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
