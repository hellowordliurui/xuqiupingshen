import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toDebateCard } from "@/lib/arena";
import { roleDisplayLabels } from "@/types/arena";

/** 单项目详情：GET /api/projects/[id]，含 reviewPhase、争议点、刘看山报告、讨论消息；消息与席位统一用用户登录名展示 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await params;
  const [session, project, messages] = await Promise.all([
    getSession(),
    prisma.project.findUnique({ where: { id }, include: { slots: true } }),
    prisma.debateMessage.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });
  const userIds = new Set<string>();
  userIds.add(project.hostUserId);
  project.slots.forEach((s) => { if (s.userId) userIds.add(s.userId); });
  messages.forEach((m) => { if (m.userId) userIds.add(m.userId); });
  let displayNameByUserId = new Map<string, string | null>();
  if (userIds.size > 0) {
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      });
      displayNameByUserId = new Map(users.map((u) => [u.id, (u as { displayName?: string | null }).displayName?.trim() || null]));
    } catch {
      // displayName 列可能尚未迁移，忽略后仍正常返回项目与消息，仅无登录名展示
    }
  }

  const slotsWithDisplayName = project.slots.map((s) => ({
    role: s.role,
    type: s.type,
    userId: s.userId,
    displayName: s.userId ? (displayNameByUserId.get(s.userId) ?? null) : null,
  }));
  const card = toDebateCard(
    {
      id: project.id,
      title: project.title,
      goal: project.goal,
      category: project.category,
      stage: project.stage,
      hostUserId: project.hostUserId,
      slots: slotsWithDisplayName,
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

  const messagesList = messages.map((m) => {
    const displayName = m.userId ? displayNameByUserId.get(m.userId) : null;
    const senderLabel = displayName ?? (m.slotRole ? (roleDisplayLabels[m.slotRole] ?? m.senderLabel) : m.senderLabel);
    return {
      id: m.id,
      kind: m.kind,
      senderLabel,
      content: m.content,
      slotRole: m.slotRole ?? undefined,
      createdAt: m.createdAt.toISOString(),
    };
  });

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/projects/[id]]", e);
    return NextResponse.json(
      { code: 500, message: msg.includes("prisma") || msg.includes("database") ? "数据加载异常，请稍后重试" : msg.slice(0, 100) },
      { status: 500 }
    );
  }
}
