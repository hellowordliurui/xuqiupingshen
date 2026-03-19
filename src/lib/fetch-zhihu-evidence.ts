/**
 * 拉取知乎证据的共享逻辑：按 project.controversyPoints 调用知乎全网可信搜，
 * 再根据需求、目标与讨论上下文用 LLM 将检索结果凝练成 200～500 字完整总结后注入讨论流。
 * 供 POST /api/projects/[id]/fetch-zhihu-evidence 与 进入实证后自动拉取 共用。
 */

import { prisma } from "@/lib/db";
import { zhihuSearchGlobal } from "@/lib/zhihu";
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

const ZHIHU_DELAY_MS = 1100;
const SUMMARY_MIN_CHARS = 200;
const SUMMARY_MAX_CHARS = 500;

/** 在不超过 maxLen 的前提下，截到最后一个完整句号/问号/感叹号/换行，避免半句话 */
function truncateToCompleteSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const segment = text.slice(0, maxLen + 1);
  let lastEnd = -1;
  for (const c of ["。", "！", "？", "\n"]) {
    const i = segment.lastIndexOf(c);
    if (i > lastEnd) lastEnd = i;
  }
  if (lastEnd === -1) return text.slice(0, maxLen) + "…";
  return segment.slice(0, lastEnd + 1).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FetchZhihuResult {
  inserted: { query: string; count: number }[];
}

type ZhihuItem = { title: string; content_text?: string; url?: string; authority_level?: string };

/**
 * 根据需求、目标与讨论上下文，将知乎检索原始结果凝练成 200～500 字的完整段落总结。
 * 若需截断则截到完整句末，不截半句话。
 */
async function summarizeZhihuResults(
  projectTitle: string,
  projectGoal: string,
  discussionContext: string,
  query: string,
  items: ZhihuItem[]
): Promise<string> {
  const rawBlock = items
    .map(
      (it, idx) =>
        `${idx + 1}. ${it.title}\n${(it.content_text ?? "").slice(0, 300)}${(it.content_text?.length ?? 0) > 300 ? "…" : ""}`
    )
    .join("\n\n");

  if (!isMinimaxConfigured()) {
    const first = items[0];
    const raw = (first?.content_text ?? first?.title ?? "").trim();
    return `【${query}】${truncateToCompleteSentence(raw, SUMMARY_MAX_CHARS)}`;
  }

  const systemPrompt = `你是知乎吉祥物「刘看山」的助手。根据本场需求、目标与讨论背景，把知乎检索到的多条内容凝练成一段「证据总结」，供后续讨论参考。
要求：总结篇幅控制在 200～500 字之间，写成完整的一段或几段话，句子要完整收尾，不要为凑字数在半句话处截断。只输出总结正文，不要标题、不要「总结：」等前缀。内容要扣住检索关键词与讨论焦点，突出与需求/目标相关的结论或事实。`;

  const userPrompt = `需求：${projectTitle}
目标：${projectGoal}

本场讨论摘要（供对照）：
${discussionContext.slice(0, 800)}${discussionContext.length > 800 ? "…" : ""}

检索关键词：「${query}」

知乎检索到的内容：
${rawBlock}

请输出 200～500 字的证据总结（只输出总结正文，句子写完整）。`;

  try {
    const result = await minimaxChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, max_tokens: 700 }
    );
    let summary = (result.content ?? "").trim();
    if (summary.length > SUMMARY_MAX_CHARS) {
      summary = truncateToCompleteSentence(summary, SUMMARY_MAX_CHARS);
    }
    return summary || `【${query}】知乎有相关讨论，可结合上述需求与讨论进一步判断。`;
  } catch (e) {
    console.error("[doFetchZhihuEvidence] summarization error:", e);
    const first = items[0];
    const raw = (first?.content_text ?? first?.title ?? "").trim();
    return `【${query}】${truncateToCompleteSentence(raw, SUMMARY_MAX_CHARS)}`;
  }
}

/**
 * 对已处于 zhihu_validation 阶段的项目拉取知乎证据并注入讨论。
 * 按争议点检索知乎后，根据需求、目标与讨论内容生成 200～500 字完整总结再写入，不直接呈现原始检索结果。
 * 需环境变量 ZHIHU_APP_KEY、ZHIHU_APP_SECRET；若未配置会抛错。
 */
export async function doFetchZhihuEvidence(projectId: string): Promise<FetchZhihuResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) throw new Error("项目不存在");

  const phase = project.reviewPhase ?? "spontaneous";
  if (phase !== "zhihu_validation") {
    throw new Error("请先完成「进入实证环节」再拉取知乎证据");
  }

  let points: string[] = [];
  if (project.controversyPoints) {
    try {
      const parsed = JSON.parse(project.controversyPoints) as unknown;
      points = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      // ignore
    }
  }
  if (points.length === 0) {
    throw new Error("暂无争议点，请先进入实证环节");
  }

  const appKey = process.env.ZHIHU_APP_KEY;
  const appSecret = process.env.ZHIHU_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("知乎 API 未配置（ZHIHU_APP_KEY / ZHIHU_APP_SECRET）");
  }

  // 获取上文讨论内容（仅 human/agent，用于总结时的上下文）
  const messagesBeforeEvidence = await prisma.debateMessage.findMany({
    where: {
      projectId,
      kind: { in: ["human", "agent"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const discussionContext = messagesBeforeEvidence
    .map((m) => `【${m.senderLabel}】${m.content}`)
    .join("\n\n");

  const title = project.title ?? "（未填）";
  const goal = project.goal ?? "（未填）";

  const inserted: { query: string; count: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    const query = points[i].trim();
    if (!query) continue;

    if (i > 0) await sleep(ZHIHU_DELAY_MS);

    let items: ZhihuItem[] = [];
    try {
      const res = await zhihuSearchGlobal(appKey, appSecret, { query, count: 5 });
      if (res.status === 0 && res.data?.items?.length) {
        items = res.data.items.map((it) => ({
          title: it.title,
          content_text: it.content_text,
          url: it.url,
          authority_level: it.authority_level,
        }));
      }
    } catch (e) {
      console.error("[doFetchZhihuEvidence] zhihu search error:", e);
      await prisma.debateMessage.create({
        data: {
          projectId,
          kind: "system",
          senderLabel: "知乎·证据",
          content: `【检索「${query}」时暂时失败，请稍后重试】`,
        },
      });
      inserted.push({ query, count: 0 });
      continue;
    }

    if (items.length === 0) {
      await prisma.debateMessage.create({
        data: {
          projectId,
          kind: "system",
          senderLabel: "知乎·证据",
          content: `【关键词「${query}」】知乎暂无相关结果，可换表述再试。`,
        },
      });
      inserted.push({ query, count: 0 });
      continue;
    }

    const summary = await summarizeZhihuResults(title, goal, discussionContext, query, items);
    const content = `【关键词「${query}」】知乎证据总结：\n\n${summary}`;

    await prisma.debateMessage.create({
      data: {
        projectId,
        kind: "system",
        senderLabel: "知乎·证据",
        content,
      },
    });
    inserted.push({ query, count: items.length });
  }

  return { inserted };
}
