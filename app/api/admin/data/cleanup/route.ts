import { NextResponse } from "next/server";
import {
  cleanupTemporaryYahooCircles,
  getTemporaryCircleCleanupSummary,
  initDb,
} from "@/lib/db";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

function cleanupState() {
  const config = getAppConfig();
  const cutoff = Date.now() - config.temporaryRetentionMs;
  return {
    retentionHours: config.temporaryRetentionHours,
    autoCleanup: config.temporaryAutoCleanup,
    cutoff,
    all: getTemporaryCircleCleanupSummary(),
    expired: getTemporaryCircleCleanupSummary(cutoff),
  };
}

export async function GET() {
  try {
    initDb();
    return NextResponse.json(cleanupState(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取清理状态失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: { scope?: "expired" | "all"; confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无法读取请求内容。" }, { status: 400 });
  }

  const scope = body.scope;
  if (scope !== "expired" && scope !== "all") {
    return NextResponse.json({ error: "未知的清理范围。" }, { status: 400 });
  }
  if (scope === "all" && body.confirm !== "DELETE_TEMPORARY") {
    return NextResponse.json({ error: "缺少清理全部临时数据的确认。" }, { status: 400 });
  }

  try {
    initDb();
    const config = getAppConfig();
    const cutoff = scope === "expired"
      ? Date.now() - config.temporaryRetentionMs
      : undefined;
    const deleted = cleanupTemporaryYahooCircles(cutoff);
    return NextResponse.json(
      { ok: true, scope, deleted, state: cleanupState() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "清理失败。" },
      { status: 500 },
    );
  }
}
