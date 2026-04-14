import { NextResponse } from "next/server";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";

function getDb() {
  const DB_PATH = path.join(process.cwd(), "data", "circle.db");
  if (!fs.existsSync(DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
}

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "db not ready" }, { status: 503 });

  try {
    // Total circle count
    const yahooCircleCount = (db.prepare("SELECT COUNT(*) as n FROM yahoo_circles").get() as { n: number }).n;

    // Unique users who generated circles
    const yahooUniqueUsers = (db.prepare("SELECT COUNT(DISTINCT LOWER(username)) as n FROM yahoo_circles").get() as { n: number }).n;

    // Total generation count
    const totalGenerations = (db.prepare("SELECT COUNT(*) as n FROM generation_log").get() as { n: number }).n;

    // Recent 7 days daily generation trend
    const dailyTrend = db.prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') as day,
        COUNT(*) as count
      FROM generation_log
      WHERE created_at > (strftime('%s','now') - 7*86400) * 1000
      GROUP BY day
      ORDER BY day ASC
    `).all() as { day: string; count: number }[];

    // Today's generation count
    const todayCount = (db.prepare(`
      SELECT COUNT(*) as n FROM generation_log
      WHERE date(created_at / 1000, 'unixepoch', 'localtime') = date('now', 'localtime')
    `).get() as { n: number }).n;

    db.close();
    return NextResponse.json({
      yahooCircleCount,
      yahooUniqueUsers,
      totalGenerations,
      todayCount,
      dailyTrend,
    }, {
      headers: {
        // Cache for 2 hours, stale-while-revalidate for 4 hours
        "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=14400, max-age=3600",
      },
    });
  } catch (e) {
    db.close();
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
