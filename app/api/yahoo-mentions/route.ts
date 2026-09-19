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
import { randomBytes } from "crypto";

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

const YAHOO_PAYLOAD_REVALIDATE_SEC = 300;

type Body = {
  screenName?: string;
  buildCircle?: boolean;
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
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v2",
      name.toLowerCase(),
      buildCircle ? "circle" : "counts",
    ],
    { revalidate: YAHOO_PAYLOAD_REVALIDATE_SEC },
  )();
}

function parseBuildCircle(searchParams: URLSearchParams, body?: Body): boolean {
  if (body) return body.buildCircle === true;
  const v = searchParams.get("buildCircle");
  if (v === "0" || v === "false") return false;
  return true;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
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

  const buildCircle = parseBuildCircle(sp);

  try {
    // 2-hour cooldown: if a recent circle exists for this username, return it directly
    if (buildCircle) {
      try {
        initDb();
        const recent = findRecentYahooCircle(name, 2 * 60 * 60 * 1000);
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

  try {
    const wantCircle = body.buildCircle === true;

    // 2-hour cooldown: if a recent circle exists for this username, return it directly
    if (wantCircle) {
      try {
        initDb();
        const recent = findRecentYahooCircle(name, 2 * 60 * 60 * 1000);
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
