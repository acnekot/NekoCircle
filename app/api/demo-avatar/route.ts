import { NextResponse } from "next/server";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";

const DEMO_USER = "acnekot";

function getDb() {
  const DB_PATH = path.join(process.cwd(), "data", "circle.db");
  if (!fs.existsSync(DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
}

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ url: null });

  try {
    const row = db
      .prepare(
        "SELECT circle_data FROM yahoo_circles WHERE LOWER(username) = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(DEMO_USER) as { circle_data: string } | undefined;

    db.close();

    if (!row) return NextResponse.json({ url: null });

    const data = JSON.parse(row.circle_data);
    const url: string | null =
      data.selfAvatarUrl || data.selfAvatarUrlPreview || null;

    return NextResponse.json(
      { url },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=43200, max-age=3600",
        },
      },
    );
  } catch {
    db.close();
    return NextResponse.json({ url: null });
  }
}
