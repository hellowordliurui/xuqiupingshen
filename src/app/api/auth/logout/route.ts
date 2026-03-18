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
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
