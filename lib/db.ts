import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "circle.db");

export function getDb() {
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
    -- NOTE: the legacy plaintext key 'admin_password' is intentionally NOT
    -- seeded anymore. It was never read by any code path (login/status/
    -- change-password all use 'admin_password_hash'), but it leaked a
    -- misleading admin123 string into every backup. This DELETE migrates
    -- existing databases restored from older snapshots.
    DELETE FROM settings WHERE key = 'admin_password';
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
      storage_consent INTEGER NOT NULL DEFAULT 0,
      consented_at INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_yahoo_circles_username ON yahoo_circles(username);
    -- ── Public feedback ──
    CREATE TABLE IF NOT EXISTS feedbacks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT NOT NULL,
      contact     TEXT NOT NULL DEFAULT '',
      locale      TEXT NOT NULL DEFAULT 'zh',
      status      TEXT NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status, created_at DESC);
    -- ── Announcements ──
    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'info',
      active      INTEGER NOT NULL DEFAULT 1,
      pinned      INTEGER NOT NULL DEFAULT 0,
      locale      TEXT NOT NULL DEFAULT 'all',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);
  // Migrate: add locale column if missing (existing databases)
  try {
    db.exec("ALTER TABLE announcements ADD COLUMN locale TEXT NOT NULL DEFAULT 'all'");
  } catch { /* column already exists */ }
  // Migrate existing circles conservatively: old rows did not have explicit
  // permission, so they remain temporary until a user opts in on a new run.
  try {
    db.exec("ALTER TABLE yahoo_circles ADD COLUMN storage_consent INTEGER NOT NULL DEFAULT 0");
  } catch { /* column already exists */ }
  try {
    db.exec("ALTER TABLE yahoo_circles ADD COLUMN consented_at INTEGER");
  } catch { /* column already exists */ }
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

export function deleteSetting(key: string) {
  const db = getDb();
  try {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
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
  storage_consent: number;
  consented_at: number | null;
  created_at: number;
};

export function createYahooCircle(
  id: string,
  username: string,
  circleData: string,
  storageConsent = false,
): void {
  const db = getDb();
  try {
    const now = Date.now();
    db.prepare(
      "INSERT INTO yahoo_circles (id, username, circle_data, storage_consent, consented_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, username, circleData, storageConsent ? 1 : 0, storageConsent ? now : null, now);
  } finally { db.close(); }
}

export type TemporaryCircleCleanupSummary = {
  count: number;
  bytes: number;
  oldestCreatedAt: number | null;
};

export function getTemporaryCircleCleanupSummary(
  olderThanMs?: number,
): TemporaryCircleCleanupSummary {
  const db = getDb();
  try {
    const where = olderThanMs === undefined
      ? "storage_consent = 0"
      : "storage_consent = 0 AND created_at < ?";
    const row = (olderThanMs === undefined
      ? db.prepare(
          `SELECT COUNT(*) count, COALESCE(SUM(LENGTH(circle_data)), 0) bytes,
                  MIN(created_at) oldestCreatedAt
           FROM yahoo_circles WHERE ${where}`,
        ).get()
      : db.prepare(
          `SELECT COUNT(*) count, COALESCE(SUM(LENGTH(circle_data)), 0) bytes,
                  MIN(created_at) oldestCreatedAt
           FROM yahoo_circles WHERE ${where}`,
        ).get(olderThanMs)) as {
          count: number;
          bytes: number;
          oldestCreatedAt: number | null;
        };
    return row;
  } finally {
    db.close();
  }
}

export function cleanupTemporaryYahooCircles(olderThanMs?: number): TemporaryCircleCleanupSummary {
  const db = getDb();
  try {
    const where = olderThanMs === undefined
      ? "storage_consent = 0"
      : "storage_consent = 0 AND created_at < ?";
    const select = db.prepare(
      `SELECT COUNT(*) count, COALESCE(SUM(LENGTH(circle_data)), 0) bytes,
              MIN(created_at) oldestCreatedAt
       FROM yahoo_circles WHERE ${where}`,
    );
    const summary = (olderThanMs === undefined
      ? select.get()
      : select.get(olderThanMs)) as TemporaryCircleCleanupSummary;
    if (summary.count > 0) {
      const remove = db.prepare(`DELETE FROM yahoo_circles WHERE ${where}`);
      if (olderThanMs === undefined) remove.run();
      else remove.run(olderThanMs);
    }
    return summary;
  } finally {
    db.close();
  }
}

let lastAutomaticCleanupAt = 0;

export function maybeCleanupTemporaryYahooCircles(
  retentionMs: number,
  nowMs = Date.now(),
): TemporaryCircleCleanupSummary | null {
  if (nowMs - lastAutomaticCleanupAt < 60 * 60 * 1000) return null;
  lastAutomaticCleanupAt = nowMs;
  return cleanupTemporaryYahooCircles(nowMs - retentionMs);
}

export function getYahooCircle(id: string): YahooCircleRow | undefined {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM yahoo_circles WHERE id = ?").get(id) as YahooCircleRow | undefined;
  } finally { db.close(); }
}

export function findRecentYahooCircle(
  username: string,
  ttlMs: number,
  storageConsent?: boolean,
): YahooCircleRow | undefined {
  const db = getDb();
  try {
    const cutoff = Date.now() - ttlMs;
    if (storageConsent !== undefined) {
      return db.prepare(
        "SELECT * FROM yahoo_circles WHERE LOWER(username) = LOWER(?) AND created_at > ? AND storage_consent = ? ORDER BY created_at DESC LIMIT 1"
      ).get(username, cutoff, storageConsent ? 1 : 0) as YahooCircleRow | undefined;
    }
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
  storage_consent: boolean;
  consented_at: number | null;
  data: string;
};

export function getCircleByAnyId(id: string): UnifiedCircle | undefined {
  const db = getDb();
  try {
    const yh = db.prepare(
      "SELECT * FROM yahoo_circles WHERE id = ?"
    ).get(id) as YahooCircleRow | undefined;
    if (yh) {
      return {
        source: "yahoo",
        id: yh.id,
        username: yh.username,
        created_at: yh.created_at,
        storage_consent: yh.storage_consent === 1,
        consented_at: yh.consented_at,
        data: yh.circle_data,
      };
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
  locale: string;     // 'all' | 'zh' | 'en' | 'ja'
  created_at: number;
  updated_at: number;
};

export function createAnnouncement(title: string, content: string, type = "info", locale = "all"): number {
  const db = getDb();
  try {
    const now = Date.now();
    const r = db.prepare(
      "INSERT INTO announcements (title, content, type, locale, active, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)"
    ).run(title, content, type, locale, now, now);
    return r.lastInsertRowid as number;
  } finally { db.close(); }
}

export function updateAnnouncement(id: number, data: Partial<Pick<AnnouncementRow, "title" | "content" | "type" | "active" | "pinned" | "locale">>): void {
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

export function getActiveAnnouncements(locale?: string): AnnouncementRow[] {
  const db = getDb();
  try {
    if (locale) {
      return db.prepare(
        "SELECT * FROM announcements WHERE active = 1 AND (locale = 'all' OR locale = ?) ORDER BY pinned DESC, created_at DESC"
      ).all(locale) as AnnouncementRow[];
    }
    return db.prepare("SELECT * FROM announcements WHERE active = 1 ORDER BY pinned DESC, created_at DESC").all() as AnnouncementRow[];
  } finally { db.close(); }
}

// ─────────────────────────────────────────────────────────
// Feedback
// ─────────────────────────────────────────────────────────

export type FeedbackRow = {
  id: number;
  content: string;
  contact: string;
  locale: string;
  status: "new" | "reviewed";
  created_at: number;
};

export function createFeedback(content: string, contact: string, locale: string): number {
  const db = getDb();
  try {
    const result = db.prepare(
      "INSERT INTO feedbacks (content, contact, locale, status, created_at) VALUES (?, ?, ?, 'new', ?)"
    ).run(content, contact, locale, Date.now());
    return Number(result.lastInsertRowid);
  } finally { db.close(); }
}

export function listFeedbacks(): FeedbackRow[] {
  const db = getDb();
  try {
    return db.prepare(
      "SELECT * FROM feedbacks ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at DESC"
    ).all() as FeedbackRow[];
  } finally { db.close(); }
}

export function updateFeedbackStatus(id: number, status: FeedbackRow["status"]): void {
  const db = getDb();
  try {
    db.prepare("UPDATE feedbacks SET status = ? WHERE id = ?").run(status, id);
  } finally { db.close(); }
}

export function deleteFeedback(id: number): void {
  const db = getDb();
  try {
    db.prepare("DELETE FROM feedbacks WHERE id = ?").run(id);
  } finally { db.close(); }
}
