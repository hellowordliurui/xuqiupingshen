import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { secondmeChat } from "@/lib/secondme";

const RECENT_MESSAGES_FOR_AVATAR = 25;

/**
 * 进入详情页后根据当前讨论上下文生成当前用户的首条发言（若尚未发言）。
 * 仅一轮讨论，不生成第二轮；吹哨/刘看山由意图识别（4 条兜底）触发。
 * POST /api/projects/[id]/ensure-first-message
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });

  if (project.hostUserId === session.id) {
    return NextResponse.json({ code: 0, data: { ensured: false }, message: "发起者请使用 enter 接口" });
  }

  const mySlot = project.slots.find((s) => s.userId === session.id);
  if (!mySlot) {
    return NextResponse.json({ code: 403, message: "您未加入本场辩论" }, { status: 403 });
  }

  const role = mySlot.role;
  const hasMyMessage = await prisma.debateMessage.findFirst({
    where: { projectId, userId: session.id },
  });
  if (hasMyMessage) {
    return NextResponse.json({ code: 0, data: { ensured: false }, message: "已发过言" });
  }

  const messagesBefore = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const recent = messagesBefore.slice(-RECENT_MESSAGES_FOR_AVATAR);
  const contextLines = recent.map((m) => `【${m.senderLabel}】${m.content}`).join("\n");
  const accessToken = await getAccessTokenForUser(session.id);
  let round1Content: string;
  if (accessToken && project.title && project.goal) {
    try {
      const userPrompt = contextLines
        ? `当前讨论记录：\n${contextLines}\n\n需求：${project.title}\n目标：${project.goal}\n\n请以你的身份和性格，结合上述讨论与目标做一句简短表态或质询（不要复述需求原文）。`
        : `【需求】${project.title}\n【目标】${project.goal}\n\n请以你的身份和性格，对这场需求评审做一句简短表态或质询（不要复述需求原文）。`;
      round1Content = await secondmeChat(accessToken, userPrompt, {
        systemPrompt: "你正在加入一场需求评审讨论。请根据需求、目标与已有讨论，用一两句话表达你的第一反应（认同、质疑或从你擅长角度的建议）。语气自然。",
      });
    } catch {
      round1Content = `我以「${role}」身份加入，将从本角色视角参与讨论。`;
    }
  } else {
    round1Content = `我以「${role}」身份加入，将从本角色视角参与讨论。`;
  }
  if (!round1Content) round1Content = `（${role}）`;

  await prisma.debateMessage.create({
    data: {
      projectId,
      kind: "human",
      senderLabel: role,
      content: round1Content,
      userId: session.id,
      slotRole: role,
    },
  });

  return NextResponse.json({
    code: 0,
    data: { ensured: true },
    message: "已根据当前讨论生成你的首条发言",
  });
}
