import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toDebateCard } from "@/lib/arena";
/** 单项目详情：GET /api/projects/[id]，含 reviewPhase、争议点、刘看山报告、讨论消息（避免单独 /messages 路由 404） */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { slots: true },
  });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });
  const session = await getSession();
  const card = toDebateCard(
    {
      id: project.id,
      title: project.title,
      goal: project.goal,
      category: project.category,
      stage: project.stage,
      hostUserId: project.hostUserId,
      slots: project.slots.map((s) => ({ role: s.role, type: s.type, userId: s.userId })),
    },
    session?.id
  );
  let controversyPoints: string[] = [];
  if (project.controversyPoints) {
    try {
      const parsed = JSON.parse(project.controversyPoints) as unknown;
      controversyPoints = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      // ignore
    }
  }

  const messages = await prisma.debateMessage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });
  const messagesList = messages.map((m) => ({
    id: m.id,
    kind: m.kind,
    senderLabel: m.senderLabel,
    content: m.content,
    slotRole: m.slotRole ?? undefined,
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({
    code: 0,
    data: {
      ...card,
      reviewPhase: project.reviewPhase ?? "spontaneous",
      controversyPoints,
      reportDeadlySpots: project.reportDeadlySpots ?? undefined,
      reportPitfalls: project.reportPitfalls ?? undefined,
      reportPath: project.reportPath ?? undefined,
      messages: Array.isArray(messagesList) ? messagesList : [],
    },
  });
}
