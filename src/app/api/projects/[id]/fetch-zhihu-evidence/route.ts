import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { zhihuSearchGlobal } from "@/lib/zhihu";
import { isReviewPhase } from "@/lib/arena";

const ZHIHU_DELAY_MS = 1100; // 知乎限流约 1 次/秒，略大于 1s 保险

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 拉取知乎证据：POST /api/projects/[id]/fetch-zhihu-evidence
 * 根据 project.controversyPoints 逐个调用知乎全网可信搜，将结果以系统消息注入讨论流。
 * 仅本场参与者可调用；需已进入 zhihu_validation 阶段。
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
  if (!isReviewPhase(phase) || phase !== "zhihu_validation") {
    return NextResponse.json(
      { code: 400, message: "请先完成「进入实证环节」再拉取知乎证据" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { code: 400, message: "暂无争议点，请先进入实证环节" },
      { status: 400 }
    );
  }

  const appKey = process.env.ZHIHU_APP_KEY;
  const appSecret = process.env.ZHIHU_APP_SECRET;
  if (!appKey || !appSecret) {
    return NextResponse.json(
      { code: 503, message: "知乎 API 未配置（ZHIHU_APP_KEY / ZHIHU_APP_SECRET）" },
      { status: 503 }
    );
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
      console.error("[fetch-zhihu-evidence] zhihu search error:", e);
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

  return NextResponse.json({
    code: 0,
    data: { inserted },
    message: "知乎证据已注入讨论，可继续发言或生成执行蓝图",
  });
}
