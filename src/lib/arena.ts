import type { CategoryKey, DebateCard, Slot as SlotType, SlotRole, DebateStage, ReviewPhase } from "@/types/arena";

const CATEGORIES: CategoryKey[] = ["tech", "biz", "design", "content", "social"];
const STAGES: DebateStage[] = ["debating", "finalizing"];

/** 对话博弈三阶段，与 背景/需求辩论-对话流程逻辑.md 一致 */
export const REVIEW_PHASES: ReviewPhase[] = ["spontaneous", "zhihu_validation", "blueprint"];

/** 房间人数上限（极简准入：仅校验人数 < MAX_ROOM_SIZE） */
export const MAX_ROOM_SIZE = 5;

export function isCategory(s: string): s is CategoryKey {
  return CATEGORIES.includes(s as CategoryKey);
}

export function isSlotRole(s: string): s is SlotRole {
  return ["host", "架构师", "算法", "设计师", "运营", "产品", "财务", "法务", "数据", "FE"].includes(s);
}

export function isStage(s: string): s is DebateStage {
  return STAGES.includes(s as DebateStage);
}

export function isReviewPhase(s: string): s is ReviewPhase {
  return REVIEW_PHASES.includes(s as ReviewPhase);
}

/** 将 DB 的 Project + Slot[] 转成前端的 DebateCard；currentUserId 用于计算 currentUserInProject */
export function toDebateCard(
  p: {
    id: string;
    title: string;
    goal: string;
    category: string;
    stage: string;
    hostUserId: string;
    slots: { role: string; type: string; userId: string | null; displayName?: string | null }[];
  },
  currentUserId?: string | null
): DebateCard {
  const category: CategoryKey = isCategory(p.category) ? p.category : "tech";
  const stage: DebateStage = isStage(p.stage) ? p.stage : "debating";
  const slots: SlotType[] = p.slots.map((s) => ({
    role: s.role as SlotRole,
    type: (s.type === "human" ? "human" : "agent") as "human" | "agent",
    filled: !!s.userId,
    displayName: s.displayName ?? undefined,
  }));
  const missingRoles = p.slots.filter((s) => !s.userId).map((s) => s.role as SlotRole);
  const isFull = slots.every((s) => s.filled);
  const currentUserInProject =
    !!currentUserId &&
    (p.hostUserId === currentUserId || p.slots.some((s) => s.userId === currentUserId));
  const isCurrentUserHost = !!currentUserId && p.hostUserId === currentUserId;
  return {
    id: p.id,
    category,
    title: p.title,
    goal: p.goal,
    slots,
    isFull,
    stage,
    missingRoles: missingRoles.length ? missingRoles : undefined,
    currentUserInProject: currentUserInProject || undefined,
    isCurrentUserHost: isCurrentUserHost || undefined,
  };
}
