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
    // Yahoo circle stats
    const yahooCircleCount = (db.prepare("SELECT COUNT(*) as n FROM yahoo_circles").get() as { n: number }).n;
    const yahooUniqueUsers = (db.prepare("SELECT COUNT(DISTINCT LOWER(username)) as n FROM yahoo_circles").get() as { n: number }).n;

    // Generation log stats (Yahoo only)
    const genYahoo = (db.prepare("SELECT COUNT(*) as n FROM generation_log WHERE source = 'yahoo'").get() as { n: number }).n;

    // Recent daily stats (last 7 days) — Yahoo circles
    const yahooDailyStats = db.prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') as day,
        COUNT(*) as circles
      FROM yahoo_circles
      WHERE created_at > (strftime('%s','now') - 7*86400) * 1000
      GROUP BY day
      ORDER BY day ASC
    `).all() as { day: string; circles: number }[];

    // Recent daily stats (last 7 days) — generation_log
    const genDailyStats = db.prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') as day,
        COUNT(*) as total
      FROM generation_log
      WHERE created_at > (strftime('%s','now') - 7*86400) * 1000
      GROUP BY day
      ORDER BY day ASC
    `).all() as { day: string; total: number }[];

    // Top Yahoo users by circle count
    const topYahooUsers = db.prepare(`
      SELECT LOWER(username) as username, COUNT(*) as count
      FROM yahoo_circles
      GROUP BY LOWER(username)
      ORDER BY count DESC
      LIMIT 10
    `).all() as { username: string; count: number }[];

    db.close();
    return NextResponse.json({
      yahooCircleCount,
      yahooUniqueUsers,
      generationCounts: { yahoo: genYahoo, total: genYahoo },
      yahooDailyStats,
      genDailyStats,
      topYahooUsers,
    });
  } catch (e) {
    db.close();
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
