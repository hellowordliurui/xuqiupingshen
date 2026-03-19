import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens } from "@/lib/secondme";
import { createSession } from "@/lib/auth";
const STATE_COOKIE = "oauth_state";
const SESSION_COOKIE = "sid";

function redirectError(request: NextRequest, code: string, detail?: string) {
  const params = new URLSearchParams({ error: code });
  if (detail) params.set("detail", detail);
  return NextResponse.redirect(new URL(`/?${params.toString()}`, request.url));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  try {
    const cookieStore = await cookies();
    const savedState = cookieStore.get(STATE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);

    if (state !== savedState) {
      console.warn("OAuth state 验证失败，可能是跨 WebView 场景");
    }

    const redirectUri = process.env.SECONDME_REDIRECT_URI;
    if (!redirectUri) {
      console.error("[auth/callback] SECONDME_REDIRECT_URI 未配置");
      return redirectError(request, "config", "SECONDME_REDIRECT_URI 未配置");
    }

    let tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    try {
      tokens = await exchangeCodeForTokens(code, redirectUri);
    } catch (e) {
      console.error("[auth/callback] 换 token 失败", e);
      return redirectError(request, "token_exchange_failed");
    }

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const apiBase = process.env.SECONDME_API_BASE_URL ?? "https://api.mindverse.com/gate/lab";
    const userInfoRes = await fetch(`${apiBase}/api/secondme/user/info`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const userInfoJson = (await userInfoRes.json()) as { code: number; data?: { userId: string } };
    const secondmeUserId = userInfoJson.code === 0 && userInfoJson.data?.userId
      ? String(userInfoJson.data.userId)
      : "unknown";

    const user = await prisma.user.upsert({
      where: { secondmeUserId },
      create: {
        secondmeUserId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: expiresAt,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: expiresAt,
      },
    });

    const sessionId = await createSession(user.id);
    const baseUrl = new URL(request.url).origin;
    const res = NextResponse.redirect(new URL("/", baseUrl));
    res.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/callback] 未处理错误", e);
    const isDbError = msg.includes("SQLite") || msg.includes("prisma") || msg.includes("database") || msg.includes("no such table");
    if (isDbError) {
      return redirectError(request, "db_not_ready", "请先执行: npx prisma db push");
    }
    return redirectError(request, "callback_failed", msg.slice(0, 100));
  }
}
