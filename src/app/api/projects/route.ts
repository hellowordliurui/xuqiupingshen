import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toDebateCard } from "@/lib/arena";
import { roleDisplayLabels } from "@/types/arena";

const MAX_SLOTS = 5;
const ROLES_ALLOWED: string[] = ["host", "架构师", "算法", "设计师", "运营", "产品", "财务", "法务", "数据", "FE"];

/** 我的项目或全部：GET /api/projects?my=1 仅本人 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const my = request.nextUrl.searchParams.get("my") === "1";

    const where: Prisma.ProjectWhereInput = {};
    if (my) {
      if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
      where.OR = [
        { hostUserId: session.id },
        { slots: { some: { userId: session.id } } },
      ];
    }

    if (!prisma.project) {
      return NextResponse.json({ code: 0, data: [] });
    }
    const list = await prisma.project.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: "desc" },
      include: { slots: true },
    });
    const data = list.map((p) =>
      toDebateCard(
        {
          id: p.id,
          title: p.title,
          goal: p.goal,
          category: p.category,
          stage: p.stage,
          hostUserId: p.hostUserId,
          slots: p.slots.map((s) => ({ role: s.role, type: s.type, userId: s.userId })),
        },
        session?.id
      )
    );
    return NextResponse.json({ code: 0, data });
  } catch (e) {
    console.error("[api/projects GET]", e);
    return NextResponse.json({ code: 0, data: [] });
  }
}

/** 创建需求 或 发讨论消息：POST /api/projects { title, goal, roles } 或 { projectId, content } */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  let body: { title?: string; goal?: string; category?: string; roles?: string[]; projectId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 400, message: "无效 JSON" }, { status: 400 });
  }

  // 发讨论消息：body 含 projectId + content，且无 title（避免与创建项目冲突）
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (projectId && content && !body.title) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { slots: true },
    });
    if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });
    const isHost = project.hostUserId === session.id;
    const mySlot = project.slots.find((s) => s.userId === session.id);
    if (!isHost && !mySlot) {
      return NextResponse.json({ code: 403, message: "仅本场参与者可发言" }, { status: 403 });
    }
    const slotRole = isHost ? "host" : (mySlot!.role as string);
    const senderLabel = roleDisplayLabels[slotRole] ?? slotRole;
    // PrismaClient 在 generate 后包含 debateMessage；若 IDE 报错可重启 TS 服务或重新 prisma generate
    const message = await (
      prisma as typeof prisma & { debateMessage: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; kind: string; senderLabel: string; content: string; slotRole: string | null; createdAt: Date }> } }
    ).debateMessage.create({
      data: {
        projectId,
        kind: "human",
        senderLabel,
        content,
        userId: session.id,
        slotRole,
      },
    });
    return NextResponse.json({
      code: 0,
      data: {
        id: message.id,
        kind: message.kind,
        senderLabel: message.senderLabel,
        content: message.content,
        slotRole: message.slotRole ?? undefined,
        createdAt: message.createdAt.toISOString(),
      },
      message: "已发送",
    });
  }

  const { title, goal, roles } = body;
  if (!title?.trim() || !goal?.trim()) {
    return NextResponse.json({ code: 400, message: "标题与目标必填" }, { status: 400 });
  }
  const roleList = Array.isArray(roles) ? roles.filter((r) => ROLES_ALLOWED.includes(r) && r !== "host") : [];
  if (roleList.length === 0 || roleList.length > 4) {
    return NextResponse.json({ code: 400, message: "请提供 1～4 个非 host 角色（如 架构师、算法、设计师、运营）" }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: {
        hostUserId: session.id,
        title: title.trim(),
        goal: goal.trim(),
        category: "tech",
        stage: "debating",
      },
    });

    await prisma.slot.createMany({
      data: [
        { projectId: project.id, role: "host", type: "human", userId: session.id },
        ...roleList.map((role) => ({ projectId: project.id, role, type: "agent" })),
      ],
    });

    const withSlots = await prisma.project.findUnique({
      where: { id: project.id },
      include: { slots: true },
    });
    if (!withSlots) {
      return NextResponse.json({ code: 500, message: "创建失败" }, { status: 500 });
    }

    const card = toDebateCard(
      {
        id: withSlots.id,
        title: withSlots.title,
        goal: withSlots.goal,
        category: withSlots.category,
        stage: withSlots.stage,
        hostUserId: withSlots.hostUserId,
        slots: withSlots.slots.map((s) => ({ role: s.role, type: s.type, userId: s.userId })),
      },
      session?.id
    );
    return NextResponse.json({ code: 0, data: card });
  } catch (e) {
    console.error("[api/projects POST]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { code: 500, message: "创建失败", detail: msg },
      { status: 500 }
    );
  }
}
