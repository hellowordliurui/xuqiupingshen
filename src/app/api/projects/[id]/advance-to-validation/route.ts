import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isReviewPhase } from "@/lib/arena";
import { doAdvanceToValidation } from "@/lib/advance-to-validation";
import { doFetchZhihuEvidence } from "@/lib/fetch-zhihu-evidence";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";

/**
 * 进入实证环节：POST /api/projects/[id]/advance-to-validation
 * 调用共享逻辑 doAdvanceToValidation，仅本场参与者可调用。
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

  try {
    const { controversyPoints } = await doAdvanceToValidation(projectId);
    try {
      await doFetchZhihuEvidence(projectId);
      try {
        await doGenerateBlueprint(projectId);
      } catch {
        // MiniMax 未配置或生成失败不影响
      }
    } catch {
      // 知乎未配置或拉取失败不影响已进入实证
    }
    return NextResponse.json({
      code: 0,
      data: { controversyPoints },
      message: "已进入实证环节并已自动拉取知乎证据、生成执行蓝图，所有用户可点击查看最终结论",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("暂无讨论内容")) {
      return NextResponse.json({ code: 400, message: msg }, { status: 400 });
    }
    if (msg.includes("MiniMax") || msg.includes("争议点")) {
      return NextResponse.json({ code: 503, message: "MiniMax 未配置或争议点抽取失败" }, { status: 503 });
    }
    return NextResponse.json({ code: 502, message: msg }, { status: 502 });
  }
}
