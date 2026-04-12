import { isProxyableHttpsImageUrl } from "@/lib/image-proxy-hosts";

/** Canvas 用。外部 CDN は同一オリジン経由にする */
export function proxiedImageSrc(url: string): string {
  if (isProxyableHttpsImageUrl(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
