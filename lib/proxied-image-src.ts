import { isProxyableHttpsImageUrl } from "@/lib/image-proxy-hosts";

/** 供 Canvas 使用：外部 CDN 的图片改走同源代理 */
export function proxiedImageSrc(url: string): string {
  if (isProxyableHttpsImageUrl(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
