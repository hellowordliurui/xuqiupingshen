"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DebateCard } from "@/components/DebateCard";
import type { DebateCard as DebateCardType, DebateMessageItem } from "@/types/arena";
import { reviewPhaseLabels, type ReviewPhase } from "@/types/arena";

function DiscussionSection({
  projectId,
  messages,
  canSend,
  onSent,
}: {
  projectId: string;
  messages: DebateMessageItem[];
  canSend: boolean;
  onSent: () => void;
}) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, content: text }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setContent("");
        onSent();
      } else {
        alert(json.message ?? "发送失败");
      }
    } catch {
      alert("网络错误，请重试");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
      <h2 className="mb-4 text-base font-medium text-geek-gray">讨论记录</h2>
      <div className="min-h-[120px] max-h-[400px] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/30 py-4 px-4">
        {messages.length === 0 ? (
          <div className="py-6 text-center text-sm text-geek-gray-light space-y-3">
            <p>暂无发言，参与本场辩论后即可在此讨论。</p>
            {process.env.NODE_ENV === "development" && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/dev/seed-messages", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ projectId }),
                    });
                    const json = await res.json();
                    if (json.ok) {
                      onSent();
                    } else {
                      alert(json.error ?? "注入失败");
                    }
                  } catch {
                    alert("请求失败");
                  }
                }}
                className="text-zhihu-blue hover:underline font-medium"
              >
                开发：注入示例讨论数据
              </button>
            )}
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
      {canSend && (
        <div className="mt-4 flex gap-2">
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-geek-gray placeholder:text-geek-gray-light focus:border-zhihu-blue focus:outline-none focus:ring-1 focus:ring-zhihu-blue/30"
            placeholder="输入你的观点或质询…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={sending}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !content.trim()}
            className="shrink-0 self-end rounded-lg bg-zhihu-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-zhihu-blue-hover disabled:opacity-60"
          >
            {sending ? "发送中…" : "发送"}
          </button>
        </div>
      )}
    </section>
  );
}

function PhaseActions({
  projectId,
  reviewPhase,
  canSend,
  onDone,
}: {
  projectId: string;
  reviewPhase?: ReviewPhase | string;
  canSend: boolean;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function advanceToValidation() {
    setLoading("advance");
    try {
      const res = await fetch(`/api/projects/${projectId}/advance-to-validation`, { method: "POST" });
      const json = await res.json();
      if (json.code === 0) onDone();
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
      if (json.code === 0) onDone();
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
      if (json.code === 0) onDone();
      else alert(json.message ?? "生成失败");
    } catch {
      alert("网络错误，请重试");
    } finally {
      setLoading(null);
    }
  }

  if (!canSend) return null;

  const phase = (reviewPhase as ReviewPhase) ?? "spontaneous";

  return (
    <section className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
      <h2 className="mb-2 text-base font-medium text-geek-gray">评审阶段</h2>
      <p className="mb-4 text-sm text-geek-gray-light">
        {reviewPhaseLabels[phase] ?? phase}
      </p>
      <div className="flex flex-wrap gap-2">
        {phase === "spontaneous" && (
          <button
            type="button"
            onClick={advanceToValidation}
            disabled={!!loading}
            className="rounded-lg bg-zhihu-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-zhihu-blue-hover disabled:opacity-60"
          >
            {loading === "advance" ? "处理中…" : "进入实证环节"}
          </button>
        )}
        {phase === "zhihu_validation" && (
          <>
            <button
              type="button"
              onClick={fetchZhihuEvidence}
              disabled={!!loading}
              className="rounded-lg border border-zhihu-blue px-4 py-2 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/5 disabled:opacity-60"
            >
              {loading === "zhihu" ? "拉取中…" : "拉取知乎证据"}
            </button>
            <button
              type="button"
              onClick={generateBlueprint}
              disabled={!!loading}
              className="rounded-lg bg-zhihu-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-zhihu-blue-hover disabled:opacity-60"
            >
              {loading === "blueprint" ? "生成中…" : "生成执行蓝图"}
            </button>
          </>
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
        <DebateCard card={card} compact />
      </div>

      {/* 阶段操作：进入实证 / 拉取知乎 / 生成蓝图 */}
      <PhaseActions
        projectId={card.id}
        reviewPhase={card.reviewPhase}
        canSend={!!card.currentUserInProject}
        onDone={refreshProject}
      />

      {/* 讨论记录区域 */}
      <DiscussionSection
        projectId={card.id}
        messages={messages}
        canSend={!!card.currentUserInProject}
        onSent={refreshProject}
      />

      {/* 刘看山 · 总结报告（有报告时展示三块） */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
        <h2 className="mb-4 text-base font-medium text-geek-gray">
          刘看山 · 总结报告
        </h2>
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
              ? "暂无报告，可点击「生成执行蓝图」生成。"
              : card.isFull
                ? "已满员，可点击「生成执行蓝图」输出落地方案。"
                : "完成讨论并进入实证、拉取知乎证据后，可生成执行蓝图与执行计划。"}
          </div>
        )}
      </section>
    </div>
  );
}
