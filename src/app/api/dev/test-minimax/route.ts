import { NextResponse } from "next/server";
import { minimaxChat, isMinimaxConfigured } from "@/lib/minimax";

/** 开发用：测试 MiniMax 配置是否生效，GET /api/dev/test-minimax */
export async function GET() {
  if (!isMinimaxConfigured()) {
    return NextResponse.json(
      { ok: false, error: "未配置 MINIMAX_API_KEY" },
      { status: 400 }
    );
  }
  try {
    const result = await minimaxChat(
      [
        { role: "system", content: "你是一个简洁的助手，用一两句话回答即可。" },
        { role: "user", content: "请用一句话介绍你自己。" },
      ],
      { temperature: 0.7, max_tokens: 200 }
    );
    return NextResponse.json({
      ok: true,
      content: result.content,
      usage: result.usage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
