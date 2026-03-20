import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { secondmeChat } from "@/lib/secondme";
import { runPostHumanMessageIntentPipeline } from "@/lib/post-message-intent-pipeline";
import { roleDisplayLabels } from "@/types/arena";
import { isSoloParticipantRoom } from "@/lib/debate-guards";

/** 轮动分身时带入的最近条数（略减以降低 SecondMe 延迟） */
const RECENT_MESSAGES_FOR_TAKE_TURN = 14;

/** 轮询顺序：每个 userId 只出现一次（避免 host 同时在 hostUserId 与 host 席位重复占位） */
function buildParticipants(project: {
  hostUserId: string;
  slots: { userId: string | null; role: string }[];
}): { userId: string; slotRole: string; senderLabel: string }[] {
  const seen = new Set<string>();
  const out: { userId: string; slotRole: string; senderLabel: string }[] = [];
  const push = (userId: string | null | undefined, slotRole: string, senderLabel: string) => {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    out.push({ userId, slotRole, senderLabel });
  };
  push(project.hostUserId, "host", roleDisplayLabels["host"] ?? "发起者");
  for (const s of project.slots) {
    if (s.userId) push(s.userId, s.role, roleDisplayLabels[s.role] ?? s.role);
  }
  return out;
}

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

  if (isSoloParticipantRoom(project)) {
    return NextResponse.json({
      code: 0,
      data: { tookTurn: false },
      message: "当前仅您一人在场，请等待他人加入后再轮动讨论",
    });
  }

  const participants = buildParticipants(project);
  if (participants.length < 2) {
    return NextResponse.json({
      code: 0,
      data: { tookTurn: false },
      message: "至少两名参与者到场后才会自动轮动分身发言",
    });
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

  const recent = allMessages.slice(-RECENT_MESSAGES_FOR_TAKE_TURN);
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

  const created = await prisma.debateMessage.create({
    data: {
      projectId,
      kind: "human",
      senderLabel: nextParticipant.senderLabel,
      content,
      userId: session.id,
      slotRole: nextParticipant.slotRole,
    },
  });

  const title = project.title ?? undefined;
  const goal = project.goal ?? undefined;
  after(() =>
    runPostHumanMessageIntentPipeline(projectId, { projectTitle: title, projectGoal: goal }).catch((err) =>
      console.warn("[take-turn] after intent pipeline", err)
    )
  );

  return NextResponse.json({
    code: 0,
    data: {
      tookTurn: true,
      /** 立即回显：前端可合并进列表，无需等轮询 */
      message: {
        id: created.id,
        kind: created.kind as "human",
        senderLabel: created.senderLabel,
        content: created.content,
        slotRole: created.slotRole ?? undefined,
        createdAt: created.createdAt.toISOString(),
      },
    },
    message: "已发言",
  });
}
