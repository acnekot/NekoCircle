import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { CircleExportImage, mergeExportStyle } from "@/lib/export-image";
import type { AnalysisResult } from "@/lib/circle-convert";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/circle-convert";
import {
  aggregateMentionAuthors,
  aggregateMentionTargets,
  fetchMentionsBothParallel,
  normalizeScreenName,
  buildYahooAuthorProfileImageMap,
  pickSelfProfileImageFromYahoo,
} from "@/lib/yahoo-realtime-fetch";
import { yahooAggregatesToCircleUsers } from "@/lib/yahoo-to-circle";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";

const OG_SIZE = 1200;

function buildYahooAnalysisResult(
  screenName: string,
  selfAvatar: string,
  circleUsers: Array<{
    screenName: string;
    displayName: string;
    avatarUrl?: string;
    avatarUrlPreview?: string;
    interactionScore: number;
    interactionCount?: number;
  }>,
  toYou: number,
  fromYou: number,
): AnalysisResult {
  return {
    targetUser: {
      id: screenName,
      userName: screenName,
      name: screenName,
      profilePicture: selfAvatar,
      followers: 0,
      isBlueVerified: false,
      isProtected: false,
    },
    topUsers: circleUsers.map((u) => {
      const count = u.interactionCount ?? u.interactionScore;
      return {
        user: {
          id: u.screenName,
          userName: u.screenName,
          name: u.displayName || u.screenName,
          profilePicture: u.avatarUrl ?? u.avatarUrlPreview ?? "",
          followers: 0,
          isBlueVerified: false,
          isProtected: false,
        },
        replies: 0,
        quotes: 0,
        retweets: 0,
        mentions: count,
        outboundScore: count / 2,
        inboundScore: count / 2,
        score: count,
      };
    }),
    tweetCount: toYou + fromYou,
    analyzedAt: new Date().toISOString(),
    weights: DEFAULT_SCORING_WEIGHTS,
  };
}

async function fetchYahooData(name: string) {
  const { mentionsToYou, mentionsFromYou } = await fetchMentionsBothParallel(name);
  const authorsToYou = aggregateMentionAuthors(mentionsToYou);
  const targetsFromYou = aggregateMentionTargets(mentionsFromYou, name);
  const yahooPeerImages = buildYahooAuthorProfileImageMap(mentionsToYou);
  const selfYahoo = pickSelfProfileImageFromYahoo(mentionsFromYou);
  const [circleUsers, selfHd] = await Promise.all([
    yahooAggregatesToCircleUsers(authorsToYou, targetsFromYou, name, yahooPeerImages),
    resolveCircleAvatarUrl(name),
  ]);
  return {
    circleUsers,
    selfAvatar: selfHd?.trim() || selfYahoo || "",
    toYou: mentionsToYou.length,
    fromYou: mentionsFromYou.length,
  };
}

function getCachedYahooData(name: string) {
  return unstable_cache(
    () => fetchYahooData(name),
    ["yahoo-og-v1", name.toLowerCase()],
    { revalidate: 300 },
  )();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = req.nextUrl.origin;

  let result: AnalysisResult | null = null;

  const screenName = sp.get("screenName");
  if (!screenName) return new Response("Missing screenName", { status: 400 });
  let name: string;
  try {
    name = normalizeScreenName(screenName);
  } catch {
    return new Response("Invalid screenName", { status: 400 });
  }
  try {
    const data = await getCachedYahooData(name);
    result = buildYahooAnalysisResult(
      name,
      data.selfAvatar,
      data.circleUsers,
      data.toYou,
      data.fromYou,
    );
  } catch {
    return new Response("Failed to fetch Yahoo data", { status: 502 });
  }

  if (!result) return new Response("No data", { status: 404 });

  const style = mergeExportStyle({
    showUsernames: false,
    showScores: false,
    showRankBadge: true,
    glowEffect: true,
    showWatermark: true,
    showTitle: false,
    displayCount: Math.min(result.topUsers.length, 22),
  });

  return new ImageResponse(
    <CircleExportImage result={result} style={style} origin={origin} />,
    {
      width: OG_SIZE,
      height: OG_SIZE,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800, max-age=300",
      },
    },
  );
}
