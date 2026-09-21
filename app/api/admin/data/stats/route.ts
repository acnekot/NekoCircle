import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { databaseOverview } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/**
 * 聚合在 SQL 侧完成。日期分界固定为 +08:00
 * （即本工作区时区；不用 SQLite 的 'localtime'，它依赖进程 TZ，会导致
 * 不同环境下结果不一致）。
 */
const TZ_OFFSET_SEC = 8 * 3600;
const DAY_MS = 86_400_000;

function localDayExpr(col: string): string {
  return `date(${col}/1000 + ${TZ_OFFSET_SEC}, 'unixepoch')`;
}

function daysAgoKey(days: number): string {
  return new Date(Date.now() + TZ_OFFSET_SEC * 1000 - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function todayKey(): string {
  return new Date(Date.now() + TZ_OFFSET_SEC * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  initDb();
  const db = getDb();
  try {
    const nowMs = Date.now();

    const one = <T,>(sql: string, ...args: unknown[]): T =>
      db.prepare(sql).get(...args) as T;
    const all = <T,>(sql: string, ...args: unknown[]): T[] =>
      db.prepare(sql).all(...args) as T[];

    /* --- 累计 --- */
    const circles = one<{ c: number }>("SELECT COUNT(*) c FROM yahoo_circles").c;
    const longTermCircles = one<{ c: number }>(
      "SELECT COUNT(*) c FROM yahoo_circles WHERE storage_consent = 1",
    ).c;
    const temporaryCircles = circles - longTermCircles;
    const generations = one<{ c: number }>("SELECT COUNT(*) c FROM generation_log").c;
    const uniqueUsers = one<{ c: number }>(
      "SELECT COUNT(DISTINCT LOWER(username)) c FROM generation_log",
    ).c;
    const today = one<{ c: number }>(
      `SELECT COUNT(*) c FROM generation_log WHERE ${localDayExpr("created_at")} = ?`,
      todayKey(),
    ).c;
    const last24h = one<{ c: number }>(
      "SELECT COUNT(*) c FROM generation_log WHERE created_at >= ?",
      nowMs - DAY_MS,
    ).c;
    const last7d = one<{ c: number }>(
      "SELECT COUNT(*) c FROM generation_log WHERE created_at >= ?",
      nowMs - 7 * DAY_MS,
    ).c;

    /* --- 按日（近 30 天，补零） --- */
    const dailyRaw = all<{ d: string; c: number }>(
      `SELECT ${localDayExpr("created_at")} d, COUNT(*) c
       FROM generation_log
       WHERE ${localDayExpr("created_at")} >= ?
       GROUP BY d ORDER BY d`,
      daysAgoKey(29),
    );
    const dailyMap = new Map(dailyRaw.map((r) => [r.d, r.c]));
    const daily: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = daysAgoKey(i);
      daily.push({ date: key, count: dailyMap.get(key) ?? 0 });
    }

    /* --- 按时段（近 30 天） --- */
    const hourlyNum = all<{ h: number; c: number }>(
      `SELECT CAST(strftime('%H', created_at/1000 + ${TZ_OFFSET_SEC}, 'unixepoch') AS INTEGER) h,
              COUNT(*) c
       FROM generation_log WHERE created_at >= ?
       GROUP BY h`,
      nowMs - 30 * DAY_MS,
    );
    const hourlyMap = new Map(hourlyNum.map((r) => [r.h, r.c]));
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourlyMap.get(h) ?? 0,
    }));

    /* --- 星期 × 时段热力图（近 60 天） --- */
    const heatRaw = all<{ w: number; h: number; c: number }>(
      `SELECT CAST(strftime('%w', created_at/1000 + ${TZ_OFFSET_SEC}, 'unixepoch') AS INTEGER) w,
              CAST(strftime('%H', created_at/1000 + ${TZ_OFFSET_SEC}, 'unixepoch') AS INTEGER) h,
              COUNT(*) c
       FROM generation_log WHERE created_at >= ?
       GROUP BY w, h`,
      nowMs - 60 * DAY_MS,
    );
    const weekdayHour: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of heatRaw) {
      if (r.w >= 0 && r.w < 7 && r.h >= 0 && r.h < 24) weekdayHour[r.w][r.h] = r.c;
    }

    /* --- 排行用户 --- */
    const topUsers = all<{ username: string; count: number; last_at: number }>(
      `SELECT username, COUNT(*) count, MAX(created_at) last_at
       FROM generation_log
       GROUP BY LOWER(username)
       ORDER BY count DESC, last_at DESC
       LIMIT 12`,
    );

    /* --- 来源构成 --- */
    const sources = all<{ source: string; count: number }>(
      "SELECT source, COUNT(*) count FROM generation_log GROUP BY source ORDER BY count DESC",
    );

    /* --- 圈子数据体积分布 --- */
    const sizeBuckets = all<{ bucket: string; count: number }>(
      `SELECT CASE
         WHEN LENGTH(circle_data) < 10000 THEN '<10KB'
         WHEN LENGTH(circle_data) < 50000 THEN '10–50KB'
         WHEN LENGTH(circle_data) < 100000 THEN '50–100KB'
         WHEN LENGTH(circle_data) < 300000 THEN '100–300KB'
         ELSE '≥300KB' END bucket,
         COUNT(*) count
       FROM yahoo_circles GROUP BY bucket`,
    );
    const bucketOrder = ["<10KB", "10–50KB", "50–100KB", "100–300KB", "≥300KB"];
    const sizeMap = new Map(sizeBuckets.map((r) => [r.bucket, r.count]));
    const sizeDistribution = bucketOrder.map((b) => ({ bucket: b, count: sizeMap.get(b) ?? 0 }));

    /* --- 最近生成 --- */
    // 用相关子查询只取「该用户最新的一个圈子」。
    // 直接 JOIN 会在同一用户有多个圈子时把行数放大。
    const recent = all<{
      username: string;
      created_at: number;
      source: string;
      id: string | null;
      bytes: number | null;
      storage_consent: number | null;
    }>(
      `SELECT g.username, g.created_at, g.source,
              (SELECT c.id FROM yahoo_circles c WHERE LOWER(c.username) = LOWER(g.username)
                ORDER BY c.created_at DESC LIMIT 1) id,
              (SELECT LENGTH(c.circle_data) FROM yahoo_circles c WHERE LOWER(c.username) = LOWER(g.username)
                ORDER BY c.created_at DESC LIMIT 1) bytes,
              (SELECT c.storage_consent FROM yahoo_circles c WHERE LOWER(c.username) = LOWER(g.username)
                ORDER BY c.created_at DESC LIMIT 1) storage_consent
       FROM generation_log g
       ORDER BY g.created_at DESC
       LIMIT 12`,
    );

    const storage = databaseOverview();

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        timezone: "UTC+08:00",
        totals: { circles, generations, uniqueUsers, today, last24h, last7d },
        retention: { longTerm: longTermCircles, temporary: temporaryCircles },
        daily,
        hourly,
        weekdayHour,
        topUsers,
        sources,
        sizeDistribution,
        recent,
        storage,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "统计失败。" },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
