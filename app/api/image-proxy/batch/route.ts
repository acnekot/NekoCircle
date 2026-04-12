import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchProxiedImageUpstream } from "@/lib/image-proxy-upstream";

const MAX_URLS = 24;
const BATCH_REVALIDATE_SEC = 300;

type BatchResult =
  | { url: string; ok: true; mime: string; b64: string }
  | { url: string; ok: false };

async function fetchResultsMap(urls: string[]): Promise<Record<string, BatchResult>> {
  const out: Record<string, BatchResult> = {};
  await Promise.all(
    urls.map(async (url) => {
      try {
        const { arrayBuffer, contentType } = await fetchProxiedImageUpstream(url);
        const b64 = Buffer.from(arrayBuffer).toString("base64");
        out[url] = { url, ok: true, mime: contentType, b64 };
      } catch {
        out[url] = { url, ok: false };
      }
    }),
  );
  return out;
}

export async function POST(req: Request) {
  let body: { urls?: unknown };
  try {
    body = (await req.json()) as { urls?: unknown };
  } catch {
    return NextResponse.json({ error: "需要 JSON 格式请求体。" }, { status: 400 });
  }

  const list = Array.isArray(body.urls) ? body.urls : [];
  const urls = [...new Set(
    list
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter(Boolean),
  )].slice(0, MAX_URLS);

  if (urls.length === 0) {
    return NextResponse.json({ results: [] as BatchResult[] });
  }

  const cacheKey = [...urls].sort().join("\n");

  const map = await unstable_cache(
    () => fetchResultsMap([...urls].sort()),
    ["image-proxy-batch", cacheKey],
    { revalidate: BATCH_REVALIDATE_SEC },
  )();

  const results: BatchResult[] = urls.map(
    (url) => map[url] ?? { url, ok: false },
  );

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=120, stale-while-revalidate=86400, max-age=0",
      },
    },
  );
}
