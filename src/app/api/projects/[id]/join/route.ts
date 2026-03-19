import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toDebateCard, MAX_ROOM_SIZE } from "@/lib/arena";
import { isSlotRole } from "@/lib/arena";

/**
 * 加入辩论：POST /api/projects/[id]/join { role?: SlotRole }
 * 仅做席位占位，不在此生成发言；进入详情页后由 ensure-first-message 根据当前讨论上下文再生成首条发言。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  const { id: projectId } = await params;
  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 400, message: "无效 JSON" }, { status: 400 });
  }
  const role = body.role;
  if (!role || !isSlotRole(role) || role === "host") {
    return NextResponse.json({ code: 400, message: "请提供有效角色（如 架构师、算法、设计师、运营）" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });

  const filledCount = project.slots.filter((s) => s.userId).length;
  if (filledCount >= MAX_ROOM_SIZE) {
    return NextResponse.json({ code: 400, message: "本场人数已满（最多 " + MAX_ROOM_SIZE + " 人）" }, { status: 400 });
  }

  const slot = project.slots.find((s) => s.role === role);
  if (!slot) return NextResponse.json({ code: 400, message: "该项目没有该角色席位" }, { status: 400 });
  if (slot.userId) return NextResponse.json({ code: 400, message: "该席位已被占用" }, { status: 400 });

  const alreadyJoined = project.slots.some((s) => s.userId === session.id);
  if (alreadyJoined) return NextResponse.json({ code: 400, message: "您已在本场辩论中，不可重复加入" }, { status: 400 });

  await prisma.slot.update({
    where: { id: slot.id },
    data: { userId: session.id, type: "human" },
  });

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!updated) {
    return NextResponse.json({ code: 500, message: "更新失败" }, { status: 500 });
  }

  const card = toDebateCard(
    {
      id: updated.id,
      title: updated.title,
      goal: updated.goal,
      category: updated.category,
      stage: updated.stage,
      hostUserId: updated.hostUserId,
      slots: updated.slots.map((s) => ({ role: s.role, type: s.type, userId: s.userId })),
    },
    session.id
  );
  return NextResponse.json({
    code: 0,
    data: card,
    message: "已加入，进入详情页后将根据当前讨论生成你的首条发言",
  });
}
