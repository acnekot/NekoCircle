import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { verifyToken, USER_COOKIE_NAME } from "@/lib/auth";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";

function getRawDb() {
  const DB_PATH = path.join(process.cwd(), "data", "circle.db");
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

type HistoryRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  tweet_count: number;
  top_count: number;
  created_at: number;
  logs: string;
  result: string | null;
};

export async function GET(req: NextRequest) {
  const token = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const userId = parseInt(payload.sub as string);
  // Check subscription from DB directly so admin changes take effect immediately
  const dbUser = getRawDb().prepare("SELECT subscription FROM users WHERE id = ?").get(userId) as { subscription: number } | undefined;
  const subRequired = getRawDb().prepare("SELECT value FROM settings WHERE key = 'subscription_required'").get() as { value: string } | undefined;
  const isRequired = !subRequired || subRequired.value !== "0";
  if (isRequired && (!dbUser || dbUser.subscription !== 1)) {
    return NextResponse.json({ error: "需要订阅", subscribed: false }, { status: 403 });
  }
  const db = getRawDb();
  try {
    const rows = db.prepare(
      `SELECT id, username, display_name, avatar, status, tweet_count, top_count, created_at, logs, result
       FROM analyses WHERE user_id = ? ORDER BY created_at DESC`
    ).all(userId) as HistoryRow[];
    return NextResponse.json(rows);
  } finally {
    db.close();
  }
}
