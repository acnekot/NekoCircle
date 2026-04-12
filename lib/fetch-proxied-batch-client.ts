import { isProxyableHttpsImageUrl } from "@/lib/image-proxy-hosts";

const SESSION_PREFIX = "nekocircle-img-b64-v1:";
const SESSION_TTL_MS = 8 * 60 * 1000;

function shortUrlKey(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

type CachedB64 = { t: number; url: string; mime: string; b64: string };

function readSessionB64(url: string): CachedB64 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + shortUrlKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedB64;
    if (parsed.url !== url) return null;
    if (Date.now() - parsed.t > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_PREFIX + shortUrlKey(url));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionB64(url: string, mime: string, b64: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const row: CachedB64 = { t: Date.now(), url, mime, b64 };
    sessionStorage.setItem(
      SESSION_PREFIX + shortUrlKey(url),
      JSON.stringify(row),
    );
  } catch {
    /* 容量超過などは無視 */
  }
}

function b64ToBlobUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
  const blob = new Blob([bytes], { type: mime || "image/jpeg" });
  return URL.createObjectURL(blob);
}

export async function fetchProxiedImagesAsBlobMap(urls: string[]): Promise<{
  map: Map<string, string>;
  revoke: () => void;
}> {
  const unique = [...new Set(urls.filter((u) => isProxyableHttpsImageUrl(u)))];
  const map = new Map<string, string>();
  const created: string[] = [];

  if (unique.length === 0) {
    return { map, revoke: () => {} };
  }

  const chunkSize = 24;
  const pending: string[] = [];

  for (const url of unique) {
    const hit = readSessionB64(url);
    if (hit) {
      try {
        const obj = b64ToBlobUrl(hit.b64, hit.mime);
        created.push(obj);
        map.set(url, obj);
      } catch {
        pending.push(url);
      }
    } else {
      pending.push(url);
    }
  }

  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const res = await fetch("/api/image-proxy/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: chunk }),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      results: Array<
        | { url: string; ok: true; mime: string; b64: string }
        | { url: string; ok: false }
      >;
    };
    for (const r of data.results) {
      if (!r.ok) continue;
      try {
        writeSessionB64(r.url, r.mime, r.b64);
        const obj = b64ToBlobUrl(r.b64, r.mime);
        created.push(obj);
        map.set(r.url, obj);
      } catch {
        /* 1 枚失敗はスキップ */
      }
    }
  }

  return {
    map,
    revoke: () => {
      for (const u of created) URL.revokeObjectURL(u);
    },
  };
}
