import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

const UTC_8_OFFSET_SECONDS = 8 * 60 * 60;

export async function GET() {
  let db: ReturnType<typeof getDb> | null = null;
  try {
    initDb();
    db = getDb();
    const config = getAppConfig();
    // Total circle count
    const yahooCircleCount = (db.prepare("SELECT COUNT(*) as n FROM yahoo_circles").get() as { n: number }).n;

    // Unique users who generated circles
    const yahooUniqueUsers = config.statsUniqueUsersOffset + (db.prepare("SELECT COUNT(DISTINCT LOWER(username)) as n FROM yahoo_circles").get() as { n: number }).n;

    // Total generation count
    const totalGenerations = config.statsGenerationOffset + (db.prepare("SELECT COUNT(*) as n FROM generation_log").get() as { n: number }).n;

    // Today's generation count, using the same UTC+08:00 day boundary as /api/stats.
    const todayCount = (db.prepare(`
      SELECT COUNT(*) as n FROM generation_log
      WHERE date(created_at / 1000 + ${UTC_8_OFFSET_SECONDS}, 'unixepoch')
        = date(strftime('%s', 'now') + ${UTC_8_OFFSET_SECONDS}, 'unixepoch')
    `).get() as { n: number }).n;

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
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    db?.close();
  }
}
