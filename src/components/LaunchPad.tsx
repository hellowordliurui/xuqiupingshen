"use client";

import { useState } from "react";

const DEFAULT_ROLES = ["架构师", "算法", "设计师", "运营"];

interface LaunchPadProps {
  onSuccess?: () => void;
}

export function LaunchPad({ onSuccess }: LaunchPadProps) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const t = title.trim();
    const g = goal.trim();
    if (!t || !g) {
      setError("请填写需求描述与核心目标");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          goal: g,
          roles: DEFAULT_ROLES,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setTitle("");
        setGoal("");
        onSuccess?.();
      } else {
        setError(json.message ?? "创建失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="glass-panel rounded-2xl p-8 sm:p-10"
      style={{ borderColor: "rgba(0, 132, 255, 0.25)" }}
    >
      <h2 className="mb-6 text-lg font-medium text-geek-gray">
        【 🚀 您的需求和目标是什么？ 】
      </h2>
      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-sm text-geek-gray-light">
            需求描述
          </label>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入您的原始想法... 例如：Agent 版电商平台"
            rows={4}
            className="w-full min-h-[100px] resize-y rounded-lg border border-zhihu-thin bg-white/80 px-4 py-3 text-sm text-geek-gray placeholder:text-geek-gray-light focus:border-zhihu-blue focus:outline-none focus:ring-1 focus:ring-zhihu-blue/30"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-geek-gray-light">
            核心目标
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="输入具体目标... 例如：单人完成 MVP 开发"
            rows={4}
            className="w-full min-h-[100px] resize-y rounded-lg border border-zhihu-thin bg-white/80 px-4 py-3 text-sm text-geek-gray placeholder:text-geek-gray-light focus:border-zhihu-blue focus:outline-none focus:ring-1 focus:ring-zhihu-blue/30"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zhihu-blue py-3.5 text-sm font-medium text-white transition hover:bg-zhihu-blue-hover disabled:opacity-60"
        >
          <span className="opacity-90">&gt;&gt;</span>
          {submitting ? "提交中…" : "立即发起评审"}
        </button>
      </div>
    </section>
  );
}
