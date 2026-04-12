import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  aggregateMentionAuthors,
  aggregateMentionTargets,
  buildYahooAuthorProfileImageMap,
  fetchMentionsBothParallel,
  normalizeScreenName,
  pickSelfProfileImageFromYahoo,
} from "@/lib/yahoo-realtime-fetch";
import { yahooAggregatesToCircleUsers } from "@/lib/yahoo-to-circle";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";
import { initDb, logGeneration } from "@/lib/db";

const YAHOO_PAYLOAD_REVALIDATE_SEC = 300;

type Body = {
  screenName?: string;
  buildCircle?: boolean;
};

async function buildYahooPayload(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  const { mentionsToYou, mentionsFromYou } = await fetchMentionsBothParallel(name);

  const authorsToYou = aggregateMentionAuthors(mentionsToYou);
  const targetsFromYou = aggregateMentionTargets(mentionsFromYou, name);

  const payload: Record<string, unknown> = {
    screenName: name,
    counts: {
      mentionsToYou: mentionsToYou.length,
      mentionsFromYou: mentionsFromYou.length,
    },
    aggregates: {
      authorsToYou,
      targetsFromYou,
    },
  };

  if (buildCircle) {
    const yahooPeerImages = buildYahooAuthorProfileImageMap(mentionsToYou);
    const selfYahoo = pickSelfProfileImageFromYahoo(mentionsFromYou);
    const [circleUsers, selfHd] = await Promise.all([
      yahooAggregatesToCircleUsers(
        authorsToYou,
        targetsFromYou,
        name,
        yahooPeerImages,
      ),
      resolveCircleAvatarUrl(name),
    ]);
    payload.circleUsers = circleUsers;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    if (selfYahoo) payload.selfAvatarUrlPreview = selfYahoo;
  }

  return payload;
}

function getCachedYahooPayload(name: string, buildCircle: boolean) {
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v1",
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
    const payload = await getCachedYahooPayload(name, buildCircle);
    // Log generation when building a circle
    if (buildCircle) {
      try { initDb(); logGeneration("yahoo", name); } catch { /* non-critical */ }
    }
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
      },
    });
  } catch {
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
    const payload = await getCachedYahooPayload(name, body.buildCircle === true);
    // Log generation when building a circle
    if (body.buildCircle === true) {
      try { initDb(); logGeneration("yahoo", name); } catch { /* non-critical */ }
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "数据获取失败，请稍后重试。" },
      { status: 502 },
    );
  }
}
