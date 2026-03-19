/**
 * 拉取知乎证据的共享逻辑：按 project.controversyPoints 调用知乎全网可信搜，将结果以系统消息注入讨论流。
 * 供 POST /api/projects/[id]/fetch-zhihu-evidence 与 进入实证后自动拉取 共用。
 */

import { prisma } from "@/lib/db";
import { zhihuSearchGlobal } from "@/lib/zhihu";

const ZHIHU_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FetchZhihuResult {
  inserted: { query: string; count: number }[];
}

/**
 * 对已处于 zhihu_validation 阶段的项目拉取知乎证据并注入讨论。
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

  const inserted: { query: string; count: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    const query = points[i].trim();
    if (!query) continue;

    if (i > 0) await sleep(ZHIHU_DELAY_MS);

    let items: { title: string; content_text?: string; url?: string; authority_level?: string }[] = [];
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

    const block = items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.title}\n   ${(it.content_text ?? "").slice(0, 200)}${(it.content_text?.length ?? 0) > 200 ? "…" : ""}\n   ${it.url ? it.url : ""}${it.authority_level ? `（权威度: ${it.authority_level}）` : ""}`
      )
      .join("\n\n");
    const content = `【关键词「${query}」】知乎检索结果：\n\n${block}`;

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
