"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoginButton } from "./LoginButton";

interface UserInfo {
  userId: string;
  name?: string;
  avatar?: string;
  email?: string;
}

export function Nav() {
  const [user, setUser] = useState<UserInfo | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          setUser(null);
          return;
        }
        return fetch("/api/user/info")
          .then((r) => r.json())
          .then((info) => {
            if (info.code === 0 && info.data) setUser(info.data);
            else setUser(null);
          });
      })
      .catch(() => setUser(null));
  }, []);

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
            <span className="h-9 w-9 rounded-full bg-gray-100" aria-hidden />
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
                <span className="max-w-[8rem] truncate">{user.name || "个人中心"}</span>
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
