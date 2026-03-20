import { NextRequest, NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { toDebateCard } from "@/lib/arena";
import { roleDisplayLabels } from "@/types/arena";
import { secondmeChat } from "@/lib/secondme";
import { isSoloParticipantRoom } from "@/lib/debate-guards";
import { runPostHumanMessageIntentPipeline } from "@/lib/post-message-intent-pipeline";

const MAX_SLOTS = 5;
const ROLES_ALLOWED: string[] = ["host", "架构师", "算法", "设计师", "运营", "产品", "财务", "法务", "数据", "FE"];
/** 同一用户连续发言次数上限，超过且无人回复则不再允许发言 */
const MAX_CONSECUTIVE_SELF = 3;
const RECENT_MESSAGES_FOR_AVATAR = 14;

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
    const userIds = new Set<string>();
    list.forEach((p) => {
      userIds.add(p.hostUserId);
      p.slots.forEach((s) => { if (s.userId) userIds.add(s.userId); });
    });
    let displayNameByUserId = new Map<string, string | null>();
    if (userIds.size > 0) {
      try {
        const users = await prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, displayName: true },
        });
        displayNameByUserId = new Map(users.map((u) => [u.id, (u as { displayName?: string | null }).displayName?.trim() || null]));
      } catch {
        // displayName 列可能尚未迁移
      }
    }

    const data = list.map((p) => {
      const card = toDebateCard(
        {
          id: p.id,
          title: p.title,
          goal: p.goal,
          category: p.category,
          stage: p.stage,
          hostUserId: p.hostUserId,
          slots: p.slots.map((s) => ({
            role: s.role,
            type: s.type,
            userId: s.userId,
            displayName: s.userId ? displayNameByUserId.get(s.userId) ?? null : null,
          })),
        },
        session?.id
      );
      return {
        ...card,
        reviewPhase: p.reviewPhase ?? "spontaneous",
        reportDeadlySpots: p.reportDeadlySpots ?? undefined,
        reportPitfalls: p.reportPitfalls ?? undefined,
        reportPath: p.reportPath ?? undefined,
      };
    });
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

  let body: { title?: string; goal?: string; category?: string; roles?: string[]; projectId?: string; content?: string; initialDiscussion?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 400, message: "无效 JSON" }, { status: 400 });
  }

  // 发讨论消息：body 含 projectId，content 为可选发言方向；无 title 表示非创建项目。发言内容由 Second Me 分身生成。
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const direction = typeof body.content === "string" ? body.content.trim() : "";
  if (projectId && !body.title) {
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

    if (isSoloParticipantRoom(project)) {
      const already = await prisma.debateMessage.count({
        where: {
          projectId,
          userId: session.id,
          kind: { in: ["human", "agent"] },
        },
      });
      if (already >= 1) {
        return NextResponse.json(
          {
            code: 400,
            message: "目前仅您一人在场，保留一条开场即可；请等待其他成员加入后再继续发言。",
          },
          { status: 400 }
        );
      }
    }

    const allMessages = await prisma.debateMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    let consecutiveSelf = 0;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      if (allMessages[i].userId === session.id) consecutiveSelf++;
      else break;
    }
    if (consecutiveSelf >= MAX_CONSECUTIVE_SELF) {
      return NextResponse.json(
        { code: 400, message: "您已连续发言 " + MAX_CONSECUTIVE_SELF + " 次，请等待他人回复后再发言" },
        { status: 400 }
      );
    }

    const accessToken = await getAccessTokenForUser(session.id);
    if (!accessToken) {
      return NextResponse.json(
        { code: 403, message: "需要 Second Me 分身权限才能发言，请重新登录并授权「聊天」权限" },
        { status: 403 }
      );
    }

    const recent = allMessages.slice(-RECENT_MESSAGES_FOR_AVATAR);
    const contextLines = recent.map((m) => `【${m.senderLabel}】${m.content}`).join("\n");
    const userPrompt =
      `当前讨论记录：\n${contextLines || "（暂无）"}\n\n需求：${project.title}\n目标：${project.goal}\n\n` +
      (direction
        ? `请根据以上讨论，按用户给出的发言方向回复一句：${direction}`
        : "请以你的身份根据当前讨论继续发言，一句即可。");
    const systemPrompt = `你正在一场需求评审讨论中，你的角色是「${senderLabel}」。请用你的身份和性格，根据当前讨论内容回复一句（可表态、质疑或建议）。不要复述需求原文，语气自然。`;

    let avatarContent: string;
    try {
      avatarContent = await secondmeChat(accessToken, userPrompt, { systemPrompt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { code: 502, message: "分身生成失败，请稍后重试。若持续失败请确认已授权 Second Me「聊天」权限并重新登录。" + (msg ? " " + msg.slice(0, 80) : "") },
        { status: 502 }
      );
    }
    if (!avatarContent) avatarContent = "（分身未返回内容）";

    const message = await (
      prisma as typeof prisma & { debateMessage: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; kind: string; senderLabel: string; content: string; slotRole: string | null; createdAt: Date }> } }
    ).debateMessage.create({
      data: {
        projectId,
        kind: "human",
        senderLabel,
        content: avatarContent,
        userId: session.id,
        slotRole,
      },
    });

    if (phase === "spontaneous") {
      const title = project.title ?? undefined;
      const goal = project.goal ?? undefined;
      after(() =>
        runPostHumanMessageIntentPipeline(projectId, { projectTitle: title, projectGoal: goal }).catch((err) =>
          console.warn("[api/projects POST avatar] after intent pipeline", err)
        )
      );
    }

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

    // 发起者作为一方，首次「进入」项目页时由分身发言（见 POST /api/projects/[id]/enter），此处不再自动写第一条消息

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
