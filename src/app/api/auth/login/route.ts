import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SECONDME } from "@/lib/secondme";

const STATE_COOKIE = "oauth_state";

function errorHtml(title: string, msg: string) {
  const safeMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:2rem;max-width:32rem;margin:0 auto;"><h1>${title}</h1><p>${safeMsg}</p><p>请在项目根目录创建 <code>.env.local</code>，并填写：</p><ul><li><code>SECONDME_CLIENT_ID</code></li><li><code>SECONDME_CLIENT_SECRET</code></li><li><code>SECONDME_REDIRECT_URI</code>（如 http://localhost:3002/api/auth/callback）</li></ul><p>在 <a href="https://develop.second.me" target="_blank" rel="noopener">Second Me 开发者控制台</a> 创建应用后可获取 Client ID 与 Secret；回调地址需与上述 REDIRECT_URI 一致。</p><p><a href="/">返回首页</a></p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET() {
  try {
    SECONDME.clientId();
    SECONDME.redirectUri();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "配置错误";
    console.error("[auth/login]", msg);
    return errorHtml("登录配置错误", msg);
  }

  try {
    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: SECONDME.clientId(),
      redirect_uri: SECONDME.redirectUri(),
      response_type: "code",
      state,
      scope: "user.info", // 必须携带 scope，SecondMe 才会展示「获取权限」授权页
    });
    const url = `${SECONDME.oauthUrl()}?${params.toString()}`;
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/login]", e);
    return errorHtml("登录出错", msg);
  }
}
