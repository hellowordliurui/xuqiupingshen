import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const NO_STORE = "private, no-store, no-cache, max-age=0";

export async function GET(request: Request) {
  const hasCookie = request.headers.get("cookie")?.includes("sid=") ?? false;
  if (process.env.NODE_ENV === "production" && !hasCookie) {
    console.log("[auth/session] 请求未携带 sid cookie");
  }
  let session;
  try {
    session = await getSession();
  } catch (e) {
    console.error("[auth/session] getSession 异常", e);
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": NO_STORE } });
  }
  if (!session) {
    if (process.env.NODE_ENV === "production" && hasCookie) {
      console.log("[auth/session] 有 cookie 但 getSession 返回 null（可能 session 过期或库中不存在）");
    }
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": NO_STORE } });
  }
  if (process.env.NODE_ENV === "production") {
    console.log("[auth/session] 已找到 session", { userId: session.id.slice(0, 8) + "..." });
  }
  return NextResponse.json(
    { user: { id: session.id, secondmeUserId: session.secondmeUserId } },
    { headers: { "Cache-Control": NO_STORE } }
  );
}
