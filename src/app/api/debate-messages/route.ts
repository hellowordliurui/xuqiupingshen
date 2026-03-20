import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { roleDisplayLabels } from "@/types/arena";

/**
 * 讨论记录列表：GET /api/debate-messages?projectId=xxx
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId?.trim()) {
    return NextResponse.json({ code: 400, message: "缺少 projectId" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId.trim() } });
  if (!project) {
    return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });
  }

  const messages = await prisma.debateMessage.findMany({
    where: { projectId: project.id },
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

/**
 * 发送一条讨论消息：POST /api/debate-messages { projectId: string, content: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  let body: { projectId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 400, message: "无效 JSON" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!projectId) {
    return NextResponse.json({ code: 400, message: "缺少 projectId" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ code: 400, message: "请填写发言内容" }, { status: 400 });
  }

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

  const phase = project.reviewPhase ?? "spontaneous";
  if (phase !== "spontaneous") {
    return NextResponse.json(
      { code: 403, message: "刘看山已介入，自发讨论已结束，无法继续发言" },
      { status: 403 }
    );
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
