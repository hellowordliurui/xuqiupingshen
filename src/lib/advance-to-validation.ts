/**
 * 进入实证环节的共享逻辑：更新阶段、写入争议点、插入刘看山引导消息。
 * 供 POST /api/projects/[id]/advance-to-validation 与 发消息后自动吹哨 共用。
 */

import { prisma } from "@/lib/db";
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

export interface AdvanceOptions {
  /** 刘看山吹哨话术（意图识别返回的 suggestedScript），有则直接用作系统消息内容 */
  suggestedScript?: string | null;
  /** 实证关键词（意图识别返回的 suggestedKeywords），有则优先使用，不再调 LLM 抽取 */
  suggestedKeywords?: string[] | null;
}

/**
 * 执行「进入实证环节」：reviewPhase → zhihu_validation，写入 controversyPoints，插入刘看山消息。
 * 若未传 suggestedKeywords 或为空，且 MiniMax 已配置，则用 LLM 从讨论中抽取争议点。
 */
export async function doAdvanceToValidation(
  projectId: string,
  options?: AdvanceOptions
): Promise<{ controversyPoints: string[] }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) throw new Error("项目不存在");

  const messages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const humanOrAgent = messages.filter((m) => m.kind === "human" || m.kind === "agent");
  if (humanOrAgent.length === 0) {
    throw new Error("暂无讨论内容，请先发言后再进入实证");
  }

  let points: string[] = [];
  const fromIntent = options?.suggestedKeywords && options.suggestedKeywords.length > 0;
  if (fromIntent) {
    points = options.suggestedKeywords!.slice(0, 5);
  } else if (isMinimaxConfigured()) {
    const discussionText = humanOrAgent
      .map((m) => `【${m.senderLabel}】${m.content}`)
      .join("\n\n");
    const prompt = `你是一个需求评审助手。请根据「发起人的需求与目标」以及「讨论内容」中的分歧、焦点、疑点，提炼 3～5 个用于知乎检索的「争议点/关键词」。
要求：只输出一个 JSON 数组，例如 ["关键词A", "关键词B", "关键词C"]，不要任何其他说明、不要 markdown 代码块包裹。
关键词必须严格基于本场需求与讨论提炼，用于在知乎上检索真实信息做验证；不要使用与本次讨论无关的通用词（如情绪递进、行为引导、触发条件、需求抽象、用户场景等）。

需求标题：${project.title}
目标：${project.goal}

讨论内容：
${discussionText}`;

    const result = await minimaxChat(
      [
        { role: "system", content: "你只输出合法的 JSON 数组，不要其他文字。" },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, max_tokens: 500 }
    );
    let jsonStr = result.content.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();
    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      points = Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string").slice(0, 5)
        : [];
    } catch {
      const fallback = jsonStr.replace(/^\[|\]$/g, "").split(/[,，]/).map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      points = fallback.slice(0, 5);
    }
  }

  if (points.length === 0) {
    points = [project.title, project.goal];
  }

  const controversyPointsJson = JSON.stringify(points);
  const guideContent =
    options?.suggestedScript?.trim() ||
    `大家已经围绕「${points.join("」「")}」等有了不同看法。接下来用知乎上的真实问答与文章来验证一下，请基于检索到的证据继续讨论或修正观点。`;

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

  return { controversyPoints: points };
}
