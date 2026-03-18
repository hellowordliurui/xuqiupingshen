import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** 开发用：给指定项目注入一批讨论消息，便于跑通「进入实证 → 知乎 → 蓝图」流程 */

const SAMPLE_MESSAGES: { senderLabel: string; kind: string; content: string }[] = [
  { senderLabel: "发起者", kind: "human", content: "我们想做一个小程序，帮用户记录每日习惯并打卡，目标是一个月内能上线 MVP。" },
  { senderLabel: "架构师", kind: "human", content: "技术栈我建议用 Taro + 云开发，但云开发的冷启动和并发上限需要提前评估，否则容易踩坑。" },
  { senderLabel: "运营", kind: "human", content: "习惯类产品同质化严重，获客成本会很高，首月如果只做功能不想清楚拉新和留存，很容易做出来没人用。" },
  { senderLabel: "设计师", kind: "human", content: "打卡的反馈要足够轻、足够爽，否则用户坚持不了几天。动画和成就体系不能省。" },
  { senderLabel: "产品经理", kind: "human", content: "争议点主要是：技术选型是否稳妥、首月目标到底是「上线」还是「有真实留存」、以及设计资源能不能跟上。" },
];

/**
 * GET /api/dev/seed-messages
 * 返回当前所有项目列表及各自消息数，便于选一个 projectId 做 POST 注入。
 */
export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });
  const list = projects.map((p) => ({
    id: p.id,
    title: p.title,
    goal: p.goal,
    messageCount: p._count.messages,
    reviewPhase: p.reviewPhase,
  }));
  return NextResponse.json({
    ok: true,
    projects: list,
    hint: "对某项目注入消息：POST /api/dev/seed-messages，body: { \"projectId\": \"<id>\" }",
  });
}

/**
 * POST /api/dev/seed-messages
 * Body: { projectId?: string }，不传则用最新一个项目。
 * 注入一批示例讨论消息，便于测试「进入实证环节」的争议点抽取。
 */
export async function POST(request: NextRequest) {
  let projectId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    projectId = body.projectId ?? undefined;
  } catch {
    // no body
  }

  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId } })
    : await prisma.project.findFirst({ orderBy: { createdAt: "desc" } });

  if (!project) {
    return NextResponse.json(
      { ok: false, error: projectId ? "项目不存在" : "数据库里还没有任何项目，请先在广场创建一个需求" },
      { status: 404 }
    );
  }

  const created = await prisma.debateMessage.createMany({
    data: SAMPLE_MESSAGES.map((m) => ({
      projectId: project.id,
      kind: m.kind,
      senderLabel: m.senderLabel,
      content: m.content,
    })),
  });

  const total = await prisma.debateMessage.count({ where: { projectId: project.id } });

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    projectTitle: project.title,
    inserted: created.count,
    totalMessages: total,
    next: `打开 /projects/${project.id} 参与本场辩论后即可点击「进入实证环节」跑通流程`,
  });
}
