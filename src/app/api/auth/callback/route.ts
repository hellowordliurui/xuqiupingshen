import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens } from "@/lib/secondme";
import { createSession } from "@/lib/auth";
import { getCanonicalOrigin } from "@/lib/request-origin";
const STATE_COOKIE = "oauth_state";
const SESSION_COOKIE = "sid";

function redirectError(request: NextRequest, code: string, detail?: string) {
  const params = new URLSearchParams({ error: code });
  if (detail) params.set("detail", detail);
  const base = getCanonicalOrigin(request);
  return NextResponse.redirect(new URL(`/?${params.toString()}`, base));
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

    // 生产环境用 x-forwarded-* 拼出 HTTPS origin，避免重定向到 http 或域名错位导致 Set-Cookie 不生效
    const baseUrl = getCanonicalOrigin(request);
    const redirectUri =
      process.env.NODE_ENV === "production"
        ? (process.env.SECONDME_REDIRECT_URI || `${baseUrl}/api/auth/callback`)
        : `${baseUrl}/api/auth/callback`;

    let tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    try {
      tokens = await exchangeCodeForTokens(code, redirectUri);
    } catch (e) {
      console.error("[auth/callback] 换 token 失败", e);
      const detail =
        "请确认 Second Me 开发者后台的回调地址与当前访问地址一致（如 http://localhost:3002/api/auth/callback 或 http://127.0.0.1:3002/api/auth/callback）";
      return redirectError(request, "token_exchange_failed", detail);
    }

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const apiBase = process.env.SECONDME_API_BASE_URL ?? "https://api.mindverse.com/gate/lab";
    const userInfoRes = await fetch(`${apiBase}/api/secondme/user/info`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const userInfoJson = (await userInfoRes.json()) as {
      code: number;
      data?: { userId?: string; name?: string; route?: string };
    };
    const data = userInfoJson.code === 0 ? userInfoJson.data : undefined;
    const secondmeUserId = data?.userId ? String(data.userId) : "unknown";
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    const route = typeof data?.route === "string" ? data.route : "";
    const displayName = name || route || (data?.userId ? `用户${String(data.userId).slice(0, 8)}` : null);

    const user = await prisma.user.upsert({
      where: { secondmeUserId },
      create: {
        secondmeUserId,
        displayName: displayName || undefined,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: expiresAt,
      },
      update: {
        ...(displayName != null && { displayName }),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: expiresAt,
      },
    });

    const sessionId = await createSession(user.id);
    if (process.env.NODE_ENV === "production") {
      console.log("[auth/callback] session 已创建", { sessionId: sessionId.slice(0, 8) + "...", origin: baseUrl });
    }
    const homeUrl = new URL("/", baseUrl);
    homeUrl.searchParams.set("logged_in", "1");
    const res = NextResponse.redirect(homeUrl, 303);
    res.headers.set("Cache-Control", "private, no-store, no-cache, max-age=0");
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
    // 仅把「连不上库 / 表不存在」当成数据库问题，其它 Prisma 错误（如唯一约束、校验）不归为 db_not_ready
    const isDbConnectionOrSchemaError =
      msg.includes("P1000") ||
      msg.includes("P1001") ||
      msg.includes("P1002") ||
      msg.includes("P1017") ||
      msg.includes("no such table") ||
      msg.includes("does not exist") ||
      msg.includes("SQLite") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("connection refused") ||
      msg.includes("Tenant or user not found") ||
      /FATAL.*connection/i.test(msg);
    if (isDbConnectionOrSchemaError) {
      const hint =
        process.env.NODE_ENV === "development"
          ? `数据库连接失败: ${msg.slice(0, 60)}。请检查 .env.local 的 DATABASE_URL / DATABASE_DIRECT_URL（Supabase 需用 postgres.项目ref 作用户名），并执行: npm run db:push`
          : "数据库未就绪，请联系管理员执行 db:push";
      return redirectError(request, "db_not_ready", hint);
    }
    return redirectError(request, "callback_failed", msg.slice(0, 120));
  }
}
