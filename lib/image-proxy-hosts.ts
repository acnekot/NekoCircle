/** `/api/image-proxy` で通す外部画像ホスト判定（canvas 用） */

const BASE = new Set(["pbs.twimg.com", "abs.twimg.com"]);

export function isProxyableImageHostname(hostname: string): boolean {
  if (BASE.has(hostname)) return true;
  if (hostname.endsWith(".yimg.jp") || hostname.endsWith(".yimg.com")) {
    return true;
  }
  return false;
}

export function isProxyableHttpsImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && isProxyableImageHostname(u.hostname);
  } catch {
    return false;
  }
}
