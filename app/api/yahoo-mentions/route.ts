import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";
import { fetchBingMentionsSafe } from "@/lib/bing-fetch";
import { interactionScoresToCircleUsers } from "@/lib/yahoo-to-circle";
import { resolveCircleAvatarUrl, resolveProfileData } from "@/lib/x-profile-image";
import { initDb, logGeneration, findRecentYahooCircle, createYahooCircle } from "@/lib/db";
import { getAppConfig, getSettingValue } from "@/lib/app-config";
import { fetchFxTwitterInteractionBundle } from "@/lib/providers/fxtwitter";
import { fetchYahooInteractionBundle } from "@/lib/providers/yahoo";
import { bingEntriesToInteractionEvents } from "@/lib/providers/bing";
import { mergeInteractionEvents } from "@/lib/interactions/merge";
import { normalizeUsername } from "@/lib/interactions/normalize";
import { scoreInteractions } from "@/lib/interactions/scoring";
import type { InteractionEvent } from "@/types/interaction";
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
  const totalStartedAt = Date.now();
  const fxStartedAt = Date.now();
  const yahooStartedAt = Date.now();
  const [fxSettled, yahooSettled] = await Promise.allSettled([
    fetchFxTwitterInteractionBundle(name, "fast").then((value) => ({
      value,
      elapsed: Date.now() - fxStartedAt,
    })),
    fetchYahooInteractionBundle(name, "fast").then((value) => ({
      value,
      elapsed: Date.now() - yahooStartedAt,
    })),
  ]);

  const fx = fxSettled.status === "fulfilled" ? fxSettled.value.value : null;
  const yahoo =
    yahooSettled.status === "fulfilled" ? yahooSettled.value.value : null;
  const fxFailed = !fx || fx.failures.length === 2;
  const yahooFailed = !yahoo || yahoo.failures.length === 2;

  const mergeStartedAt = Date.now();
  let mergedEvents = mergeInteractionEvents([
    fx?.events ?? [],
    yahoo?.events ?? [],
  ]);
  let mergeElapsed = Date.now() - mergeStartedAt;
  let scores = scoreInteractions(mergedEvents, name);

  const uniqueMainTweets = new Set(mergedEvents.map((event) => event.tweetId)).size;
  const needsBing = uniqueMainTweets < 100 || scores.length < 15;
  let bingEvents: InteractionEvent[] = [];
  let bingStatus: "ok" | "failed" | "skipped" = "skipped";
  let bingElapsed = 0;
  if (needsBing) {
    const bingStartedAt = Date.now();
    try {
      const bingEntries = await fetchBingMentionsSafe(name);
      bingEvents = bingEntriesToInteractionEvents(bingEntries, name);
      bingStatus = "ok";
    } catch (error) {
      bingStatus = "failed";
      console.warn("[bing] fallback failed:", error);
    }
    bingElapsed = Date.now() - bingStartedAt;
    const secondMergeStartedAt = Date.now();
    mergedEvents = mergeInteractionEvents([mergedEvents, bingEvents]);
    mergeElapsed += Date.now() - secondMergeStartedAt;
    scores = scoreInteractions(mergedEvents, name);
  }

  if (fxFailed && yahooFailed && mergedEvents.length === 0) {
    throw new Error("all interaction providers failed");
  }

  const self = normalizeUsername(name);
  const incoming = mergedEvents.filter((event) => event.target === self);
  const outgoing = mergedEvents.filter((event) => event.author === self);
  const authorsToYou: Record<string, number> = {};
  const targetsFromYou: Record<string, number> = {};
  const sourcesByScreen = new Map<string, Set<string>>();
  for (const event of mergedEvents) {
    const other = event.author === self ? event.target : event.author;
    const aggregate = event.target === self ? authorsToYou : targetsFromYou;
    aggregate[other] = (aggregate[other] ?? 0) + 1;
    const sources = sourcesByScreen.get(other) ?? new Set<string>();
    sources.add(event.source);
    for (const source of event.sources ?? []) sources.add(source);
    sourcesByScreen.set(other, sources);
  }
  const authorsSourceByScreen = Object.fromEntries(
    [...sourcesByScreen].map(([screenName, sources]) => [
      screenName,
      sources.size > 1 ? "mixed" : [...sources][0],
    ]),
  );

  const timings: Record<string, number> = {
    fxtwitter:
      fxSettled.status === "fulfilled"
        ? fxSettled.value.elapsed
        : Date.now() - fxStartedAt,
    yahoo:
      yahooSettled.status === "fulfilled"
        ? yahooSettled.value.elapsed
        : Date.now() - yahooStartedAt,
    bing: bingElapsed,
    merge: mergeElapsed,
  };

  const payload: Record<string, unknown> = {
    screenName: name,
    counts: {
      mentionsToYou: incoming.length,
      mentionsFromYou: outgoing.length,
      bingMentions: bingEvents.length,
      mergedUniqueTweets: new Set(
        mergedEvents.map((event) => event.tweetId),
      ).size,
    },
    aggregates: {
      authorsToYou,
      targetsFromYou,
      authorsSourceByScreen,
    },
    sourceStatus: {
      fxtwitter: fxFailed ? "failed" : fx?.failures.length ? "partial" : "ok",
      yahoo: yahooFailed ? "failed" : yahoo?.failures.length ? "partial" : "ok",
      bing: bingStatus,
    },
    stats: {
      providers: {
        fxtwitter: fx?.events.length ?? 0,
        yahoo: yahoo?.events.length ?? 0,
        bing: bingEvents.length,
      },
      mergedEvents: mergedEvents.length,
      uniqueUsers: scores.length,
    },
    timings,
  };

  if (buildCircle) {
    const avatarStartedAt = Date.now();
    const previewImages = {
      ...(yahoo?.peerProfileImages ?? {}),
      ...(fx?.peerProfileImages ?? {}),
    };
    const [circleUsers, selfHd, profileData] = await Promise.all([
      interactionScoresToCircleUsers(scores, previewImages, 50),
      resolveCircleAvatarUrl(name),
      resolveProfileData(name),
    ]);
    timings.avatars = Date.now() - avatarStartedAt;
    payload.circleUsers = circleUsers;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    const selfPreview = fx?.selfProfileImage ?? yahoo?.selfProfileImage;
    if (selfPreview) payload.selfAvatarUrlPreview = selfPreview;
    if (profileData) {
      payload.profileFollowers = profileData.followers;
      payload.profileFollowing = profileData.following;
      payload.profileTweets = profileData.tweets;
      payload.profileLikes = profileData.likes;
      payload.profileJoinedAt = profileData.joinedAt;
    }
  }

  timings.total = Date.now() - totalStartedAt;

  return payload;
}

function getCachedYahooPayload(name: string, buildCircle: boolean) {
  const ttl = getAppConfig().payloadCacheTtlSec;
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v3",
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
