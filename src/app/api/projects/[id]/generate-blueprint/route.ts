import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

const SECTION_MARKERS = {
  deadly: "致命死角",
  pitfalls: "避坑指南",
  path: "修正路径",
} as const;

/**
 * 生成执行蓝图：POST /api/projects/[id]/generate-blueprint
 * 用 MiniMax 以刘看山口吻汇总讨论+知乎证据，输出【致命死角】【避坑指南】【修正路径】，落库并置 stage=finalizing。
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

  if (!isMinimaxConfigured()) {
    return NextResponse.json(
      { code: 503, message: "MiniMax 未配置，无法生成蓝图" },
      { status: 503 }
    );
  }

  const messages = await prisma.debateMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const fullContext = messages
    .map((m) => `【${m.senderLabel}】${m.content}`)
    .join("\n\n");

  const systemPrompt = `你是知乎吉祥物「刘看山」。请根据需求讨论与知乎证据，用简洁、务实的口吻输出一份执行蓝图。
必须严格按以下三个小节输出，每节以「## 」标题开头，标题后换行再写正文。不要输出其他内容。

## 致命死角
（列出若不注意会导致失败的关键风险点，3～5 条）

## 避坑指南
（基于讨论与证据的实操避坑建议，3～5 条）

## 修正路径
（分步骤的落地执行建议，条理清晰）`;

  const userPrompt = `需求标题：${project.title}
目标：${project.goal}

讨论与证据记录：
${fullContext}

请输出上述三小节内容。`;

  let rawContent: string;
  try {
    const result = await minimaxChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.5, max_tokens: 2000 }
    );
    rawContent = result.content.trim();
  } catch (e) {
    console.error("[generate-blueprint] MiniMax error:", e);
    return NextResponse.json(
      { code: 502, message: e instanceof Error ? e.message : "蓝图生成失败" },
      { status: 502 }
    );
  }

  const extractSection = (marker: string): string => {
    const re = new RegExp(`##\\s*${marker}\\s*[\\n\\r]+([\\s\\S]*?)(?=##|$)`, "i");
    const m = rawContent.match(re);
    return (m ? m[1].trim() : "") || "";
  };

  const reportDeadlySpots = extractSection(SECTION_MARKERS.deadly);
  const reportPitfalls = extractSection(SECTION_MARKERS.pitfalls);
  const reportPath = extractSection(SECTION_MARKERS.path);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      stage: "finalizing",
      reviewPhase: "blueprint",
      reportDeadlySpots: reportDeadlySpots || null,
      reportPitfalls: reportPitfalls || null,
      reportPath: reportPath || null,
    },
  });

  return NextResponse.json({
    code: 0,
    data: {
      reportDeadlySpots: reportDeadlySpots || undefined,
      reportPitfalls: reportPitfalls || undefined,
      reportPath: reportPath || undefined,
    },
    message: "执行蓝图已生成",
  });
}
