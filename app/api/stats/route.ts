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
    const totalUsers     = (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }).n;
    const activeUsers    = (db.prepare("SELECT COUNT(*) as n FROM users WHERE subscription = 1").get() as { n: number }).n;
    const totalAnalyses  = (db.prepare("SELECT COUNT(*) as n FROM analyses").get() as { n: number }).n;
    const doneAnalyses   = (db.prepare("SELECT COUNT(*) as n FROM analyses WHERE status = 'done'").get() as { n: number }).n;
    const totalRequests  = (db.prepare("SELECT COALESCE(SUM(req_count), 0) as n FROM analyses").get() as { n: number }).n;
    const totalCredits   = (db.prepare("SELECT COALESCE(SUM(spent_credits), 0) as n FROM analyses").get() as { n: number }).n;
    const savedCredits   = (db.prepare("SELECT COALESCE(SUM(saved_credits), 0) as n FROM analyses").get() as { n: number }).n;

    // Recent daily stats (last 7 days)
    const dailyRows = db.prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch', 'localtime') as day,
        COUNT(*) as analyses,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        COALESCE(SUM(req_count), 0) as requests,
        COALESCE(SUM(spent_credits), 0) as credits
      FROM analyses
      WHERE created_at > (strftime('%s','now') - 7*86400) * 1000
      GROUP BY day
      ORDER BY day ASC
    `).all() as { day: string; analyses: number; done: number; requests: number; credits: number }[];

    // Top users by generation count
    const topUsers = db.prepare(`
      SELECT u.username, COUNT(a.id) as count,
             COALESCE(SUM(a.spent_credits), 0) as credits
      FROM analyses a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.user_id IS NOT NULL
      GROUP BY a.user_id
      ORDER BY count DESC
      LIMIT 10
    `).all() as { username: string; count: number; credits: number }[];

    db.close();
    return NextResponse.json({
      totalUsers, activeUsers, totalAnalyses, doneAnalyses,
      totalRequests, totalCredits, savedCredits,
      dailyStats: dailyRows, topUsers,
    });
  } catch (e) {
    db.close();
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
