import { NextResponse } from "next/server";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";

export const dynamic = "force-dynamic";

const UTC_8_OFFSET_SECONDS = 8 * 60 * 60;

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

    // Today's generation count, using the same UTC+08:00 day boundary as /api/stats.
    const todayCount = (db.prepare(`
      SELECT COUNT(*) as n FROM generation_log
      WHERE date(created_at / 1000 + ${UTC_8_OFFSET_SECONDS}, 'unixepoch')
        = date(strftime('%s', 'now') + ${UTC_8_OFFSET_SECONDS}, 'unixepoch')
    `).get() as { n: number }).n;

    db.close();
    return NextResponse.json({
      yahooCircleCount,
      yahooUniqueUsers,
      totalGenerations,
      todayCount,
    }, {
      headers: {
        // Keep the homepage close to the public status page instead of serving hours-old counts.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    db.close();
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
