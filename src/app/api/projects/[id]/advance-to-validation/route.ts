import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";
import { isReviewPhase } from "@/lib/arena";

/**
 * 进入实证环节：POST /api/projects/[id]/advance-to-validation
 * 1. 用 MiniMax 从讨论记录中抽取争议点/关键词
 * 2. 写入 project.controversyPoints，reviewPhase = zhihu_validation
 * 3. 插入一条刘看山系统消息引导进入知乎验证
 * 仅本场参与者可调用。
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

  const isHost = project.hostUserId === session.id;
  const inSlot = project.slots.some((s) => s.userId === session.id);
  if (!isHost && !inSlot) {
    return NextResponse.json({ code: 403, message: "仅本场参与者可操作" }, { status: 403 });
  }

  const phase = project.reviewPhase ?? "spontaneous";
  if (!isReviewPhase(phase) || phase !== "spontaneous") {
    return NextResponse.json(
      { code: 400, message: "当前阶段不可进入实证，请先完成自发讨论" },
      { status: 400 }
    );
  }

  if (!isMinimaxConfigured()) {
    return NextResponse.json(
      { code: 503, message: "MiniMax 未配置，无法抽取争议点" },
      { status: 503 }
    );
  }

  const messages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const humanOrAgent = messages.filter((m) => m.kind === "human" || m.kind === "agent");
  if (humanOrAgent.length === 0) {
    return NextResponse.json(
      { code: 400, message: "暂无讨论内容，请先发言后再进入实证" },
      { status: 400 }
    );
  }

  const discussionText = humanOrAgent
    .map((m) => `【${m.senderLabel}】${m.content}`)
    .join("\n\n");

  const prompt = `你是一个需求评审助手。根据以下讨论内容，提炼 3～5 个「争议点」或「关键词」，用于后续在知乎上检索真实信息做验证。
要求：只输出一个 JSON 数组，例如 ["关键词A", "关键词B", "关键词C"]，不要任何其他说明、不要 markdown 代码块包裹。

需求标题：${project.title}
目标：${project.goal}

讨论内容：
${discussionText}`;

  let rawContent: string;
  try {
    const result = await minimaxChat([
      { role: "system", content: "你只输出合法的 JSON 数组，不要其他文字。" },
      { role: "user", content: prompt },
    ], { temperature: 0.3, max_tokens: 500 });
    rawContent = result.content.trim();
  } catch (e) {
    console.error("[advance-to-validation] MiniMax error:", e);
    return NextResponse.json(
      { code: 502, message: e instanceof Error ? e.message : "争议点抽取失败" },
      { status: 502 }
    );
  }

  // 允许被 markdown 代码块包裹
  let jsonStr = rawContent;
  const codeBlock = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  let points: string[] = [];
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    points = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, 5)
      : [];
  } catch {
    // 兜底：按行或逗号拆
    const fallback = jsonStr.replace(/^\[|\]$/g, "").split(/[,，]/).map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    points = fallback.slice(0, 5);
  }

  if (points.length === 0) {
    points = [project.title, project.goal];
  }

  const controversyPointsJson = JSON.stringify(points);

  const guideContent = `大家已经围绕「${points.join("」「")}」等有了不同看法。接下来用知乎上的真实问答与文章来验证一下，请基于检索到的证据继续讨论或修正观点。`;

  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { reviewPhase: "zhihu_validation", controversyPoints: controversyPointsJson },
    }),
    prisma.debateMessage.create({
      data: {
        projectId,
        kind: "system",
        senderLabel: "刘看山",
        content: guideContent,
      },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { controversyPoints: points },
    message: "已进入实证环节，可点击「拉取知乎证据」获取真实资料",
  });
}
