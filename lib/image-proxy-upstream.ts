import { isProxyableImageHostname } from "@/lib/image-proxy-hosts";

const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://x.com/",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
};

const YIMG_REFERERS = [
  "https://search.yahoo.co.jp/realtime/search",
  "https://search.yahoo.co.jp/realtime/",
  "https://search.yahoo.co.jp/",
  "https://www.yahoo.co.jp/",
] as const;

export class UpstreamImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamImageError";
  }
}

function isYimgHost(hostname: string): boolean {
  return hostname.endsWith(".yimg.jp") || hostname.endsWith(".yimg.com");
}

async function fetchYimgImage(url: string): Promise<Response> {
  const ua = UPSTREAM_HEADERS["User-Agent"]!;
  let last: Response | null = null;
  for (const referer of YIMG_REFERERS) {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        "User-Agent": ua,
        Referer: referer,
      },
    });
    if (res.ok) return res;
    last = res;
  }
  return last!;
}

export async function fetchProxiedImageUpstream(rawUrl: string): Promise<{
  arrayBuffer: ArrayBuffer;
  contentType: string;
}> {
  let target: URL;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    throw new Error("invalid url");
  }
  if (target.protocol !== "https:" || !isProxyableImageHostname(target.hostname)) {
    throw new Error("forbidden host");
  }

  const res = isYimgHost(target.hostname)
    ? await fetchYimgImage(target.toString())
    : await fetch(target.toString(), {
        redirect: "follow",
        headers: UPSTREAM_HEADERS,
      });

  if (!res.ok) {
    throw new UpstreamImageError(`upstream ${res.status}`, res.status);
  }

  const arrayBuffer = await res.arrayBuffer();
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  return {
    arrayBuffer,
    contentType: ct.startsWith("image/") ? ct : "image/jpeg",
  };
}
