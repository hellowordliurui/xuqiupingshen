"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoginButton } from "./LoginButton";

interface UserInfo {
  userId: string;
  name?: string;
  avatar?: string;
  email?: string;
}

function fetchUser(opts: RequestInit): Promise<UserInfo | null> {
  return fetch("/api/auth/session", opts)
    .then((r) => r.json())
    .then((data) => {
      if (!data.user) return null;
      return fetch("/api/user/info", opts)
        .then((r) => r.json())
        .then((info) => (info.code === 0 && info.data ? info.data : null));
    })
    .catch(() => null);
}

function NavInner() {
  const [user, setUser] = useState<UserInfo | null | undefined>(undefined);
  const searchParams = useSearchParams();
  const justLoggedIn = searchParams.get("logged_in") === "1";

  useEffect(() => {
    const opts: RequestInit = { credentials: "include", cache: "no-store" };

    function apply(u: UserInfo | null) {
      setUser(u ?? null);
    }

    let retryCount = 0;
    function tryFetch() {
      fetchUser(opts).then((u) => {
        apply(u);
        if (justLoggedIn && !u && retryCount < 2) {
          retryCount += 1;
          window.history.replaceState({}, "", window.location.pathname);
          setTimeout(tryFetch, retryCount === 1 ? 400 : 800);
        } else if (justLoggedIn && !u && retryCount >= 2) {
          // 回调后 cookie 可能尚未随首请求发送，刷新整页再试一次
          window.history.replaceState({}, "", window.location.pathname);
          setTimeout(() => window.location.reload(), 600);
        } else if (justLoggedIn && u) {
          window.history.replaceState({}, "", window.location.pathname);
        }
      });
    }
    tryFetch();
  }, [justLoggedIn]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-zhihu-thin glass"
      style={{ borderColor: "rgba(0, 132, 255, 0.25)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 hover:opacity-90"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zhihu-blue/60 bg-gradient-to-br from-zhihu-blue/15 to-white shadow-sm"
            style={{ borderColor: "rgba(0, 132, 255, 0.4)" }}
          >
            <svg className="h-5 w-5 text-zhihu-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
              <circle cx="7" cy="17" r="2" fill="currentColor" />
            </svg>
          </span>
          <span className="text-xl font-bold text-gray-900">杠精评审团</span>
        </Link>
        <div className="flex items-center gap-3">
          {user === undefined ? (
            justLoggedIn ? (
              <span className="text-sm text-geek-gray">登录成功，正在加载…</span>
            ) : (
              <span className="h-9 w-9 rounded-full bg-gray-100" aria-hidden />
            )
          ) : user === null ? (
            <LoginButton />
          ) : (
            <>
              <Link
                href="/my-projects"
                className="flex items-center gap-2 rounded-full border border-zhihu-thin bg-white/80 px-3 py-2 text-sm text-geek-gray transition hover:border-zhihu-blue hover:text-zhihu-blue"
                style={{ borderColor: "rgba(0, 132, 255, 0.35)" }}
              >
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zhihu-blue/20 text-xs font-medium text-zhihu-blue">
                    {user.name?.slice(0, 1) ?? "我"}
                  </span>
                )}
                <span className="max-w-[8rem] truncate" title={user.name || undefined}>{user.name || "个人中心"}</span>
              </Link>
              <Link
                href="/api/auth/logout"
                className="text-xs text-geek-gray-light hover:text-zhihu-blue"
              >
                退出
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavFallback() {
  return (
    <header
      className="sticky top-0 z-50 border-b border-zhihu-thin glass"
      style={{ borderColor: "rgba(0, 132, 255, 0.25)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 hover:opacity-90"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zhihu-blue/60 bg-gradient-to-br from-zhihu-blue/15 to-white shadow-sm"
            style={{ borderColor: "rgba(0, 132, 255, 0.4)" }}
          >
            <svg className="h-5 w-5 text-zhihu-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
              <circle cx="7" cy="17" r="2" fill="currentColor" />
            </svg>
          </span>
          <span className="text-xl font-bold text-gray-900">杠精评审团</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-full bg-gray-100" aria-hidden />
        </div>
      </div>
    </header>
  );
}

export function Nav() {
  return (
    <Suspense fallback={<NavFallback />}>
      <NavInner />
    </Suspense>
  );
}
