import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isReviewPhase } from "@/lib/arena";
import { runIntentScan, ROUND_THRESHOLD } from "@/lib/intent-detection";

/**
 * 意图检测：GET /api/projects/[id]/check-intent
 * 对当前讨论做意图扫描（维度 A/B/C/D），判断是否应触发刘看山吹哨。
 * 仅 spontaneous 阶段、本场参与者可调用。
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });

  const isHost = project.hostUserId === session.id;
  const inSlot = project.slots.some((s) => s.userId === session.id);
  if (!isHost && !inSlot) {
    return NextResponse.json({ code: 403, message: "仅本场参与者可查看" }, { status: 403 });
  }

  const phase = project.reviewPhase ?? "spontaneous";
  if (!isReviewPhase(phase) || phase !== "spontaneous") {
    return NextResponse.json(
      { code: 400, message: "意图检测仅在自发讨论阶段有效，当前已进入后续阶段" },
      { status: 400 }
    );
  }

  const messages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  const humanOrAgent = messages.filter((m) => m.kind === "human" || m.kind === "agent");
  const roundCount = humanOrAgent.length;

  const scanMessages = humanOrAgent.map((m) => ({
    senderLabel: m.senderLabel,
    content: m.content,
    kind: m.kind,
  }));

  const result = await runIntentScan(scanMessages, roundCount, {
    projectTitle: project.title ?? undefined,
    projectGoal: project.goal ?? undefined,
  });

  return NextResponse.json({
    code: 0,
    data: {
      shouldTrigger: result.shouldTrigger,
      triggeredBy: result.triggeredBy,
      dimensions: result.dimensions,
      roundCount: result.roundCount,
      roundThreshold: ROUND_THRESHOLD,
      suggestedScript: result.suggestedScript,
      suggestedKeywords: result.suggestedKeywords,
    },
    message: result.shouldTrigger
      ? `已触发吹哨条件（${result.triggeredBy.join("、")}），可进入实证环节`
      : "未触发吹哨，可继续讨论",
  });
}
