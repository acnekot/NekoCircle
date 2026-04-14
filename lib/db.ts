import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "circle.db");

function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

export function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO settings VALUES ('admin_password', 'admin123');
    -- ── Generation log (tracks every circle generation) ────
    CREATE TABLE IF NOT EXISTS generation_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT NOT NULL,
      username    TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generation_log_source ON generation_log(source);
    -- ── Yahoo circle persistence ──
    CREATE TABLE IF NOT EXISTS yahoo_circles (
      id          TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      circle_data TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_yahoo_circles_username ON yahoo_circles(username);
    -- ── Announcements ──
    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'info',
      active      INTEGER NOT NULL DEFAULT 1,
      pinned      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);
  db.close();
}

export function getSetting(key: string): string {
  const db = getDb();
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? "";
  } finally {
    db.close();
  }
}

export function setSetting(key: string, value: string) {
  const db = getDb();
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  } finally {
    db.close();
  }
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  try {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } finally {
    db.close();
  }
}

// ─────────────────────────────────────────────────────────
// Generation log
// ─────────────────────────────────────────────────────────

export function logGeneration(source: string, username: string): void {
  const db = getDb();
  try {
    db.prepare("INSERT INTO generation_log (source, username, created_at) VALUES (?, ?, ?)").run(source, username, Date.now());
  } finally { db.close(); }
}

export type GenerationCounts = {
  yahoo: number;
  total: number;
};

export function getGenerationCounts(): GenerationCounts {
  const db = getDb();
  try {
    const yahoo = (db.prepare("SELECT COUNT(*) as n FROM generation_log WHERE source = 'yahoo'").get() as { n: number }).n;
    return { yahoo, total: yahoo };
  } finally { db.close(); }
}

// ─────────────────────────────────────────────────────────
// Yahoo Circles (persistent storage for Find-Yourself)
// ─────────────────────────────────────────────────────────

export type YahooCircleRow = {
  id: string;
  username: string;
  circle_data: string;    // JSON
  created_at: number;
};

export function createYahooCircle(id: string, username: string, circleData: string): void {
  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO yahoo_circles (id, username, circle_data, created_at) VALUES (?, ?, ?, ?)"
    ).run(id, username, circleData, Date.now());
  } finally { db.close(); }
}

export function getYahooCircle(id: string): YahooCircleRow | undefined {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM yahoo_circles WHERE id = ?").get(id) as YahooCircleRow | undefined;
  } finally { db.close(); }
}

export function findRecentYahooCircle(username: string, ttlMs: number): YahooCircleRow | undefined {
  const db = getDb();
  try {
    const cutoff = Date.now() - ttlMs;
    return db.prepare(
      "SELECT * FROM yahoo_circles WHERE LOWER(username) = LOWER(?) AND created_at > ? ORDER BY created_at DESC LIMIT 1"
    ).get(username, cutoff) as YahooCircleRow | undefined;
  } finally { db.close(); }
}

// ─────────────────────────────────────────────────────────
// Unified circle lookup (Yahoo only now)
// ─────────────────────────────────────────────────────────

export type UnifiedCircle = {
  source: "yahoo";
  id: string;
  username: string;
  created_at: number;
  data: string;
};

export function getCircleByAnyId(id: string): UnifiedCircle | undefined {
  const db = getDb();
  try {
    const yh = db.prepare(
      "SELECT * FROM yahoo_circles WHERE id = ?"
    ).get(id) as YahooCircleRow | undefined;
    if (yh) {
      return { source: "yahoo", id: yh.id, username: yh.username, created_at: yh.created_at, data: yh.circle_data };
    }
    return undefined;
  } finally { db.close(); }
}

// ─────────────────────────────────────────────────────────
// Announcements
// ─────────────────────────────────────────────────────────

export type AnnouncementRow = {
  id: number;
  title: string;
  content: string;
  type: string;       // 'info' | 'warning' | 'success'
  active: number;     // 0 | 1
  pinned: number;     // 0 | 1
  created_at: number;
  updated_at: number;
};

export function createAnnouncement(title: string, content: string, type = "info"): number {
  const db = getDb();
  try {
    const now = Date.now();
    const r = db.prepare(
      "INSERT INTO announcements (title, content, type, active, pinned, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)"
    ).run(title, content, type, now, now);
    return r.lastInsertRowid as number;
  } finally { db.close(); }
}

export function updateAnnouncement(id: number, data: Partial<Pick<AnnouncementRow, "title" | "content" | "type" | "active" | "pinned">>): void {
  const db = getDb();
  try {
    const updates = { ...data, updated_at: Date.now() };
    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE announcements SET ${fields} WHERE id = ?`).run(...values);
  } finally { db.close(); }
}

export function deleteAnnouncement(id: number): void {
  const db = getDb();
  try {
    db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
  } finally { db.close(); }
}

export function listAnnouncements(): AnnouncementRow[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC").all() as AnnouncementRow[];
  } finally { db.close(); }
}

export function getActiveAnnouncements(): AnnouncementRow[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM announcements WHERE active = 1 ORDER BY pinned DESC, created_at DESC").all() as AnnouncementRow[];
  } finally { db.close(); }
}
