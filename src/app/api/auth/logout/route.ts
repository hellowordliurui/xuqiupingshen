import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/auth";

const SESSION_COOKIE = "sid";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (sid) await deleteSession(sid);
  const baseUrl = request.nextUrl.origin;
  const res = NextResponse.redirect(new URL("/", baseUrl));
  // 用 set 置空 + maxAge 0 清除 cookie，兼容性比 delete(options) 更稳，避免本地/构建环境差异
  const clearOptions: { path: string; domain?: string; maxAge: number; httpOnly: boolean; secure: boolean; sameSite: 'lax' } = {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };
  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  if (process.env.NODE_ENV === "production" && cookieDomain) {
    clearOptions.domain = cookieDomain.startsWith(".") ? cookieDomain : `.${cookieDomain}`;
  }
  res.cookies.set(SESSION_COOKIE, "", clearOptions);
  return res;
}
