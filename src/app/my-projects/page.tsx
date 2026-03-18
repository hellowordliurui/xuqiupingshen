"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DebateCard } from "@/components/DebateCard";
import { LiuKanshan } from "@/components/LiuKanshan";
import type { DebateCard as DebateCardType } from "@/types/arena";

export default function MyProjectsPage() {
  const [list, setList] = useState<DebateCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects?my=1");
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 401) {
          setUnauth(true);
          setList([]);
          return;
        }
        if (json.code === 0 && Array.isArray(json.data)) setList(json.data);
        else setList([]);
      } catch {
        if (!cancelled) setList([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?my=1");
      const json = await res.json();
      if (res.status === 401) setUnauth(true);
      else if (json.code === 0 && Array.isArray(json.data)) setList(json.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 pb-24">
      <h1 className="mb-6 text-lg font-medium text-geek-gray">
        我的项目
      </h1>
      {unauth && (
        <div
          className="glass-panel rounded-xl p-12 text-center"
          style={{ borderColor: "rgba(0, 132, 255, 0.25)" }}
        >
          <p className="mb-6 text-sm text-geek-gray-light">
            登录后在此查看您发起与参与的需求实验及刘看山报告。
          </p>
          <Link
            href="/api/auth/login"
            className="inline-flex rounded-lg border border-zhihu-thin bg-white/80 px-4 py-2 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/10"
            style={{ borderColor: "rgba(0, 132, 255, 0.4)" }}
          >
            通过 Second Me 登录
          </Link>
        </div>
      )}
      {!unauth && loading && (
        <div className="rounded-xl border border-zhihu-thin py-12 text-center text-sm text-geek-gray-light" style={{ borderColor: "rgba(0, 132, 255, 0.2)" }}>
          加载中…
        </div>
      )}
      {!unauth && !loading && list.length === 0 && (
        <div
          className="glass-panel rounded-xl p-12 text-center"
          style={{ borderColor: "rgba(0, 132, 255, 0.25)" }}
        >
          <p className="mb-6 text-sm text-geek-gray-light">
            您还没有发起或参与任何需求，去广场发起一个吧。
          </p>
          <Link
            href="/"
            className="inline-flex rounded-lg border border-zhihu-thin bg-white/80 px-4 py-2 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/10"
            style={{ borderColor: "rgba(0, 132, 255, 0.4)" }}
          >
            去广场看看
          </Link>
        </div>
      )}
      {!unauth && !loading && list.length > 0 && (
        <div className="flex flex-col gap-4">
          {list.map((card) => (
            <DebateCard key={card.id} card={card} onJoin={refresh} />
          ))}
        </div>
      )}
      <LiuKanshan />
    </div>
  );
}
