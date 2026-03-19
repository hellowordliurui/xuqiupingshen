import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const NO_STORE = "private, no-store, no-cache, max-age=0";

export async function GET() {
  let session;
  try {
    session = await getSession();
  } catch (e) {
    console.error("[auth/session] getSession 异常", e);
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": NO_STORE } });
  }
  if (!session) {
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": NO_STORE } });
  }
  return NextResponse.json(
    { user: { id: session.id, secondmeUserId: session.secondmeUserId } },
    { headers: { "Cache-Control": NO_STORE } }
  );
}
