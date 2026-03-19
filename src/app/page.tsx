"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DebateCard } from "@/components/DebateCard";
import { LaunchPad } from "@/components/LaunchPad";
import type { DebateCard as DebateCardType } from "@/types/arena";

type TabKey = "all" | "my";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "未收到授权码，请重新点击登录。",
  token_exchange_failed: "换取 Token 失败，请确认 Second Me 应用的回调地址与当前访问地址一致。",
  db_not_ready: "数据库连接失败，请检查 .env.local 中的 DATABASE_URL 并执行 npm run db:push。",
  callback_failed: "登录回调出错，请重试或检查控制台。",
};

function ArenaContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>("all");
  const [list, setList] = useState<DebateCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const errorCode = searchParams.get("error");
  const errorDetail = searchParams.get("detail");
  const loginError = errorCode
    ? LOGIN_ERROR_MESSAGES[errorCode] || `登录异常: ${errorCode}`
    : null;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/arena");
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) setList(json.data);
      else setList([]);
      setUnauth(false);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?my=1");
      const json = await res.json();
      if (res.status === 401) {
        setUnauth(true);
        setList([]);
        return;
      }
      if (json.code === 0 && Array.isArray(json.data)) setList(json.data);
      else setList([]);
      setUnauth(false);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "all") fetchAll();
    else fetchMy();
  }, [tab, fetchAll, fetchMy]);

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

  const fetchList = tab === "all" ? fetchAll : fetchMy;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      {loginError && (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          <p className="font-medium">登录未成功</p>
          <p className="mt-1">{loginError}</p>
          {errorDetail && <p className="mt-2 text-amber-800">{errorDetail}</p>}
          <p className="mt-3">
            <Link
              href="/api/auth/login"
              className="font-medium text-zhihu-blue underline hover:no-underline"
            >
              重新登录
            </Link>
            {" · "}
            <button
              type="button"
              onClick={() => window.history.replaceState({}, "", window.location.pathname)}
              className="font-medium text-zhihu-blue underline hover:no-underline"
            >
              关闭提示
            </button>
          </p>
        </div>
      )}
      {/* 灵感广场 | 添加目标 — 两栏平行排列（网站式布局） */}
      <div className="grid min-h-[60vh] grid-cols-1 gap-8 py-10 lg:grid-cols-[1.2fr,1fr] lg:gap-12">
        {/* 左栏：灵感广场 */}
        <section className="flex flex-col lg:min-h-0">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-base font-medium text-geek-gray">
              <svg className="h-5 w-5 shrink-0 text-zhihu-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L3 9l4-4 4 4 6-8 4 4" />
              </svg>
              寻找灵感碰撞的课题
            </h2>
            <div className="mt-3 flex items-center gap-8 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setTab("all")}
                className={`relative pb-2 text-sm font-medium transition-colors ${
                  tab === "all"
                    ? "text-zhihu-blue"
                    : "text-[#595959] hover:text-geek-gray"
                }`}
              >
                全部
                {tab === "all" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zhihu-blue" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab("my")}
                className={`relative pb-2 text-sm font-medium transition-colors ${
                  tab === "my"
                    ? "text-zhihu-blue"
                    : "text-[#595959] hover:text-geek-gray"
                }`}
              >
                我的项目
                {tab === "my" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zhihu-blue" />
                )}
              </button>
            </div>
          </div>
          {tab === "my" && unauth && (
            <div
              className="mb-4 rounded-xl border py-8 px-6 text-center text-sm text-geek-gray-light"
              style={{ borderColor: "rgba(0, 132, 255, 0.2)" }}
            >
              <p className="mb-4">登录后在此查看您发起与参与的需求实验。</p>
              <Link
                href="/api/auth/login"
                className="inline-flex rounded-lg border border-zhihu-thin bg-white/80 px-4 py-2 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/10"
                style={{ borderColor: "rgba(0, 132, 255, 0.4)" }}
              >
                通过 Second Me 登录
              </Link>
            </div>
          )}
          {!(tab === "my" && unauth) && (
            <>
              <div className="flex flex-col gap-4">
                {list.map((card) => (
                  <DebateCard key={card.id} card={card} onJoin={fetchList} currentUserName={currentUserName} />
                ))}
              </div>
              {loading && (
                <div className="rounded-xl border border-zhihu-thin py-8 text-center text-sm text-geek-gray-light" style={{ borderColor: "rgba(0, 132, 255, 0.2)" }}>
                  加载中…
                </div>
              )}
              {!loading && list.length === 0 && (
                <div
                  className="rounded-xl border border-zhihu-thin py-14 text-center text-sm text-geek-gray-light"
                  style={{ borderColor: "rgba(0, 132, 255, 0.2)" }}
                >
                  {tab === "my" ? "您还没有发起或参与任何需求，去广场发起一个吧。" : "暂无课题"}
                </div>
              )}
            </>
          )}
        </section>

        {/* 右栏：添加目标 */}
        <aside className="flex flex-col lg:min-h-0">
          <LaunchPad onSuccess={fetchList} />
        </aside>
      </div>
    </div>
  );
}

export default function ArenaPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 py-12 text-geek-gray-light">
          加载中…
        </div>
      }
    >
      <ArenaContent />
    </Suspense>
  );
}
