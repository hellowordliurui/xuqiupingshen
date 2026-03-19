import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { doGenerateBlueprint } from "@/lib/generate-blueprint";

/**
 * 生成/重新生成执行蓝图：POST /api/projects/[id]/generate-blueprint
 * 蓝图在拉取知乎证据后会自动生成，本接口保留供手动重新生成。仅本场参与者可调用。
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

  try {
    const data = await doGenerateBlueprint(projectId);
    return NextResponse.json({
      code: 0,
      data: {
        reportDeadlySpots: data.reportDeadlySpots || undefined,
        reportPitfalls: data.reportPitfalls || undefined,
        reportPath: data.reportPath || undefined,
      },
      message: "执行蓝图已生成",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("MiniMax 未配置")) {
      return NextResponse.json({ code: 503, message: msg }, { status: 503 });
    }
    return NextResponse.json({ code: 502, message: msg }, { status: 502 });
  }
}
