import { NextResponse } from "next/server";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { secondmeApi } from "@/lib/secondme";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });
  }
  const accessToken = await getAccessTokenForUser(session.id);
  if (!accessToken) {
    return NextResponse.json({ code: 401, message: "无效会话" }, { status: 401 });
  }
  try {
    const { code, data } = await secondmeApi<{
      userId: string;
      name?: string;
      email?: string;
      avatar?: string;
      bio?: string;
      selfIntroduction?: string;
      profileCompleteness?: number;
      route?: string;
    }>("/api/secondme/user/info", accessToken);
    if (code !== 0) {
      return NextResponse.json({ code, data: null }, { status: 400 });
    }
    return NextResponse.json({ code: 0, data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ code: 500, message: "请求 SecondMe 失败" }, { status: 500 });
  }
}
