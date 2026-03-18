/**
 * MiniMax 文本生成 API 封装
 * 用于 A2A 辩论、刘看山总结等 LLM 能力（Second Me 仅提供 Agent 对话，总结/生成需自建）
 * 文档：https://platform.minimax.io/docs/api-reference/text-post
 * 鉴权：Bearer API Key，在 账户管理 > 接口密钥 创建
 */

const DEFAULT_BASE_URL = "https://api.minimax.io";
const DEFAULT_MODEL = "MiniMax-M2.5";

export interface MinimaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface MinimaxChatOptions {
  /** 模型，默认 MiniMax-M2.5 */
  model?: string;
  /** 采样温度 (0, 1]，默认 0.7 */
  temperature?: number;
  /** 最大生成 token 数 */
  max_tokens?: number;
  /** 是否流式，默认 false */
  stream?: boolean;
}

export interface MinimaxChatResult {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  finish_reason?: string;
}

function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("Missing env: MINIMAX_API_KEY，请在 .env.local 中配置 MiniMax 接口密钥");
  return key;
}

/**
 * 调用 MiniMax 文本对话接口（非流式）
 * 用于：辩论回合生成、刘看山总结等
 */
export async function minimaxChat(
  messages: MinimaxMessage[],
  options: MinimaxChatOptions = {}
): Promise<MinimaxChatResult> {
  const apiKey = getApiKey();
  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL;
  const url = `${baseUrl.replace(/\/$/, "")}/v1/text/chatcompletion_v2`;

  const body = {
    model: options.model ?? DEFAULT_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content, ...(m.name && { name: m.name }) })),
    stream: options.stream ?? false,
    ...(options.temperature != null && { temperature: options.temperature }),
    ...(options.max_tokens != null && { max_tokens: options.max_tokens }),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string; role?: string };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    base_resp?: { status_code?: number; status_msg?: string };
  };

  if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code != null) {
    throw new Error(`MiniMax 业务错误: ${data.base_resp.status_msg ?? "unknown"}`);
  }

  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";

  return {
    content,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
          total_tokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
    finish_reason: choice?.finish_reason,
  };
}

/**
 * 判断是否已配置 MiniMax（可用于功能开关）
 */
export function isMinimaxConfigured(): boolean {
  return !!process.env.MINIMAX_API_KEY;
}
