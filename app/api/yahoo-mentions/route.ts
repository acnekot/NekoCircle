import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  aggregateMentionTargets,
  buildYahooAuthorProfileImageMap,
  fetchMentionsBothParallel,
  normalizeScreenName,
  pickSelfProfileImageFromYahoo,
} from "@/lib/yahoo-realtime-fetch";
import { fetchBingMentionsSafe } from "@/lib/bing-fetch";
import {
  aggregateMergedAuthors,
  authorAggregateToCountMap,
  authorSourceMap,
  mergeMentionTweets,
} from "@/lib/merge-mentions";
import { yahooAggregatesToCircleUsers } from "@/lib/yahoo-to-circle";
import type { CircleUser } from "@/types/circle";
import { resolveCircleAvatarUrl, resolveProfileData } from "@/lib/x-profile-image";
import { initDb, logGeneration, findRecentYahooCircle, createYahooCircle } from "@/lib/db";
import { getAppConfig, getSettingValue } from "@/lib/app-config";
import { randomBytes } from "crypto";

/**
 * 生成已关闭时返回的 503。
 * 便于在数据源被 IP 限流期间从入口处止血。
 */
function maintenanceResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "generation_disabled",
      message:
        getSettingValue("maintenance_message") ||
        "暂时停止生成新的互动圈，请稍后再试。",
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

/** 生成 8 位短 ID（a-z0-9，约 41 bit 熵） */
function generateShortId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(8);
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}


/**
 * X のスクリーンネーム規則（1〜15 文字、英数字とアンダースコア）。
 * normalizeScreenName は trim と先頭 @ の除去しかせず、検証はしない。
 * 検証しないままだと "bad name!!" のような入力でもデータソースを叩き、
 * 空の円が DB に積み上がってしまうので、ここで弾く。
 */
const SCREEN_NAME_RE = /^[A-Za-z0-9_]{1,15}$/;

type Body = {
  screenName?: string;
  buildCircle?: boolean;
  refresh?: boolean;
  force?: boolean;
};

async function buildYahooPayload(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  // Yahoo（主）と Bing（補助）を並列に走らせる。
  // Yahoo 失敗時でも Bing 結果だけで圏を組成できるよう allSettled を使う。
  const [yahooSettled, bingSettled] = await Promise.allSettled([
    fetchMentionsBothParallel(name),
    fetchBingMentionsSafe(name),
  ]);

  let yahooFailed = false;
  let mentionsToYou: Awaited<ReturnType<typeof fetchMentionsBothParallel>>["mentionsToYou"] = [];
  let mentionsFromYou: Awaited<ReturnType<typeof fetchMentionsBothParallel>>["mentionsFromYou"] = [];
  if (yahooSettled.status === "fulfilled") {
    mentionsToYou = yahooSettled.value.mentionsToYou;
    mentionsFromYou = yahooSettled.value.mentionsFromYou;
  } else {
    yahooFailed = true;
    console.warn("[yahoo] fetch failed, fallback to Bing only:", (yahooSettled.reason as Error)?.message);
  }

  const bingEntries =
    bingSettled.status === "fulfilled" ? bingSettled.value : [];

  if (yahooFailed && bingEntries.length === 0) {
    // 両方ダメなら諦める（呼び出し側の catch で 502 を返す）
    throw new Error("both yahoo and bing failed");
  }

  // tweetId 単位でマージ → 著者単位に集計（source 属性付き）
  const mergedTweets = mergeMentionTweets(mentionsToYou, bingEntries);
  const mergedAuthorsAgg = aggregateMergedAuthors(mergedTweets, name);
  const authorsToYou = authorAggregateToCountMap(mergedAuthorsAgg);
  const authorsSourceByScreen = authorSourceMap(mergedAuthorsAgg);

  const targetsFromYou = aggregateMentionTargets(mentionsFromYou, name);

  const payload: Record<string, unknown> = {
    screenName: name,
    counts: {
      mentionsToYou: mentionsToYou.length,
      mentionsFromYou: mentionsFromYou.length,
      bingMentions: bingEntries.length,
      mergedUniqueTweets: mergedTweets.length,
    },
    aggregates: {
      authorsToYou,
      targetsFromYou,
      authorsSourceByScreen,
    },
    sourceStatus: {
      yahoo: yahooFailed ? "failed" : "ok",
      bing: bingSettled.status === "fulfilled" ? "ok" : "failed",
    },
  };

  if (buildCircle) {
    const yahooPeerImages = buildYahooAuthorProfileImageMap(mentionsToYou);
    const selfYahoo = pickSelfProfileImageFromYahoo(mentionsFromYou);
    const [circleUsersRaw, selfHd, profileData] = await Promise.all([
      yahooAggregatesToCircleUsers(
        authorsToYou,
        targetsFromYou,
        name,
        yahooPeerImages,
      ),
      resolveCircleAvatarUrl(name),
      resolveProfileData(name),
    ]);
    // CircleUser に source 属性を後付け（Bing 由来は 'bing' / 両方は 'both'）
    const circleUsers: CircleUser[] = circleUsersRaw.map((u) => {
      const key = u.screenName.toLowerCase();
      const source = authorsSourceByScreen[key] ?? "yahoo";
      return { ...u, source };
    });
    payload.circleUsers = circleUsers;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    if (selfYahoo) payload.selfAvatarUrlPreview = selfYahoo;
    if (profileData) {
      payload.profileFollowers = profileData.followers;
      payload.profileFollowing = profileData.following;
      payload.profileTweets = profileData.tweets;
      payload.profileLikes = profileData.likes;
      payload.profileJoinedAt = profileData.joinedAt;
    }
  }

  return payload;
}

function getCachedYahooPayload(name: string, buildCircle: boolean) {
  const ttl = getAppConfig().payloadCacheTtlSec;
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v2",
      name.toLowerCase(),
      buildCircle ? "circle" : "counts",
    ],
    // TTL は設定から読む。値はキャッシュキーに含めないので、変更は次に
    // キャッシュが切れた時点から効く（即時反映ではない）。
    { revalidate: ttl },
  )();
}

/**
 * 強制再取得（force refresh）
 *
 * 通常の生成は 4 層のキャッシュに守られている:
 *   1. CDN / ブラウザ（Cache-Control: s-maxage=300）
 *   2. Next のデータキャッシュ（unstable_cache, 300s）
 *   3. DB の 2 時間クールダウン
 *   4. ブラウザ sessionStorage（8 分）
 * 強制再取得はそのすべてを迂回してデータソースを叩き直す。
 * ただし公開エンドポイントなので、連打でデータソースを潰さないよう
 * 「同時実行の相乗り」と「最小間隔」だけは入れておく。
 */
/**
 * 强制再抓取的最小间隔，读自后台参数设置 `force_refresh_min_interval_sec`
 * （DB > 默认 15 秒）。不直接写死常量，是为了在数据源被限流期间让运维能放宽间隔。
 */
function forceMinIntervalMs(): number {
  return getAppConfig().forceRefreshMinIntervalMs;
}
const inflightForce = new Map<string, Promise<Record<string, unknown>>>();
const lastForceAt = new Map<string, number>();

/** 同じユーザー・同じモードの同時リクエストは 1 回の fetch に相乗りさせる */
function buildFresh(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  const key = `${name.toLowerCase()}|${buildCircle ? "circle" : "counts"}`;
  const existing = inflightForce.get(key);
  if (existing) return existing;
  const p = buildYahooPayload(name, buildCircle).finally(() => {
    if (inflightForce.get(key) === p) inflightForce.delete(key);
  });
  inflightForce.set(key, p);
  return p;
}

function forceHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };
}

/**
 /**
 * 若在最小间隔内刚刚强制抓取过，则返回 DB 中最近的结果
 * throttled 付きで返す。ヒットしなければ本当に取り直す。
 */
async function forceRefreshPayload(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  const key = name.toLowerCase();
  const minInterval = forceMinIntervalMs();
  const last = lastForceAt.get(key);
  if (last !== undefined && Date.now() - last < minInterval) {
    const row = findRecentYahooCircle(name, minInterval);
    if (row) {
      const cached = JSON.parse(row.circle_data) as Record<string, unknown>;
      return {
        ...cached,
        circleId: row.id,
        createdAt: row.created_at,
        throttled: true,
      };
    }
  }
  const payload = await buildFresh(name, buildCircle);
  lastForceAt.set(key, Date.now());
  return payload;
}

/** 強制再取得の本体。GET / POST どちらからも呼ばれる。 */
async function handleForce(
  name: string,
  buildCircle: boolean,
): Promise<NextResponse> {
  try {
    const payload = await forceRefreshPayload(name, buildCircle);
    if (payload.throttled === true) {
      return NextResponse.json(
        { ...payload, refreshed: true },
        { headers: forceHeaders() },
      );
    }
    const body: Record<string, unknown> = { ...payload, refreshed: true };
    if (buildCircle) {
      try {
        initDb();
        const circleId = generateShortId();
        const createdAt = Date.now();
        createYahooCircle(circleId, name, JSON.stringify(payload));
        logGeneration("yahoo", name);
        body.circleId = circleId;
        body.createdAt = createdAt;
      } catch { /* non-critical */ }
    }
    return NextResponse.json(body, { headers: forceHeaders() });
  } catch (e) {
    console.error("[yahoo-mentions:force] failed:", e);
    const stale = staleFallback(name);
    if (stale) {
      for (const [k, v] of Object.entries(forceHeaders())) stale.headers.set(k, v);
      return stale;
    }
    return NextResponse.json(
      { error: "数据获取失败，请稍后重试。" },
      { status: 502, headers: forceHeaders() },
    );
  }
}

/**
 * 数据源不可用（被限流/拦截）时的兜底：返回该用户最近一次成功生成的结果，
 * 不限时效，并带上 stale 标记。总比直接报错好。
 */
function staleFallback(name: string): NextResponse | null {
  try {
    initDb();
    const row = findRecentYahooCircle(name, Number.MAX_SAFE_INTEGER);
    if (!row) return null;
    const cached = JSON.parse(row.circle_data);
    return NextResponse.json(
      { ...cached, circleId: row.id, createdAt: row.created_at, stale: true },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
        },
      },
    );
  } catch {
    return null;
  }
}

function parseBuildCircle(searchParams: URLSearchParams, body?: Body): boolean {
  if (body) return body.buildCircle === true;
  const v = searchParams.get("buildCircle");
  if (v === "0" || v === "false") return false;
  return true;
}

/**
 * 強制再取得の指定。`?refresh=1` を基本形として、
 * `?ref=1` / `?force=1` / POST の { refresh: true } も受け付ける。
 */
function parseForce(searchParams: URLSearchParams, body?: Body): boolean {
  if (body && (body.refresh === true || body.force === true)) return true;
  const on = (v: string | null) => v === "1" || v === "true";
  return on(searchParams.get("refresh")) || on(searchParams.get("ref")) || on(searchParams.get("force"));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (!getAppConfig().generationEnabled) return maintenanceResponse();

  const raw = sp.get("screenName") ?? "";
  let name: string;
  try {
    name = normalizeScreenName(raw);
  } catch {
    return NextResponse.json(
      { error: "用户名格式不正确。" },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "请输入用户名（例如：acnekot）。" },
      { status: 400 },
    );
  }

  if (!SCREEN_NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "用户名格式不正确。" },
      { status: 400 },
    );
  }

  const buildCircle = parseBuildCircle(sp);

  // 強制再取得はクールダウンもデータキャッシュも迂回する
  if (parseForce(sp)) {
    return handleForce(name, buildCircle);
  }

  try {
    // 复用窗口：若存在近期圈子则直接返回，不再请求数据源。
    // 窗口长度由后台参数设置 `circle_reuse_ttl_min` 决定。
    if (buildCircle) {
      try {
        initDb();
        const recent = findRecentYahooCircle(name, getAppConfig().circleReuseTtlMs);
        if (recent) {
          const cached = JSON.parse(recent.circle_data);
          return NextResponse.json({ ...cached, circleId: recent.id, createdAt: recent.created_at }, {
            headers: {
              "Cache-Control":
                "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
            },
          });
        }
      } catch { /* DB check non-critical, fall through to fetch */ }
    }

    const payload = await getCachedYahooPayload(name, buildCircle);
    // Persist + log generation when building a circle
    if (buildCircle) {
      try {
        initDb();
        const circleId = generateShortId();
        const createdAt = Date.now();
        createYahooCircle(circleId, name, JSON.stringify(payload));
        logGeneration("yahoo", name);
        return NextResponse.json({ ...payload, circleId, createdAt }, {
          headers: {
            "Cache-Control":
              "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
          },
        });
      } catch { /* non-critical */ }
    }
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
      },
    });
  } catch (e) {
    console.error("[yahoo-mentions:GET] failed:", e);
    const stale = staleFallback(name);
    if (stale) return stale;
    return NextResponse.json(
      { error: "数据获取失败，请稍后重试。" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "无法读取请求内容。" }, { status: 400 });
  }

  const raw = body.screenName ?? "";
  let name: string;
  try {
    name = normalizeScreenName(raw);
  } catch {
    return NextResponse.json(
      { error: "用户名格式不正确。" },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "请输入用户名（例如：acnekot）。" },
      { status: 400 },
    );
  }

  if (!SCREEN_NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "用户名格式不正确。" },
      { status: 400 },
    );
  }

  if (!getAppConfig().generationEnabled) return maintenanceResponse();

  try {
    const wantCircle = body.buildCircle === true;

    if (parseForce(new URLSearchParams(), body)) {
      return handleForce(name, wantCircle);
    }

    // 复用窗口：若存在近期圈子则直接返回，不再请求数据源。
    // 窗口长度由后台参数设置 `circle_reuse_ttl_min` 决定。
    if (wantCircle) {
      try {
        initDb();
        const recent = findRecentYahooCircle(name, getAppConfig().circleReuseTtlMs);
        if (recent) {
          const cached = JSON.parse(recent.circle_data);
          return NextResponse.json({ ...cached, circleId: recent.id, createdAt: recent.created_at });
        }
      } catch { /* DB check non-critical, fall through to fetch */ }
    }

    const payload = await getCachedYahooPayload(name, wantCircle);
    // Persist + log generation when building a circle
    if (wantCircle) {
      try {
        initDb();
        const circleId = generateShortId();
        const createdAt = Date.now();
        createYahooCircle(circleId, name, JSON.stringify(payload));
        logGeneration("yahoo", name);
        return NextResponse.json({ ...payload, circleId, createdAt });
      } catch { /* non-critical */ }
    }
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[yahoo-mentions:POST] failed:", e);
    return NextResponse.json(
      { error: "数据获取失败，请稍后重试。" },
      { status: 502 },
    );
  }
}
