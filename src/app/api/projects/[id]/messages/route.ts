import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { roleDisplayLabels } from "@/types/arena";

export const dynamic = "force-dynamic";

/** 讨论记录列表：GET /api/projects/[id]/messages，按时间正序 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });

  const messages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  const list = messages.map((m) => ({
    id: m.id,
    kind: m.kind,
    senderLabel: m.senderLabel,
    content: m.content,
    slotRole: m.slotRole ?? undefined,
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({ code: 0, data: list });
}

/** 发送一条讨论消息：POST /api/projects/[id]/messages { content: string }，仅本场参与者可发 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  const { id: projectId } = await params;
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 400, message: "无效 JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ code: 400, message: "请填写发言内容" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });

  // 仅本场参与者可发：发起者或任一席位的 userId 为当前用户
  const isHost = project.hostUserId === session.id;
  const mySlot = project.slots.find((s) => s.userId === session.id);
  if (!isHost && !mySlot) {
    return NextResponse.json({ code: 403, message: "仅本场参与者可发言" }, { status: 403 });
  }

  const slotRole = isHost ? "host" : (mySlot!.role as string);
  const senderLabel = roleDisplayLabels[slotRole] ?? slotRole;

  const message = await prisma.debateMessage.create({
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
