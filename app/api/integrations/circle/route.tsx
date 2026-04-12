import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { countIntegrationApiRequestsSince, getAnalysis, getSetting, initDb, logIntegrationApiRequest } from "@/lib/db";
import { analyzeUser } from "@/lib/analyze";
import { getUserInfo } from "@/lib/twitter";
import { getAnalysisRuntimeConfig } from "@/lib/analysis-config";
import { CircleExportImage, getExportFilename, mergeExportStyle } from "@/lib/export-image";
import { getIntegrationApiToken, verifyIntegrationToken } from "@/lib/integration-auth";
import type { StyleConfig } from "@/lib/style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportPayload = {
  username?: string;
  analysisId?: string;
  topCount?: number;
  style?: Partial<StyleConfig>;
};

const DISPLAY_COUNT_PRESETS = [7, 22, 50] as const;

function parseSearchBoolean(value: string | null) {
  if (value === null) return undefined;
  return value === "1" || value.toLowerCase() === "true";
}

function parseSearchNumber(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDisplayCount(value: number | undefined) {
  if (value === undefined) return 22;
  if (DISPLAY_COUNT_PRESETS.includes(value as typeof DISPLAY_COUNT_PRESETS[number])) return value;
  if (value <= 7) return 7;
  if (value <= 22) return 22;
  return 50;
}

function getOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function getSearchStyle(searchParams: URLSearchParams): Partial<StyleConfig> {
  const styleParam = searchParams.get("style");
  let style: Partial<StyleConfig> = {};

  if (styleParam) {
    try {
      const parsed = JSON.parse(styleParam) as Partial<StyleConfig>;
      if (parsed && typeof parsed === "object") style = parsed;
    } catch {
      style = {};
    }
  }

  return {
    ...style,
    bgColor1: searchParams.get("bgColor1") ?? style.bgColor1,
    bgColor2: searchParams.get("bgColor2") ?? style.bgColor2,
    bgGradient: (searchParams.get("bgGradient") as StyleConfig["bgGradient"] | null) ?? style.bgGradient,
    accentColor: searchParams.get("accentColor") ?? style.accentColor,
    nodeScheme: (searchParams.get("nodeScheme") as StyleConfig["nodeScheme"] | null) ?? style.nodeScheme,
    nodeSize: (searchParams.get("nodeSize") as StyleConfig["nodeSize"] | null) ?? style.nodeSize,
    showAvatars: parseSearchBoolean(searchParams.get("showAvatars")) ?? style.showAvatars,
    showUsernames: parseSearchBoolean(searchParams.get("showUsernames")) ?? style.showUsernames,
    showScores: parseSearchBoolean(searchParams.get("showScores")) ?? style.showScores,
    showRankBadge: parseSearchBoolean(searchParams.get("showRankBadge")) ?? style.showRankBadge,
    glowEffect: parseSearchBoolean(searchParams.get("glowEffect")) ?? style.glowEffect,
    title: searchParams.get("title") ?? style.title,
    showTitle: parseSearchBoolean(searchParams.get("showTitle")) ?? style.showTitle,
    showWatermark: parseSearchBoolean(searchParams.get("showWatermark")) ?? style.showWatermark,
    displayCount: parseSearchNumber(searchParams.get("displayCount")) ?? style.displayCount,
    font: (searchParams.get("font") as StyleConfig["font"] | null) ?? style.font,
  };
}

async function getPayload(req: Request): Promise<ExportPayload> {
  if (req.method === "POST") {
    const body = (await req.json()) as ExportPayload;
    return body ?? {};
  }

  const { searchParams } = new URL(req.url);
  return {
    username: searchParams.get("username") ?? undefined,
    analysisId: searchParams.get("analysisId") ?? undefined,
    topCount: parseSearchNumber(searchParams.get("topCount")),
    style: getSearchStyle(searchParams),
  };
}

async function loadResultFromPayload(payload: ExportPayload) {
  const config = getAnalysisRuntimeConfig();

  if (!config.useMock && config.apiKeys.length === 0) {
    throw new Error("请先在管理后台配置 API Key");
  }

  if (payload.analysisId) {
    const analysis = getAnalysis(payload.analysisId);
    if (!analysis) {
      return NextResponse.json({ error: "analysisId 不存在" }, { status: 404 });
    }
    if (analysis.status !== "done" || !analysis.result) {
      return NextResponse.json({ error: "analysis 尚未完成" }, { status: 409 });
    }

    return {
      username: analysis.username,
      result: JSON.parse(analysis.result),
    };
  }

  const username = payload.username?.trim().replace(/^@+/, "");
  if (!username) {
    return NextResponse.json({ error: "请提供 username 或 analysisId" }, { status: 400 });
  }

  const targetUser = await getUserInfo(username, config.apiKeys[0] || "mock");
  const requestedDisplayCount = normalizeDisplayCount(payload.style?.displayCount);
  const requiredTopCount = Math.max(payload.topCount ?? config.defaultTopCount, requestedDisplayCount);
  const { result } = await analyzeUser(
    targetUser,
    config.apiKeys[0] || "mock",
    config.tweetLimit,
    requiredTopCount,
    config.weights,
    undefined,
    config.apiKeys.slice(1),
    config.useMock,
  );

  return { username: targetUser.userName, result };
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "未授权，缺少有效的 Bearer Token" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

function rateLimitedResponse(limit: number) {
  return NextResponse.json(
    { error: `API 请求过于频繁，请稍后再试（当前限制：每小时最多 ${limit} 次）` },
    { status: 429, headers: { "Retry-After": "3600" } },
  );
}

async function handleRequest(req: Request) {
  initDb();

  if (!getIntegrationApiToken()) {
    return NextResponse.json({ error: "未配置 integration_api_token / EXTERNAL_API_TOKEN" }, { status: 503 });
  }

  if (!verifyIntegrationToken(req)) {
    return unauthorizedResponse();
  }

  try {
    const payload = await getPayload(req);
    const style = mergeExportStyle(payload.style);
    const perHourLimit = Number.parseInt(
      getSetting("integration_rate_limit_per_hour") || getSetting("integration_rate_limit_per_min") || "0",
      10,
    );
    if (Number.isFinite(perHourLimit) && perHourLimit > 0) {
      const requestCount = countIntegrationApiRequestsSince(Date.now() - 60 * 60_000);
      if (requestCount >= perHourLimit) {
        return rateLimitedResponse(perHourLimit);
      }
    }

    logIntegrationApiRequest();

    const loaded = await loadResultFromPayload({ ...payload, style });
    if (loaded instanceof NextResponse) return loaded;

    const filename = getExportFilename(loaded.username);

    return new ImageResponse(
      <CircleExportImage result={loaded.result} style={style} origin={getOrigin(req)} />,
      {
        width: 1200,
        height: 1200,
        headers: {
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出图片失败" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
