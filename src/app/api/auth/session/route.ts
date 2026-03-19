import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const NO_STORE = "private, no-store, no-cache, max-age=0";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": NO_STORE } });
  }
  return NextResponse.json(
    { user: { id: session.id, secondmeUserId: session.secondmeUserId } },
    { headers: { "Cache-Control": NO_STORE } }
  );
}
