export type CategoryKey = "tech" | "biz" | "design" | "content" | "social";

export const categoryLabels: Record<CategoryKey, string> = {
  tech: "技术落地",
  biz: "商业闭环",
  design: "设计实验",
  content: "内容媒介",
  social: "社交结构",
};

/** 卡片内角色展示名 */
export const roleDisplayLabels: Record<string, string> = {
  host: "发起者",
  "架构师": "架构师",
  "算法": "算法专家",
  "设计师": "设计师",
  "运营": "运营",
  "产品": "产品经理",
  "财务": "财务专家",
  "法务": "法务专家",
  "数据": "数据",
  FE: "FE",
};

export type SlotRole =
  | "host"
  | "架构师"
  | "算法"
  | "设计师"
  | "运营"
  | "产品"
  | "财务"
  | "法务"
  | "数据"
  | "FE";

export interface Slot {
  role: SlotRole;
  type: "human" | "agent";
  filled: boolean;
}

export type DebateStage = "debating" | "finalizing";

/**
 * 对话博弈三部曲：细粒度评审阶段，用于驱动知乎调用与刘看山总结时机。
 * - spontaneous: 第一阶段 · 自发性逻辑排雷
 * - zhihu_validation: 第二阶段 · 知乎知识实锤
 * - blueprint: 第三阶段 · 蓝图提纯与结论
 */
export type ReviewPhase = "spontaneous" | "zhihu_validation" | "blueprint";

export const reviewPhaseLabels: Record<ReviewPhase, string> = {
  spontaneous: "自发性逻辑排雷",
  zhihu_validation: "知乎知识实锤",
  blueprint: "蓝图提纯与结论",
};

export interface DebateCard {
  id: string;
  category: CategoryKey;
  title: string;
  goal: string;
  slots: Slot[];
  isFull: boolean;
  stage: DebateStage;
  missingRoles?: SlotRole[];
  /** 当前登录用户是否已在本项目中（发起者或任一席位） */
  currentUserInProject?: boolean;
  /** 评审阶段（详情页用） */
  reviewPhase?: ReviewPhase;
  /** 争议点/关键词（进入实证后由 LLM 抽取） */
  controversyPoints?: string[];
  /** 刘看山报告三块 */
  reportDeadlySpots?: string | null;
  reportPitfalls?: string | null;
  reportPath?: string | null;
  /** 讨论记录（GET /api/projects/[id] 一并返回，避免单独 /messages 路由） */
  messages?: DebateMessageItem[];
}

/** 讨论记录单条（与 API GET /api/projects/[id]/messages 返回项一致） */
export interface DebateMessageItem {
  id: string;
  kind: "human" | "agent" | "system";
  senderLabel: string;
  content: string;
  slotRole?: string;
  createdAt: string;
}
