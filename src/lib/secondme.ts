/**
 * SecondMe OAuth2 / API 常量与请求封装（与官方技能仓库一致）
 * 文档：https://develop-docs.second.me/zh/docs/authentication/oauth2
 */

const getEnv = (key: string) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
};

export const SECONDME = {
  clientId: () => getEnv("SECONDME_CLIENT_ID"),
  clientSecret: () => getEnv("SECONDME_CLIENT_SECRET"),
  redirectUri: () => getEnv("SECONDME_REDIRECT_URI"),
  apiBaseUrl: () => process.env.SECONDME_API_BASE_URL ?? "https://api.mindverse.com/gate/lab",
  oauthUrl: () => process.env.SECONDME_OAUTH_URL ?? "https://go.second.me/oauth/",
  tokenEndpoint: () =>
    process.env.SECONDME_TOKEN_ENDPOINT ?? "https://api.mindverse.com/gate/lab/api/oauth/token/code",
  refreshEndpoint: () =>
    process.env.SECONDME_REFRESH_ENDPOINT ?? "https://api.mindverse.com/gate/lab/api/oauth/token/refresh",
} as const;

/** 用授权码换取 access_token / refresh_token（application/x-www-form-urlencoded） */
export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: SECONDME.clientId(),
    client_secret: SECONDME.clientSecret(),
  });
  const res = await fetch(SECONDME.tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as { code: number; data?: { accessToken: string; refreshToken: string; expiresIn: number }; message?: string };
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? "Token exchange failed");
  }
  return json.data;
}

/** 用 refresh_token 刷新 access_token */
export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: SECONDME.clientId(),
    client_secret: SECONDME.clientSecret(),
  });
  const res = await fetch(SECONDME.refreshEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as { code: number; data?: { accessToken: string; refreshToken: string; expiresIn: number }; message?: string };
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? "Refresh failed");
  }
  return json.data;
}

/** 携带 Bearer token 调用 SecondMe API，返回 code + data */
export async function secondmeApi<T>(
  path: string,
  accessToken: string,
  options?: RequestInit
): Promise<{ code: number; data: T }> {
  const url = `${SECONDME.apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
  const json = (await res.json()) as { code: number; data: T; message?: string };
  return { code: json.code, data: json.data };
}
