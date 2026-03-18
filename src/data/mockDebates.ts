import type { DebateCard } from "@/types/arena";

export const mockDebates: DebateCard[] = [
  {
    id: "1",
    category: "tech",
    title: "AI 驱动的自动化内容分发逻辑修正",
    goal: "降低 30% 的人工干预成本",
    isFull: false,
    stage: "debating",
    missingRoles: ["设计师", "运营"],
    slots: [
      { role: "host", type: "human", filled: true },
      { role: "架构师", type: "agent", filled: true },
      { role: "算法", type: "agent", filled: true },
      { role: "设计师", type: "agent", filled: false },
      { role: "运营", type: "agent", filled: false },
    ],
  },
  {
    id: "2",
    category: "biz",
    title: "面向龙虾用户的 A2A 交易协议",
    goal: "实现 0 信任成本的资产交换",
    isFull: true,
    stage: "finalizing",
    slots: [
      { role: "host", type: "human", filled: true },
      { role: "产品", type: "human", filled: true },
      { role: "财务", type: "agent", filled: true },
      { role: "运营", type: "agent", filled: true },
    ],
  },
];
