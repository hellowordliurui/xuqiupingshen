import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runIntentScan } from "@/lib/intent-detection";
import { doAdvanceToValidation } from "@/lib/advance-to-validation";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";

/**
 * 详情页加载时调用：若当前为自发讨论阶段且意图扫描触发吹哨，则自动进入实证并拉取知乎、生成蓝图。
 * POST /api/projects/[id]/auto-advance-if-intent
 * 用于把「加入评审」接口中的重逻辑延后到详情页，加快加入响应。
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
  const inSlot = project.slots.some((s) => s.userId === session.id);
  if (!isHost && !inSlot) {
    return NextResponse.json({ code: 403, message: "仅本场参与者可操作" }, { status: 403 });
  }

  const phase = project.reviewPhase ?? "spontaneous";
  if (phase !== "spontaneous") {
    return NextResponse.json({ code: 0, data: { advanced: false }, message: "当前已非自发讨论阶段" });
  }

  const allMessagesForScan = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const humanOrAgent = allMessagesForScan.filter((m) => m.kind === "human" || m.kind === "agent");
  if (humanOrAgent.length === 0) {
    return NextResponse.json({ code: 0, data: { advanced: false } });
  }

  const scanMessages = humanOrAgent.map((m) => ({ senderLabel: m.senderLabel, content: m.content, kind: m.kind }));
  try {
    const result = await runIntentScan(scanMessages, humanOrAgent.length, {
      projectTitle: project.title ?? undefined,
      projectGoal: project.goal ?? undefined,
    });
    if (!result.shouldTrigger) {
      return NextResponse.json({ code: 0, data: { advanced: false }, intentCheck: result });
    }
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
    return NextResponse.json({
      code: 0,
      data: { advanced: true },
      message: "刘看山已自动介入并进入实证环节",
    });
  } catch (e) {
    console.error("[auto-advance-if-intent]", e);
    return NextResponse.json({ code: 0, data: { advanced: false } });
  }
}
