import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { toDebateCard, MAX_ROOM_SIZE } from "@/lib/arena";
import { isSlotRole } from "@/lib/arena";
import { secondmeChat } from "@/lib/secondme";
import { runIntentScan } from "@/lib/intent-detection";
import { doAdvanceToValidation } from "@/lib/advance-to-validation";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";

/** 第二轮发言的固定顺序：host 先，其余按此顺序 */
const ROUND2_ORDER = ["host", "架构师", "算法", "设计师", "运营", "产品", "财务", "法务", "数据", "FE"];
const RECENT_MESSAGES_FOR_AVATAR = 25;
/** 至少几人且每人发言 1 次后触发第二轮（测试用：2 人即可，正式可改为 MAX_ROOM_SIZE） */
const MIN_PARTICIPANTS_FOR_ROUND2 = 2;

/**
 * 加入辩论：POST /api/projects/[id]/join { role?: SlotRole }
 * 每人进入后只发言 1 次；当人数 ≥ MIN_PARTICIPANTS_FOR_ROUND2 且每人已发言 1 次后，自动进行第二轮，每人再发言 1 次。
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

  // 第一轮：当前用户只发言 1 次（结合此前讨论+目标）
  const accessToken = await getAccessTokenForUser(session.id);
  let round1Content: string;
  if (accessToken && project.title && project.goal) {
    try {
      const messagesBefore = await prisma.debateMessage.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
      const recent = messagesBefore.slice(-RECENT_MESSAGES_FOR_AVATAR);
      const contextLines = recent.map((m) => `【${m.senderLabel}】${m.content}`).join("\n");
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

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!updated) {
    return NextResponse.json({ code: 500, message: "更新失败" }, { status: 500 });
  }

  const messagesNow = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const filledSlots = updated.slots.filter((s) => s.userId);
  const filledNow = filledSlots.length;
  const distinctSpeakers = new Set(messagesNow.map((m) => m.slotRole)).size;
  const round1Complete =
    filledNow >= MIN_PARTICIPANTS_FOR_ROUND2 &&
    distinctSpeakers === filledNow &&
    messagesNow.length === filledNow;

  if (round1Complete) {
    const sortedSlots = [...filledSlots].sort((a, b) => {
      const ia = ROUND2_ORDER.indexOf(a.role);
      const ib = ROUND2_ORDER.indexOf(b.role);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    const title = project.title ?? "";
    const goal = project.goal ?? "";
    for (const s of sortedSlots) {
      if (!s.userId) continue;
      const token = await getAccessTokenForUser(s.userId);
      const msgs = await prisma.debateMessage.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
      const contextLines = msgs.map((m) => `【${m.senderLabel}】${m.content}`).join("\n");
      const userPrompt = `当前讨论记录：\n${contextLines}\n\n需求：${title}\n目标：${goal}\n\n这是第二轮发言，请根据当前讨论按你的角色再发言一句（可回应他人、补充或质疑），不要重复第一轮说过的。`;
      const systemPrompt = `你正在需求评审第二轮讨论中，角色是「${s.role}」。请结合上下文用一两句话做第二轮发言（回应、补充或质疑），语气自然。`;
      let content: string;
      if (token) {
        try {
          content = await secondmeChat(token, userPrompt, { systemPrompt });
        } catch {
          content = `（${s.role}第二轮发言。）`;
        }
      } else {
        content = `（${s.role}第二轮发言。）`;
      }
      if (!content) content = `（${s.role}）`;
      await prisma.debateMessage.create({
        data: {
          projectId,
          kind: "human",
          senderLabel: s.role,
          content,
          userId: s.userId,
          slotRole: s.role,
        },
      });
    }
  }

  // 自发讨论阶段：全部消息写完后做意图扫描，若触发吹哨则自动进入实证并拉取知乎、生成蓝图
  let intentCheck: { shouldTrigger: boolean; triggeredBy: string[]; roundCount: number } | undefined;
  let advancedToValidation = false;
  const phase = project.reviewPhase ?? "spontaneous";
  if (phase === "spontaneous") {
    const allMessagesForScan = await prisma.debateMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    const humanOrAgent = allMessagesForScan.filter((m) => m.kind === "human" || m.kind === "agent");
    const scanMessages = humanOrAgent.map((m) => ({ senderLabel: m.senderLabel, content: m.content, kind: m.kind }));
    try {
      const result = await runIntentScan(scanMessages, humanOrAgent.length, {
        projectTitle: project.title ?? undefined,
        projectGoal: project.goal ?? undefined,
      });
      intentCheck = {
        shouldTrigger: result.shouldTrigger,
        triggeredBy: result.triggeredBy,
        roundCount: result.roundCount,
      };
      if (result.shouldTrigger) {
        await doAdvanceToValidation(projectId, {
          suggestedScript: result.suggestedScript,
          suggestedKeywords: result.suggestedKeywords,
        });
        advancedToValidation = true;
        try {
          await doFetchZhihuEvidence(projectId);
          try {
            await doGenerateBlueprint(projectId);
          } catch {
            // MiniMax 未配置或生成失败不影响已进入实证
          }
        } catch {
          // 知乎未配置或拉取失败不影响已进入实证
        }
      }
    } catch {
      // 意图扫描或自动进入实证失败不影响加入结果
    }
  }

  const card = updated
    ? toDebateCard(
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
      )
    : null;
  const baseMessage = round1Complete ? "已加入辩论，分身已发言；全员首轮已满，第二轮已自动完成" : "已加入辩论，分身已发言 1 条";
  return NextResponse.json({
    code: 0,
    data: {
      ...(typeof card === "object" && card !== null ? card : {}),
      ...(intentCheck && { intentCheck }),
      ...(advancedToValidation && { advancedToValidation: true }),
    },
    message: advancedToValidation ? `${baseMessage}；刘看山已自动介入并进入实证环节` : baseMessage,
  });
}
