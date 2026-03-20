import { prisma } from "@/lib/db";
import { runIntentScan } from "@/lib/intent-detection";
import { doAdvanceToValidation } from "@/lib/advance-to-validation";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";
import { isSoloParticipantRoom } from "@/lib/debate-guards";

/**
 * 一条新的 human/agent 消息落库后：意图扫描 → 若吹哨则进入实证并拉证据与蓝图。
 * 供路由在返回响应后通过 `after()` 异步执行，避免阻塞前端回显。
 */
export async function runPostHumanMessageIntentPipeline(
  projectId: string,
  context?: { projectTitle?: string; projectGoal?: string }
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { slots: true },
  });
  if (!project || (project.reviewPhase ?? "spontaneous") !== "spontaneous") return;
  if (isSoloParticipantRoom(project)) return;

  const allMessages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const humanOrAgent = allMessages.filter((m) => m.kind === "human" || m.kind === "agent");
  const scanMessages = humanOrAgent.map((m) => ({
    senderLabel: m.senderLabel,
    content: m.content,
    kind: m.kind,
  }));
  let result;
  try {
    result = await runIntentScan(scanMessages, humanOrAgent.length, {
      projectTitle: context?.projectTitle ?? project.title ?? undefined,
      projectGoal: context?.projectGoal ?? project.goal ?? undefined,
    });
  } catch (e) {
    console.warn("[post-message-intent-pipeline] runIntentScan", e);
    return;
  }
  if (!result.shouldTrigger) return;
  try {
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
  } catch (e) {
    console.warn("[post-message-intent-pipeline] advance/fetch", e);
  }
}
