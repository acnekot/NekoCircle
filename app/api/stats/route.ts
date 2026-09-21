import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";

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

      const generations = one<{ count: number }>("SELECT COUNT(*) count FROM generation_log").count;
      const uniqueUsers = one<{ count: number }>(
        "SELECT COUNT(DISTINCT LOWER(username)) count FROM generation_log",
      ).count;
      const today = one<{ count: number }>(
        `SELECT COUNT(*) count FROM generation_log WHERE ${localDayExpr("created_at")} = ?`,
        dayKey(0),
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

      return NextResponse.json(
        {
          generatedAt: new Date().toISOString(),
          timezone: "UTC+08:00",
          totals: { generations, uniqueUsers, today },
          daily,
          hourly,
          weekdayHour,
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
