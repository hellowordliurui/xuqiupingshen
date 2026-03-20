import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { secondmeChat } from "@/lib/secondme";

/**
 * 发起者进入项目：POST /api/projects/[id]/enter
 * 仅发起者可调用；若发起者尚未发过言，则用其分身生成一条开场发言并写入，作为第一方「进入」发言。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在" }, { status: 404 });
  if (project.hostUserId !== session.id) {
    return NextResponse.json({ code: 0, data: { entered: false }, message: "仅发起者可调用进入" });
  }

  const phase = project.reviewPhase ?? "spontaneous";
  if (phase !== "spontaneous") {
    return NextResponse.json({ code: 0, data: { entered: false }, message: "刘看山已介入，自发讨论已结束，无法继续发言" });
  }

  const hasHostMessage = await prisma.debateMessage.findFirst({
    where: { projectId, slotRole: "host" },
  });
  if (hasHostMessage) {
    return NextResponse.json({ code: 0, data: { entered: false }, message: "发起者已发过言" });
  }

  const accessToken = await getAccessTokenForUser(session.id);
  let content: string;
  if (accessToken && project.title && project.goal) {
    try {
      const userPrompt = `【需求】${project.title}\n【目标】${project.goal}\n\n请以发起人的身份，用一两句话开场：说明需求与目标，并邀请大家从各自角度拍砖或补充。语气自然，不要照抄需求原文。`;
      content = await secondmeChat(accessToken, userPrompt, {
        systemPrompt: "你是一场需求评审的发起人。请根据给出的需求与目标，用简短的开场白引出讨论并邀请其他人参与。语气自然。",
      });
    } catch {
      content = `【需求】${project.title}\n\n【目标】${project.goal}\n\n请大家从各自角度拍砖或补充。`;
    }
  } else {
    content = `【需求】${project.title}\n\n【目标】${project.goal}\n\n请大家从各自角度拍砖或补充。`;
  }
  if (!content) content = `【需求】${project.title}\n【目标】${project.goal}`;

  await prisma.debateMessage.create({
    data: {
      projectId,
      kind: "human",
      senderLabel: "发起者",
      content,
      userId: session.id,
      slotRole: "host",
    },
  });

  return NextResponse.json({ code: 0, data: { entered: true }, message: "发起者已进入并发言" });
}
