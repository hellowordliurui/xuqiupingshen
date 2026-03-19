/**
 * 生成执行蓝图的共享逻辑：刘看山收拢全场讨论（Supabase 对话历史），输出《赛博执行蓝图》三块并落库。
 * 供 POST /api/projects/[id]/generate-blueprint 与 拉取证据后自动生成 共用。
 */

import { prisma } from "@/lib/db";
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

const SECTION_MARKERS = {
  deadly: "致命死角",
  pitfalls: "避坑指南",
  path: "修正路径",
} as const;

export interface GenerateBlueprintResult {
  reportDeadlySpots: string;
  reportPitfalls: string;
  reportPath: string;
}

/**
 * 用 MiniMax 以刘看山口吻汇总讨论+知乎证据，输出致命死角、避坑指南、修正路径，写入 project 并置 stage=finalizing, reviewPhase=blueprint。
 */
export async function doGenerateBlueprint(projectId: string): Promise<GenerateBlueprintResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) throw new Error("项目不存在");

  if (!isMinimaxConfigured()) {
    throw new Error("MiniMax 未配置，无法生成蓝图");
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

  const result = await minimaxChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.5, max_tokens: 2000 }
  );
  const rawContent = result.content.trim();

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

  return { reportDeadlySpots, reportPitfalls, reportPath };
}
