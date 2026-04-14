import { NextResponse } from "next/server";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import * as https from "https";
import * as http from "http";

const ALLOWED = [
  "https://pbs.twimg.com/",
  "https://abs.twimg.com/",
  "https://i.pravatar.cc/",
  "https://unavatar.io/",
];

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

function fetchWithProxy(url: string): Promise<FetchLike> {
  if (!PROXY_URL) return fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  return new Promise((resolve, reject) => {
    const agent = makeAgent(PROXY_URL);

    function doRequest(targetUrl: string, redirectsLeft: number) {
      const parsed = new URL(targetUrl);
      const mod = parsed.protocol === "https:" ? https : http;
      const req = mod.request(targetUrl, { agent, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
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

  const allowed = ALLOWED.some((prefix) => raw.startsWith(prefix));
  if (!allowed) return new NextResponse("forbidden", { status: 403 });

  try {
    // Try high-res first, fallback to original if unavailable
    let res = await fetchWithProxy(url400);
    if (!res.ok && url400 !== raw) res = await fetchWithProxy(raw);
    if (!res.ok) return new NextResponse("upstream error", { status: 502 });

    const buf = await res.arrayBuffer();
    const ct  = res.headers.get("content-type") ?? "image/jpeg";

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
