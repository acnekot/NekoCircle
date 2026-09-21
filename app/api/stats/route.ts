import { NextResponse } from "next/server";
import fs from "fs";
import { DB_PATH, getDb, initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const TZ_OFFSET_SEC = 8 * 3600;
const DAY_MS = 86_400_000;

function localDayExpr(column: string): string {
  return `date(${column}/1000 + ${TZ_OFFSET_SEC}, 'unixepoch')`;
}

function dayKey(daysAgo: number): string {
  return new Date(Date.now() + TZ_OFFSET_SEC * 1000 - daysAgo * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export async function GET() {
  try {
    initDb();
    const db = getDb();
    try {
      const now = Date.now();
      const one = <T,>(sql: string, ...args: unknown[]): T => db.prepare(sql).get(...args) as T;
      const all = <T,>(sql: string, ...args: unknown[]): T[] => db.prepare(sql).all(...args) as T[];

      const circles = one<{ count: number }>("SELECT COUNT(*) count FROM yahoo_circles").count;
      const longTerm = one<{ count: number }>(
        "SELECT COUNT(*) count FROM yahoo_circles WHERE storage_consent = 1",
      ).count;
      const generations = one<{ count: number }>("SELECT COUNT(*) count FROM generation_log").count;
      const uniqueUsers = one<{ count: number }>(
        "SELECT COUNT(DISTINCT LOWER(username)) count FROM generation_log",
      ).count;
      const today = one<{ count: number }>(
        `SELECT COUNT(*) count FROM generation_log WHERE ${localDayExpr("created_at")} = ?`,
        dayKey(0),
      ).count;
      const last24h = one<{ count: number }>(
        "SELECT COUNT(*) count FROM generation_log WHERE created_at >= ?",
        now - DAY_MS,
      ).count;
      const last7d = one<{ count: number }>(
        "SELECT COUNT(*) count FROM generation_log WHERE created_at >= ?",
        now - 7 * DAY_MS,
      ).count;

      const dailyRows = all<{ day: string; count: number }>(
        `SELECT ${localDayExpr("created_at")} day, COUNT(*) count
         FROM generation_log WHERE ${localDayExpr("created_at")} >= ?
         GROUP BY day ORDER BY day`,
        dayKey(29),
      );
      const dailyMap = new Map(dailyRows.map((row) => [row.day, row.count]));
      const daily = Array.from({ length: 30 }, (_, index) => {
        const date = dayKey(29 - index);
        return { date, count: dailyMap.get(date) ?? 0 };
      });

      const hourlyRows = all<{ hour: number; count: number }>(
        `SELECT CAST(strftime('%H', created_at/1000 + ${TZ_OFFSET_SEC}, 'unixepoch') AS INTEGER) hour,
                COUNT(*) count
         FROM generation_log WHERE created_at >= ? GROUP BY hour`,
        now - 30 * DAY_MS,
      );
      const hourlyMap = new Map(hourlyRows.map((row) => [row.hour, row.count]));
      const hourly = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: hourlyMap.get(hour) ?? 0,
      }));

      const heatRows = all<{ weekday: number; hour: number; count: number }>(
        `SELECT CAST(strftime('%w', created_at/1000 + ${TZ_OFFSET_SEC}, 'unixepoch') AS INTEGER) weekday,
                CAST(strftime('%H', created_at/1000 + ${TZ_OFFSET_SEC}, 'unixepoch') AS INTEGER) hour,
                COUNT(*) count
         FROM generation_log WHERE created_at >= ? GROUP BY weekday, hour`,
        now - 60 * DAY_MS,
      );
      const weekdayHour = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
      for (const row of heatRows) {
        if (row.weekday >= 0 && row.weekday < 7 && row.hour >= 0 && row.hour < 24) {
          weekdayHour[row.weekday][row.hour] = row.count;
        }
      }

      const sources = all<{ source: string; count: number }>(
        "SELECT source, COUNT(*) count FROM generation_log GROUP BY source ORDER BY count DESC",
      );
      const bucketRows = all<{ bucket: string; count: number }>(
        `SELECT CASE
           WHEN LENGTH(circle_data) < 10000 THEN '<10KB'
           WHEN LENGTH(circle_data) < 50000 THEN '10–50KB'
           WHEN LENGTH(circle_data) < 100000 THEN '50–100KB'
           WHEN LENGTH(circle_data) < 300000 THEN '100–300KB'
           ELSE '≥300KB' END bucket,
           COUNT(*) count
         FROM yahoo_circles GROUP BY bucket`,
      );
      const bucketMap = new Map(bucketRows.map((row) => [row.bucket, row.count]));
      const sizeDistribution = ["<10KB", "10–50KB", "50–100KB", "100–300KB", "≥300KB"]
        .map((bucket) => ({ bucket, count: bucketMap.get(bucket) ?? 0 }));

      let databaseBytes = 0;
      try {
        databaseBytes = fs.statSync(DB_PATH).size;
      } catch {
        databaseBytes = 0;
      }

      return NextResponse.json(
        {
          generatedAt: new Date().toISOString(),
          timezone: "UTC+08:00",
          totals: { circles, generations, uniqueUsers, today, last24h, last7d },
          retention: { longTerm, temporary: circles - longTerm },
          daily,
          hourly,
          weekdayHour,
          sources,
          sizeDistribution,
          storage: { bytes: databaseBytes },
        },
        { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
      );
    } finally {
      db.close();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "统计失败。" },
      { status: 500 },
    );
  }
}
