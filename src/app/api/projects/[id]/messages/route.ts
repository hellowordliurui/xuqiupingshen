import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { roleDisplayLabels } from "@/types/arena";
import { runIntentScan } from "@/lib/intent-detection";
import { doAdvanceToValidation } from "@/lib/advance-to-validation";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";

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

  // 自发讨论阶段：发言后做意图扫描，若触发吹哨则自动进入实证并拉取知乎、生成蓝图
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
      // 意图扫描或自动进入实证失败不影响发消息
    }
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
      ...(intentCheck && { intentCheck }),
      ...(advancedToValidation && { advancedToValidation: true }),
    },
    message: advancedToValidation ? "已发送，刘看山已自动介入并进入实证环节" : "已发送",
  });
}
