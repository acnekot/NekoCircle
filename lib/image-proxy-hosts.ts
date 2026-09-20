/** `/api/image-proxy` 放行的外部图片 host 判定（供 canvas 使用） */

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
