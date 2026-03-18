/**
 * 直接加载 .env.local 并调用 MiniMax，用于验证 key 是否生效（不依赖 Next 进程）
 * 运行：node scripts/test-minimax.mjs
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 加载 .env.local（dotenv/config 只加载 .env，这里手动加载 .env.local）
let envLoaded = false;
try {
  const envPath = join(root, ".env.local");
  const envLocal = readFileSync(envPath, "utf8");
  for (const line of envLocal.split("\n")) {
    const trimmed = line.replace(/#.*$/, "").trim();
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  envLoaded = true;
} catch (e) {
  // 无 .env.local 或无法读取
}

const apiKey = process.env.MINIMAX_API_KEY || process.env.MINIMAX_KEY;
if (!apiKey) {
  const hint = !envLoaded
    ? "无法读取 .env.local（请确认文件存在）"
    : "请在 .env.local 中写一行：MINIMAX_API_KEY=你的key（注意变量名和等号前后无空格）";
  console.log(JSON.stringify({ ok: false, error: `未配置 MINIMAX_API_KEY（${hint}）` }));
  process.exit(1);
}

const baseUrl = process.env.MINIMAX_BASE_URL || "https://api.minimax.io";
const url = `${baseUrl.replace(/\/$/, "")}/v1/text/chatcompletion_v2`;

const body = {
  model: "MiniMax-M2.5",
  messages: [
    { role: "system", content: "你是一个简洁的助手，用一两句话回答即可。" },
    { role: "user", content: "请用一句话介绍你自己。" },
  ],
  stream: false,
  temperature: 0.7,
  max_tokens: 200,
};

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!res.ok) {
    console.log(JSON.stringify({ ok: false, error: `HTTP ${res.status}: ${data?.message || res.statusText}` }));
    process.exit(1);
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage;
  console.log(JSON.stringify({ ok: true, content, usage }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
}
