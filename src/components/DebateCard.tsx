"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DebateCard as DebateCardType } from "@/types/arena";
import { roleDisplayLabels } from "@/types/arena";

interface DebateCardProps {
  card: DebateCardType;
  onJoin?: () => void;
  /** 详情页等场景下只展示信息，不展示底部操作按钮 */
  compact?: boolean;
  /** 当前登录用户名字，发起人席会优先展示（当 isCurrentUserHost 时） */
  currentUserName?: string | null;
}

function roleLabel(role: string) {
  return roleDisplayLabels[role] ?? role;
}

/** 角色对应的小图标颜色（绿/蓝/紫） */
const roleDotColor: Record<string, string> = {
  host: "bg-emerald-500",
  发起者: "bg-emerald-500",
  架构师: "bg-zhihu-blue",
  算法: "bg-violet-500",
  算法专家: "bg-violet-500",
  设计师: "bg-amber-500",
  运营: "bg-cyan-500",
  产品: "bg-rose-400",
  产品经理: "bg-rose-400",
  财务: "bg-emerald-600",
  财务专家: "bg-emerald-600",
  法务: "bg-slate-500",
};

function SeatCard({
  role,
  filled,
  isHost,
  displayName,
}: {
  role: string;
  filled: boolean;
  isHost?: boolean;
  /** 该席位用户的登录显示名，与讨论记录一致 */
  displayName?: string | null;
}) {
  const dotClass = roleDotColor[role] ?? "bg-zhihu-blue";
  // 大字：优先显示用户登录名，无则发起者显示「发起者」、其他显示「用户匿名」，空位显示「空位」
  const titleLabel = !filled ? "空位" : (displayName?.trim() || (isHost ? roleLabel(role) : "用户匿名"));
  // 小字：已加入显示「已加入」，空位显示「Waiting...」
  const subLabel = filled ? "已加入" : "Waiting...";

  if (!filled) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/80 py-4 px-2 shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 text-lg leading-none">+</span>
        <p className="text-center text-sm font-medium text-geek-gray">{titleLabel}</p>
        <p className="text-center text-xs text-geek-gray-light">{subLabel}</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center rounded-xl border border-gray-100 bg-white py-4 px-2 shadow-sm">
      <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ${dotClass}`} />
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-geek-gray text-xs font-medium">
        {isHost ? "主" : "专"}
      </span>
      <p className="text-center text-sm font-semibold text-geek-gray">{titleLabel}</p>
      <p className="text-center text-xs text-geek-gray-light truncate w-full" title={subLabel}>
        {subLabel}
      </p>
    </div>
  );
}

export function DebateCard({ card, onJoin, compact, currentUserName }: DebateCardProps) {
  const router = useRouter();
  const filledCount = card.slots.filter((s) => s.filled).length;
  const total = card.slots.length;
  const statusText = card.isFull
    ? "已生成执行蓝图"
    : "逻辑碰撞中";
  const [joining, setJoining] = useState(false);
  const firstMissingRole = card.missingRoles?.[0];

  async function handleJoin() {
    if (!firstMissingRole || joining) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/projects/${card.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: firstMissingRole }),
      });
      const json = await res.json();
      if (json.code === 0) {
        onJoin?.();
        router.push(`/projects/${card.id}`);
      } else {
        alert(json.message ?? "加入失败");
      }
    } catch {
      alert("网络错误，请重试");
    } finally {
      setJoining(false);
    }
  }

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
      {/* 需求 / 目标 标签 + 标题 + 状态 */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zhihu-blue px-3 py-1 text-xs font-medium text-white">
            需求
          </span>
          <span className="text-lg font-bold text-geek-gray sm:text-xl">
            {card.title}
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-geek-gray-light">
          <span className="h-1.5 w-1.5 rounded-full bg-zhihu-blue" />
          {statusText}
        </span>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: "#8b7cb3" }}
        >
          目标
        </span>
        <span className="text-lg font-bold text-geek-gray sm:text-xl">
          {card.goal}
        </span>
      </div>

      {/* 专家席位 (x/5) — 横向一排小卡片 */}
      <p className="mb-3 text-sm font-medium text-geek-gray">
        专家席位 ({filledCount}/{total})
      </p>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {card.slots.map((slot, i) => (
          <SeatCard
            key={i}
            role={slot.role}
            filled={slot.filled}
            isHost={slot.role === "host"}
            displayName={slot.displayName}
          />
        ))}
      </div>

      {/* 底部按钮 — 已在项目中显示「查看」；未在项目中显示「加入评审」或「查看总结报告」 */}
      {!compact && (
        <div className="flex flex-wrap gap-3">
          {card.currentUserInProject ? (
            <Link
              href={`/projects/${card.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/5"
            >
              <span className="text-base leading-none">👁</span>
              查看讨论
            </Link>
          ) : card.isFull ? (
            <Link
              href={`/projects/${card.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/5"
            >
              <span className="text-base leading-none">👁</span>
              查看总结报告
            </Link>
          ) : (
            <button
              type="button"
              disabled={joining || !firstMissingRole}
              onClick={handleJoin}
              className="inline-flex items-center gap-2 rounded-xl bg-zhihu-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zhihu-blue-hover disabled:opacity-60"
            >
              <span className="text-base leading-none">💬</span>
              {joining ? "加入中…" : "加入评审"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
