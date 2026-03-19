import { NextRequest } from "next/server";

/**
 * 获取当前请求的「规范 origin」。
 * 生产环境（如 Vercel）在代理后 request.url 有时与真实访问协议/主机不一致，
 * 用 x-forwarded-proto / x-forwarded-host 拼出 HTTPS origin，避免回调重定向到 http
 * 或域名不一致导致 Set-Cookie 不生效、登录后 cookie 不随请求发送。
 */
export function getCanonicalOrigin(request: NextRequest): string {
  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin;
  }
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) {
    const scheme = proto === "https" ? "https" : "http";
    return `${scheme}://${host}`;
  }
  return new URL(request.url).origin;
}
