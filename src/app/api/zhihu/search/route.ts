import { NextRequest, NextResponse } from "next/server";
import { zhihuSearchGlobal } from "@/lib/zhihu";

/**
 * 知乎「全网可信搜」代理接口
 * GET /api/zhihu/search?query=关键词&count=10
 * - query: 必填，搜索关键词
 * - count: 可选，1~20，默认 10
 * 限流：知乎侧单用户 1 次/秒、总 1000 次，超限会返回 status=1, msg="rate limit exceeded"
 */
export async function GET(request: NextRequest) {
  const appKey = process.env.ZHIHU_APP_KEY;
  const appSecret = process.env.ZHIHU_APP_SECRET;

  if (!appKey || !appSecret) {
    return NextResponse.json(
      { error: "ZHIHU_APP_KEY / ZHIHU_APP_SECRET 未配置，请在 .env.local 中配置知乎密钥" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "缺少必填参数 query（搜索关键词）" },
      { status: 400 }
    );
  }

  const countParam = searchParams.get("count");
  const count = countParam ? Math.min(20, Math.max(1, parseInt(countParam, 10) || 10)) : 10;

  try {
    const result = await zhihuSearchGlobal(appKey, appSecret, { query, count });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/zhihu/search]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "知乎搜索请求失败" },
      { status: 502 }
    );
  }
}
