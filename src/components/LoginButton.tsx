"use client";

import Link from "next/link";

export function LoginButton() {
  return (
    <Link
      href="/api/auth/login"
      className="inline-flex items-center justify-center rounded-xl border border-zhihu-blue bg-white px-4 py-2.5 text-sm font-medium text-zhihu-blue transition hover:bg-zhihu-blue/5"
    >
      通过 Second Me 登录
    </Link>
  );
}
