import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { CircleExportImage, mergeExportStyle } from "@/lib/export-image";
import { DEFAULT_STYLE } from "@/lib/style";
import type { AnalysisResult } from "@/lib/circle-convert";
import { parseYahooCircleData } from "@/lib/circle-convert";
import { getCachedYahooPayload } from "@/lib/circle-payload";
import { findRecentYahooCircle, getYahooCircle, initDb } from "@/lib/db";
import { getAppConfig } from "@/lib/app-config";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";

export const runtime = "nodejs";

const OG_SIZE = 1200;

/**
 * 描画用データの解決。
 *
 * /zh/circle/<id>（共有リンク）… 保存済みの圈子をそのまま使う。
 *   ページが表示しているデータそのものなので、順位まで必ず一致する。
 *   保存行が壊れている場合は 404 にフォールバックさせる（502 だと
 *   一時障害に見えてしまう）。
 * /zh/yahoo/<name> … ページとまったく同じ順で解決する:
 *   ① 再利用ウィンドウ内の保存済み圈子
 *   ② ページと共有しているキャッシュ（yahoo-mentions-v3）
 *   ③ 取得に失敗したときは最後に保存された圈子
 *      （ページは stale を返せるので、ここだけ 502 にすると
 *        カードが壊れて再び不一致になる）
 */
async function resolveAnalysisResult(
  sp: URLSearchParams,
): Promise<AnalysisResult | null> {
  initDb();

  const circleId = sp.get("circleId") ?? sp.get("circle");
  if (circleId) {
    const row = getYahooCircle(circleId);
    if (!row) return null;
    try {
      return parseYahooCircleData(row.circle_data).analysisResult;
    } catch {
      return null;
    }
  }

  const raw = sp.get("screenName");
  if (!raw) return null;
  const name = normalizeScreenName(raw);

  const reused = findRecentYahooCircle(name, getAppConfig().circleReuseTtlMs);
  if (reused) return parseYahooCircleData(reused.circle_data).analysisResult;

  const payload = await getCachedYahooPayload(name, true);
  return parseYahooCircleData(JSON.stringify(payload)).analysisResult;
}

/** 取得に失敗したときの最終手段。ページの stale フォールバックと同じ発想。 */
function staleAnalysisResult(sp: URLSearchParams): AnalysisResult | null {
  try {
    const raw = sp.get("screenName");
    if (!raw) return null;
    initDb();
    const row = findRecentYahooCircle(
      normalizeScreenName(raw),
      Number.MAX_SAFE_INTEGER,
    );
    return row ? parseYahooCircleData(row.circle_data).analysisResult : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Satori（@vercel/og）は <img src> を自分のプロセスへ取りに行く。
  // 走隧道时 req.nextUrl.origin は "https://localhost:3000"（scheme 取自
  // 绑定地址）なので、ループバックの絶対 URL を自分で組み立てる。
  const origin = `http://127.0.0.1:${req.nextUrl.port || process.env.PORT || 3000}`;

  let result: AnalysisResult | null = null;
  try {
    result = await resolveAnalysisResult(sp);
  } catch {
    result = staleAnalysisResult(sp);
    if (!result) {
      return new Response("Failed to fetch Yahoo data", { status: 502 });
    }
  }

  if (!result) return new Response("No data", { status: 404 });

  const style = mergeExportStyle({
    usernameConfig: { ...DEFAULT_STYLE.usernameConfig, enabled: false },
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

