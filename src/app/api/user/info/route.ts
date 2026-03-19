import { NextResponse } from "next/server";
import { getSession, getAccessTokenForUser } from "@/lib/auth";
import { secondmeApi } from "@/lib/secondme";

/**
 * 获取用户信息 - 按 SecondMe API 参考实现
 * 文档：https://develop-docs.second.me/zh/docs/api-reference/secondme
 * GET /api/secondme/user/info，权限 scope: user.info
 * 响应 data：userId, name（用户姓名）, email, avatar, bio, selfIntroduction, profileCompleteness, route（用户主页路由）
 */
type SecondMeUserInfo = {
  userId?: string;
  name?: string;
  email?: string;
  avatar?: string;
  bio?: string;
  selfIntroduction?: string;
  profileCompleteness?: number;
  route?: string;
};

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
    const { code, data: raw } = await secondmeApi<SecondMeUserInfo>("/api/secondme/user/info", accessToken);
    if (code !== 0 || !raw || typeof raw !== "object") {
      return NextResponse.json({ code: code ?? 400, data: null }, { status: 400 });
    }
    const userId = raw.userId != null ? String(raw.userId) : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const route = typeof raw.route === "string" ? raw.route : "";
    // 文档：name=用户姓名，route=用户主页路由；无姓名时用 route 再兜底 userId
    const displayName = name || route || (userId ? `用户 ${userId.slice(0, 8)}` : "Second Me 用户");
    const data = {
      userId,
      name: displayName,
      avatar: typeof raw.avatar === "string" ? raw.avatar : undefined,
      email: typeof raw.email === "string" ? raw.email : undefined,
      bio: typeof raw.bio === "string" ? raw.bio : undefined,
    };
    return NextResponse.json({ code: 0, data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ code: 500, message: "请求 SecondMe 失败" }, { status: 500 });
  }
}
