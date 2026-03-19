import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toDebateCard } from "@/lib/arena";

/** 广场列表：GET /api/arena */
export async function GET() {
  try {
    if (!prisma.project) {
      return NextResponse.json({ code: 0, data: [] });
    }
    const session = await getSession();
    const list = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { slots: true },
    });
    const cards = list.map((p) => {
      const card = toDebateCard(
        {
          id: p.id,
          title: p.title,
          goal: p.goal,
          category: p.category,
          stage: p.stage,
          hostUserId: p.hostUserId,
          slots: p.slots.map((s) => ({ role: s.role, type: s.type, userId: s.userId })),
        },
        session?.id
      );
      return {
        ...card,
        reviewPhase: p.reviewPhase ?? "spontaneous",
        reportDeadlySpots: p.reportDeadlySpots ?? undefined,
        reportPitfalls: p.reportPitfalls ?? undefined,
        reportPath: p.reportPath ?? undefined,
      };
    });
    return NextResponse.json({ code: 0, data: cards });
  } catch (e) {
    console.error("[api/arena]", e);
    return NextResponse.json({ code: 0, data: [] });
  }
}
