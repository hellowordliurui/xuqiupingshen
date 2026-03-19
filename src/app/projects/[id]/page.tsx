"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DebateCard } from "@/components/DebateCard";
import type { DebateCard as DebateCardType, DebateMessageItem } from "@/types/arena";
import type { ReviewPhase } from "@/types/arena";

function DiscussionSection({
  projectId,
  messages,
  canSend,
  onSent,
  reviewPhase,
  onPhaseDone,
}: {
  projectId: string;
  messages: DebateMessageItem[];
  canSend: boolean;
  onSent: () => void;
  reviewPhase?: ReviewPhase | string;
  onPhaseDone?: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [intentHint] = useState<{ shouldTrigger: boolean; triggeredBy: string[]; roundCount: number } | null>(null);
  const [justAdvanced] = useState(false);
  const phase = (reviewPhase as ReviewPhase) ?? "spontaneous";

  async function advanceToValidation() {
    setLoading("advance");
    try {
      const res = await fetch(`/api/projects/${projectId}/advance-to-validation`, { method: "POST" });
      const json = await res.json();
      if (json.code === 0) onPhaseDone?.();
      else alert(json.message ?? "操作失败");
    } catch {
      alert("网络错误，请重试");
    } finally {
      setLoading(null);
    }
  }

  async function fetchZhihuEvidence() {
    setLoading("zhihu");
    try {
      const res = await fetch(`/api/projects/${projectId}/fetch-zhihu-evidence`, { method: "POST" });
      const json = await res.json();
      if (json.code === 0) onPhaseDone?.();
      else alert(json.message ?? "拉取失败");
    } catch {
      alert("网络错误，请重试");
    } finally {
      setLoading(null);
    }
  }

  async function generateBlueprint() {
    setLoading("blueprint");
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-blueprint`, { method: "POST" });
      const json = await res.json();
      if (json.code === 0) onPhaseDone?.();
      else alert(json.message ?? "生成失败");
    } catch {
      alert("网络错误，请重试");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
      <h2 className="mb-2 text-base font-medium text-geek-gray">讨论记录</h2>
      {justAdvanced && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          刘看山已自动介入并进入实证环节，知乎证据已自动拉取，执行蓝图已自动生成。所有用户均可点击查看下方「刘看山 · 总结报告」中的最终结论（致命死角、避坑指南、修正路径）。
        </div>
      )}
      {intentHint?.shouldTrigger && phase === "spontaneous" && !justAdvanced && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">已触发吹哨条件</span>
          {intentHint.triggeredBy.length > 0 && (
            <span className="ml-1">（{intentHint.triggeredBy.join("、")}）</span>
          )}
          {intentHint.roundCount > 0 && (
            <span className="ml-1">· 当前 {intentHint.roundCount} 轮</span>
          )}
          <span className="ml-1">，可点击「进入实证环节」由刘看山调取知乎实锤。</span>
        </div>
      )}
      {canSend && messages.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {phase === "spontaneous" && (
            <button
              type="button"
              onClick={advanceToValidation}
              disabled={!!loading}
              className="rounded-lg bg-zhihu-blue px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zhihu-blue-hover disabled:opacity-60"
            >
              {loading === "advance" ? "处理中…" : "进入实证环节"}
            </button>
          )}
          {phase === "zhihu_validation" && (
            <button
              type="button"
              onClick={fetchZhihuEvidence}
              disabled={!!loading}
              className="rounded-lg border border-zhihu-blue px-3 py-1.5 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/5 disabled:opacity-60"
            >
              {loading === "zhihu" ? "拉取中…" : "拉取知乎证据（补拉/重试）"}
            </button>
          )}
          {phase === "blueprint" && (
            <button
              type="button"
              onClick={generateBlueprint}
              disabled={!!loading}
              className="rounded-lg border border-zhihu-blue px-3 py-1.5 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/5 disabled:opacity-60"
            >
              {loading === "blueprint" ? "生成中…" : "重新生成执行蓝图"}
            </button>
          )}
        </div>
      )}
      <div className="min-h-[120px] max-h-[400px] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/30 py-4 px-4">
        {messages.length === 0 ? (
          <div className="py-6 text-center text-sm text-geek-gray-light">
            <p>暂无发言，参与本场辩论后即可在此讨论。</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zhihu-blue">
                  {m.senderLabel}
                  {m.kind === "system" ? " · 系统" : ""}
                </span>
                <p className="text-sm text-geek-gray whitespace-pre-wrap break-words">{m.content}</p>
                <time className="text-xs text-geek-gray-light">
                  {new Date(m.createdAt).toLocaleString("zh-CN")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [card, setCard] = useState<DebateCardType | null>(null);
  const [messages, setMessages] = useState<DebateMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const hostEnterCalledRef = useRef(false);

  const refreshProject = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        setCard(json.data);
        setMessages(Array.isArray(json.data.messages) ? json.data.messages : []);
      }
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user) return;
        return fetch("/api/user/info", { credentials: "include" }).then((r) => r.json());
      })
      .then((info) => {
        if (info?.code === 0 && info?.data?.name != null) setCurrentUserName(info.data.name);
      })
      .catch(() => {});
  }, []);

  // 拉取项目详情（接口已包含 messages，不再单独请求）
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("缺少项目 ID");
      return;
    }
    setMessages([]);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 404 || json.code !== 0) {
          setError(json.message ?? "项目不存在");
          setCard(null);
          setMessages([]);
          return;
        }
        setCard(json.data);
        setMessages(Array.isArray(json.data.messages) ? json.data.messages : []);
        setError(null);
      } catch {
        if (!cancelled) setError("加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // 发起者进入时自动以分身发言一次（仅调用一次）
  useEffect(() => {
    if (!id || !card?.isCurrentUserHost || hostEnterCalledRef.current) return;
    hostEnterCalledRef.current = true;
    fetch(`/api/projects/${id}/enter`, { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 0 && json.data?.entered) refreshProject();
      })
      .catch(() => {});
  }, [id, card?.isCurrentUserHost, refreshProject]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-geek-gray-light">
        加载中…
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="mb-4 text-geek-gray">{error ?? "项目不存在"}</p>
        <Link
          href="/"
          className="text-sm font-medium text-zhihu-blue hover:underline"
        >
          返回广场
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 pb-24">
      <Link
        href="/"
        className="mb-6 inline-block text-sm font-medium text-zhihu-blue hover:underline"
      >
        ← 返回广场
      </Link>

      {/* 项目卡片摘要（只读，不展示底部按钮） */}
      <div className="mb-8">
        <DebateCard card={card} compact currentUserName={currentUserName} />
      </div>

      {/* 讨论记录（阶段操作嵌入此处） */}
      <DiscussionSection
        projectId={card.id}
        messages={messages}
        canSend={!!card.currentUserInProject}
        onSent={refreshProject}
        reviewPhase={card.reviewPhase}
        onPhaseDone={refreshProject}
      />

      {/* 刘看山 · 总结报告（有报告时展示三块，所有用户均可查看） */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
        <h2 className="mb-1 text-base font-medium text-geek-gray">
          刘看山 · 总结报告
        </h2>
        <p className="mb-4 text-xs text-geek-gray-light">所有用户均可查看最终结论</p>
        {card.reportDeadlySpots || card.reportPitfalls || card.reportPath ? (
          <div className="space-y-6">
            {card.reportDeadlySpots && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zhihu-blue">致命死角</h3>
                <div className="whitespace-pre-wrap rounded-xl bg-gray-50/80 px-4 py-3 text-sm text-geek-gray">
                  {card.reportDeadlySpots}
                </div>
              </div>
            )}
            {card.reportPitfalls && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zhihu-blue">避坑指南</h3>
                <div className="whitespace-pre-wrap rounded-xl bg-gray-50/80 px-4 py-3 text-sm text-geek-gray">
                  {card.reportPitfalls}
                </div>
              </div>
            )}
            {card.reportPath && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zhihu-blue">修正路径</h3>
                <div className="whitespace-pre-wrap rounded-xl bg-gray-50/80 px-4 py-3 text-sm text-geek-gray">
                  {card.reportPath}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="min-h-[100px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-8 px-4 text-center text-sm text-geek-gray-light"
            style={{ borderColor: "rgba(0, 132, 255, 0.15)" }}
          >
            {card.reviewPhase === "blueprint"
              ? "暂无报告（自动生成未完成时可点击「重新生成执行蓝图」）。"
              : card.reviewPhase === "zhihu_validation"
                ? "实证证据已就绪，执行蓝图将自动生成；生成后所有用户可在此查看。"
                : card.isFull
                  ? "已满员，进入实证后将自动拉取证据并生成执行蓝图。"
                  : "完成自发讨论并进入实证后，将自动拉取知乎证据并生成执行蓝图，所有用户可查看最终结论。"}
          </div>
        )}
      </section>
    </div>
  );
}
