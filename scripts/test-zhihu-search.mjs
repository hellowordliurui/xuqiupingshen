/**
 * 加载 .env.local 并请求知乎「全网可信搜」，验证 ZHIHU_APP_KEY / ZHIHU_APP_SECRET 是否生效
 * 运行：node scripts/test-zhihu-search.mjs [关键词]
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  try {
    const envPath = join(root, ".env.local");
    const envLocal = readFileSync(envPath, "utf8");
    for (const line of envLocal.split("\n")) {
      const trimmed = line.replace(/#.*$/, "").trim();
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return true;
  } catch {
    return false;
  }
}

loadEnvLocal();

const appKey = process.env.ZHIHU_APP_KEY;
const appSecret = process.env.ZHIHU_APP_SECRET;

if (!appKey || !appSecret) {
  console.log(
    JSON.stringify({
      ok: false,
      error: "未配置 ZHIHU_APP_KEY 或 ZHIHU_APP_SECRET，请在 .env.local 中填写",
    })
  );
  process.exit(1);
}

const query = process.argv[2] || "知乎";
const timestamp = String(Math.floor(Date.now() / 1000));
const logId = `request_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const extraInfo = "";
const signStr = `app_key:${appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`;
const sign = createHmac("sha256", appSecret).update(signStr).digest("base64");

const url = `https://openapi.zhihu.com/openapi/search/global?query=${encodeURIComponent(query)}&count=3`;

try {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-App-Key": appKey,
      "X-Timestamp": timestamp,
      "X-Log-Id": logId,
      "X-Sign": sign,
      "X-Extra-Info": extraInfo,
    },
  });
  const data = await res.json();

  if (!res.ok) {
    console.log(
      JSON.stringify({
        ok: false,
        error: `HTTP ${res.status}`,
        body: data,
      })
    );
    process.exit(1);
  }

  if (data.status !== 0) {
    console.log(
      JSON.stringify({
        ok: false,
        error: data.msg || "知乎接口返回错误",
        status: data.status,
      })
    );
    process.exit(1);
  }

  const items = data.data?.items ?? [];
  console.log(
    JSON.stringify(
      {
        ok: true,
        query,
        total: items.length,
        items: items.map((i) => ({
          title: i.title,
          content_type: i.content_type,
          url: i.url,
        })),
      },
      null,
      2
    )
  );
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
}
