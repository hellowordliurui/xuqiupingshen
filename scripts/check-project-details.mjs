#!/usr/bin/env node
/**
 * 检查库中哪些项目在「项目详情页」有数据：
 * - 项目存在（详情 API 能返回）
 * - 讨论消息数
 * - 刘看山报告（reportDeadlySpots / reportPitfalls / reportPath）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });

  console.log("=== 项目列表与详情页数据 ===\n");
  console.log(`共 ${projects.length} 个项目\n`);

  for (const p of projects) {
    const hasReport =
      (p.reportDeadlySpots && p.reportDeadlySpots.trim() !== "") ||
      (p.reportPitfalls && p.reportPitfalls.trim() !== "") ||
      (p.reportPath && p.reportPath.trim() !== "");
    const msgCount = p._count.messages;

    const detailSummary = [];
    if (msgCount > 0) detailSummary.push(`${msgCount} 条讨论`);
    if (hasReport) detailSummary.push("有刘看山报告");
    if (detailSummary.length === 0) detailSummary.push("无讨论、无报告");

    console.log(`ID: ${p.id}`);
    console.log(`  标题: ${p.title}`);
    console.log(`  详情页有数据: ${detailSummary.join("；")}`);
    console.log(`  reviewPhase: ${p.reviewPhase}`);
    console.log(`  报告: 致命死角=${!!p.reportDeadlySpots} 避坑=${!!p.reportPitfalls} 路径=${!!p.reportPath}`);
    console.log("");
  }

  const withMessages = projects.filter((p) => p._count.messages > 0);
  const withReport = projects.filter(
    (p) =>
      (p.reportDeadlySpots && p.reportDeadlySpots.trim() !== "") ||
      (p.reportPitfalls && p.reportPitfalls.trim() !== "") ||
      (p.reportPath && p.reportPath.trim() !== "")
  );
  console.log("--- 汇总 ---");
  console.log(`有讨论消息的项目: ${withMessages.length} 个`, withMessages.map((p) => p.id));
  console.log(`有刘看山报告的项目: ${withReport.length} 个`, withReport.map((p) => p.id));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
