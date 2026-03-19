import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isReviewPhase } from "@/lib/arena";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";

/**
 * 拉取知乎证据：POST /api/projects/[id]/fetch-zhihu-evidence
 * 根据 project.controversyPoints 逐个调用知乎全网可信搜，将结果以系统消息注入讨论流。
 * 仅本场参与者可调用；需已进入 zhihu_validation 阶段。
 * （进入实证后也会自动拉取，本接口仍保留供手动补拉或重试。）
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

  try {
    const { inserted } = await doFetchZhihuEvidence(projectId);
    return NextResponse.json({
      code: 0,
      data: { inserted },
      message: "知乎证据已注入讨论，可继续发言或生成执行蓝图",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("项目不存在") || msg.includes("进入实证") || msg.includes("争议点")) {
      return NextResponse.json({ code: 400, message: msg }, { status: 400 });
    }
    if (msg.includes("知乎 API 未配置")) {
      return NextResponse.json({ code: 503, message: msg }, { status: 503 });
    }
    return NextResponse.json({ code: 502, message: msg }, { status: 502 });
  }
}
