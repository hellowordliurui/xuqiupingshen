import crypto from "node:crypto";

const ZHIHU_OPENAPI_BASE = "https://openapi.zhihu.com";

export type ZhihuSearchParams = {
  /** 查询关键词，必填 */
  query: string;
  /** 返回数量，可选，最大 20，默认 10 */
  count?: number;
};

/** 文档：待签名字符串 app_key:{app_key}|ts:{timestamp}|logid:{log_id}|extra_info:{extra_info} */
function buildSignString(appKey: string, timestamp: string, logId: string, extraInfo = ""): string {
  return `app_key:${appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`;
}

/** HMAC-SHA256 + Base64，密钥为 app_secret */
function sign(appSecret: string, signStr: string): string {
  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(signStr);
  return hmac.digest("base64");
}

/** 生成鉴权请求头（所有知乎 OpenAPI 请求通用） */
export function buildZhihuHeaders(appKey: string, appSecret: string): {
  "X-App-Key": string;
  "X-Timestamp": string;
  "X-Log-Id": string;
  "X-Sign": string;
  "X-Extra-Info": string;
} {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const logId = `request_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const extraInfo = "";
  const signStr = buildSignString(appKey, timestamp, logId, extraInfo);
  const signature = sign(appSecret, signStr);
  return {
    "X-App-Key": appKey,
    "X-Timestamp": timestamp,
    "X-Log-Id": logId,
    "X-Sign": signature,
    "X-Extra-Info": extraInfo,
  };
}

/** 全网可信搜 API 响应中的单条结果（按文档字段） */
export interface ZhihuSearchItem {
  title: string;
  content_type: string;
  content_id: string;
  content_text: string;
  url: string;
  comment_count?: number;
  vote_up_count?: number;
  author_name?: string;
  author_avatar?: string;
  author_badge?: string;
  author_badge_text?: string;
  edit_time?: number;
  comment_info_list?: { content: string }[];
  authority_level?: string;
}

export interface ZhihuSearchData {
  has_more: boolean;
  items: ZhihuSearchItem[];
}

export interface ZhihuSearchApiResponse {
  status: number;
  msg: string;
  data: ZhihuSearchData | null;
}

/**
 * 调用知乎「全网可信搜」接口 GET /openapi/search/global
 * 限流：单用户 1 次/秒，总调用 1000 次，超限返回 status=1, msg="rate limit exceeded"
 */
export async function zhihuSearchGlobal(
  appKey: string,
  appSecret: string,
  params: ZhihuSearchParams
): Promise<ZhihuSearchApiResponse> {
  const { query, count = 10 } = params;
  const encodedQuery = encodeURIComponent(query);
  const countClamped = Math.min(20, Math.max(1, count));
  const url = `${ZHIHU_OPENAPI_BASE}/openapi/search/global?query=${encodedQuery}&count=${countClamped}`;
  const headers = buildZhihuHeaders(appKey, appSecret);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });

  const json = (await res.json()) as ZhihuSearchApiResponse;
  if (!res.ok) {
    throw new Error(`知乎搜索 API 请求失败: ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}
