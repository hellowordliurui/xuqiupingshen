import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { refreshAccessToken } from "./secondme";

const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  secondmeUserId: string;
  name?: string;
  avatar?: string;
}

/** 从 cookie 读取 session，并返回当前用户；若 token 快过期则先刷新 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: sid } }).catch(() => {});
    return null;
  }

  const user = session.user;
  const now = Date.now();
  const expiresAt = user.tokenExpiresAt.getTime();
  if (expiresAt - now < 5 * 60 * 1000) {
    try {
      const data = await refreshAccessToken(user.refreshToken);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: new Date(now + data.expiresIn * 1000),
        },
      });
      user.accessToken = data.accessToken;
      user.refreshToken = data.refreshToken;
      user.tokenExpiresAt = new Date(now + data.expiresIn * 1000);
    } catch {
      return null;
    }
  }

  return {
    id: user.id,
    secondmeUserId: user.secondmeUserId,
  };
}

/** 获取当前用户的 accessToken（用于调用 SecondMe API），需在 getSession 之后确保 token 已刷新 */
export async function getAccessTokenForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.accessToken ?? null;
}

/** 创建 session 并设置 cookie（在 callback 里调用） */
export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  const session = await prisma.session.create({
    data: { userId, expiresAt },
  });
  return session.id;
}

/** 删除 session 并清除 cookie（登出） */
export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}
