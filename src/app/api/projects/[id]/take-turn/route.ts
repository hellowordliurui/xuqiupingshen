import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { runIntentScan } from "@/lib/intent-detection";
import { doAdvanceToValidation } from "@/lib/advance-to-validation";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";
import { secondmeChat } from "@/lib/secondme";
import { roleDisplayLabels } from "@/types/arena";

const RECENT_MESSAGES_FOR_AVATAR = 25;

/**
 * 自发讨论阶段：若「轮到」当前用户（按参与人顺序下一棒），则由当前用户分身说一句，并做意图扫描；
 * 若意图触发或达到条数阈值则进入刘看山。
 * 谁在详情页谁可能触发——只有轮到自己的那一棒时才会真正发一条。
 * POST /api/projects/[id]/take-turn
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

  const isHost = project.hostUserId === session.id;
  const mySlot = project.slots.find((s) => s.userId === session.id);
  if (!isHost && !mySlot) {
    return NextResponse.json({ code: 403, message: "仅本场参与者可发言" }, { status: 403 });
  }

  const phase = project.reviewPhase ?? "spontaneous";
  if (phase !== "spontaneous") {
    return NextResponse.json({ code: 0, data: { tookTurn: false }, message: "当前已非自发讨论阶段" });
  }

  const participants: { userId: string; slotRole: string; senderLabel: string }[] = [
    { userId: project.hostUserId, slotRole: "host", senderLabel: roleDisplayLabels["host"] ?? "发起者" },
    ...project.slots
      .filter((s) => s.userId)
      .map((s) => ({
        userId: s.userId!,
        slotRole: s.role,
        senderLabel: roleDisplayLabels[s.role] ?? s.role,
      })),
  ];
  if (participants.length === 0) {
    return NextResponse.json({ code: 0, data: { tookTurn: false } });
  }

  const allMessages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const humanOrAgent = allMessages.filter((m) => m.kind === "human" || m.kind === "agent");
  if (humanOrAgent.length === 0) {
    return NextResponse.json({ code: 0, data: { tookTurn: false } });
  }

  const lastMsg = humanOrAgent[humanOrAgent.length - 1];
  const lastUserId = lastMsg.userId ?? null;
  const lastIndex = participants.findIndex((p) => p.userId === lastUserId);
  const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % participants.length : 0;
  const nextParticipant = participants[nextIndex];

  if (nextParticipant.userId !== session.id) {
    return NextResponse.json({ code: 0, data: { tookTurn: false }, message: "尚未轮到你" });
  }

  const accessToken = await getAccessTokenForUser(session.id);
  if (!accessToken) {
    return NextResponse.json({ code: 0, data: { tookTurn: false }, message: "分身未授权或已失效" });
  }

  const recent = allMessages.slice(-RECENT_MESSAGES_FOR_AVATAR);
  const contextLines = recent.map((m) => `【${m.senderLabel}】${m.content}`).join("\n");
  const userPrompt = contextLines
    ? `当前讨论记录：\n${contextLines}\n\n需求：${project.title}\n目标：${project.goal}\n\n请以你的身份根据当前讨论继续发言一句（可表态、质疑或补充），不要复述需求原文。`
    : `【需求】${project.title}\n【目标】${project.goal}\n\n请以你的身份简短回应一句。`;

  let content: string;
  try {
    content = await secondmeChat(accessToken, userPrompt, {
      systemPrompt: `你正在一场需求评审讨论中，你的角色是「${nextParticipant.senderLabel}」。请用一两句话根据当前讨论继续发言，语气自然。`,
    });
  } catch (e) {
    console.warn("[take-turn] 分身发言失败", e);
    return NextResponse.json({ code: 502, data: { tookTurn: false }, message: "分身生成失败，请稍后重试" });
  }
  if (!content) content = `（${nextParticipant.senderLabel}）`;

  await prisma.debateMessage.create({
    data: {
      projectId,
      kind: "human",
      senderLabel: nextParticipant.senderLabel,
      content,
      userId: session.id,
      slotRole: nextParticipant.slotRole,
    },
  });

  const newMessages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const newHumanOrAgent = newMessages.filter((m) => m.kind === "human" || m.kind === "agent");
  const scanMessages = newHumanOrAgent.map((m) => ({ senderLabel: m.senderLabel, content: m.content, kind: m.kind }));

  let advanced = false;
  try {
    const result = await runIntentScan(scanMessages, newHumanOrAgent.length, {
      projectTitle: project.title ?? undefined,
      projectGoal: project.goal ?? undefined,
    });
    if (result.shouldTrigger) {
      await doAdvanceToValidation(projectId, {
        suggestedScript: result.suggestedScript,
        suggestedKeywords: result.suggestedKeywords,
      });
      try {
        await doFetchZhihuEvidence(projectId);
        try {
          await doGenerateBlueprint(projectId);
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
      advanced = true;
    }
  } catch (e) {
    console.warn("[take-turn] 意图扫描失败", e);
  }

  return NextResponse.json({
    code: 0,
    data: { tookTurn: true, advanced },
    message: advanced ? "已发言，刘看山已介入并进入实证环节" : "已发言",
  });
}
