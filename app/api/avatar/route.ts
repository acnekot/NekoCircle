import { NextResponse } from "next/server";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import * as https from "https";
import * as http from "http";
import { isProxyableHttpsImageUrl } from "@/lib/image-proxy-hosts";
import { YIMG_REFERERS } from "@/lib/image-proxy-upstream";

// 現在は未使用だが、既存挙動を壊さないため残す
const LEGACY_ALLOWED_PREFIXES = [
  "https://i.pravatar.cc/",
  "https://unavatar.io/",
];

// twitter / yahoo の許可ホスト判定は lib/image-proxy-hosts に一本化する。
// 以前はここに許可リストを二重管理していたため yimg が漏れ、OG 画像でだけ
// プレビュー由来のアバターが 403 になっていた。
function isYimgUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host.endsWith(".yimg.jp") || host.endsWith(".yimg.com");
  } catch {
    return false;
  }
}

const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY  ||
  process.env.http_proxy;

type FetchLike = {
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  headers: { get(k: string): string | null };
};

function makeAgent(proxyUrl: string) {
  if (proxyUrl.startsWith("socks")) return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
}

function fetchWithProxy(url: string, referer?: string): Promise<FetchLike> {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (referer) headers.Referer = referer;
  if (!PROXY_URL) return fetch(url, { headers, redirect: "follow" });
  return new Promise((resolve, reject) => {
    const agent = makeAgent(PROXY_URL);

    function doRequest(targetUrl: string, redirectsLeft: number) {
      const parsed = new URL(targetUrl);
      const mod = parsed.protocol === "https:" ? https : http;
      const req = mod.request(targetUrl, { agent, headers }, (res) => {
        // Follow redirects
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)
            && res.headers.location && redirectsLeft > 0) {
          res.resume();
          doRequest(res.headers.location, redirectsLeft - 1);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const statusCode = res.statusCode ?? 0;
          resolve({
            ok: statusCode >= 200 && statusCode < 300,
            arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
            headers: { get: (k: string) => (res.headers[k.toLowerCase()] as string) ?? null },
          });
        });
      });
      req.on("error", reject);
      req.end();
    }

    doRequest(url, 5);
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) return new NextResponse("missing url", { status: 400 });

  // Upgrade Twitter avatar resolution: _normal (48px) / _bigger (73px) → _400x400 (400px)
  const url400 = raw.replace(/_normal(\.\w+)$/, "_400x400$1").replace(/_bigger(\.\w+)$/, "_400x400$1");

  const allowed =
    LEGACY_ALLOWED_PREFIXES.some((prefix) => raw.startsWith(prefix)) ||
    isProxyableHttpsImageUrl(raw);
  if (!allowed) return new NextResponse("forbidden", { status: 403 });

  // Twitter は高解像度を先に試し、ダメなら元 URL に落とす。
  // Yahoo(yimg) は Referer が無いと弾かれることがあるので複数 Referer を順に試す。
  const candidates = url400 === raw ? [raw] : [url400, raw];
  const referers: ReadonlyArray<string | undefined> = isYimgUrl(raw)
    ? YIMG_REFERERS
    : [undefined];

  try {
    let buf: ArrayBuffer | null = null;
    let ct = "image/jpeg";

    for (const referer of referers) {
      for (const candidate of candidates) {
        const res = await fetchWithProxy(candidate, referer);
        if (!res.ok) continue;
        buf = await res.arrayBuffer();
        ct = res.headers.get("content-type") ?? "image/jpeg";
        break;
      }
      if (buf) break;
    }

    if (!buf) return new NextResponse("upstream error", { status: 502 });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new NextResponse("fetch failed: " + String(e), { status: 502 });
  }
}
