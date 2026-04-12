import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { DEFAULT_SCORING_WEIGHTS } from "./scoring";

const DB_PATH = path.join(process.cwd(), "data", "circle.db");

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
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      created_at INTEGER NOT NULL,
      tweet_count INTEGER DEFAULT 0,
      top_count INTEGER DEFAULT 30,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      progress_msg TEXT DEFAULT '',
      eta_sec INTEGER DEFAULT -1,
      slow_mode INTEGER DEFAULT 0,
      logs TEXT DEFAULT '[]',
      result TEXT
    );
    -- ── Cache tables ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cache_tweets (
      tweet_id     TEXT PRIMARY KEY,
      username     TEXT NOT NULL,
      tweet_text   TEXT NOT NULL DEFAULT '',
      reply_count  INTEGER DEFAULT 0,
      retweet_count INTEGER DEFAULT 0,
      quote_count  INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT '',
      fetched_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cache_interactions (
      tweet_id     TEXT NOT NULL,
      itype        TEXT NOT NULL,   -- 'reply' | 'retweet' | 'quote'
      user_id      TEXT NOT NULL,
      user_name    TEXT NOT NULL,
      user_display TEXT NOT NULL DEFAULT '',
      interaction_count INTEGER NOT NULL DEFAULT 1,
      mutual_count INTEGER NOT NULL DEFAULT 0,
      fetched_at   INTEGER NOT NULL,
      PRIMARY KEY (tweet_id, itype, user_id)
    );
    CREATE TABLE IF NOT EXISTS cache_fetch_log (
      tweet_id   TEXT NOT NULL,
      itype      TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (tweet_id, itype)
    );
    CREATE TABLE IF NOT EXISTS cache_mentions (
      target_user_id TEXT NOT NULL,
      user_id        TEXT NOT NULL,
      user_name      TEXT NOT NULL,
      user_display   TEXT NOT NULL DEFAULT '',
      fetched_at     INTEGER NOT NULL,
      PRIMARY KEY (target_user_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS cache_mention_log (
      target_user_id TEXT PRIMARY KEY,
      fetched_at     INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_api_request_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO settings VALUES ('api_key', '');
    INSERT OR IGNORE INTO settings VALUES ('api_keys', '');
    INSERT OR IGNORE INTO settings VALUES ('admin_password', 'admin123');
    INSERT OR IGNORE INTO settings VALUES ('top_count', '30');
    INSERT OR IGNORE INTO settings VALUES ('tweet_limit', '20');
    INSERT OR IGNORE INTO settings VALUES ('weight_reply', '5');
    INSERT OR IGNORE INTO settings VALUES ('weight_quote', '4');
    INSERT OR IGNORE INTO settings VALUES ('weight_mention', '3');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_reply_by_me', '${DEFAULT_SCORING_WEIGHTS.replyByMe}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_replied_by_him', '${DEFAULT_SCORING_WEIGHTS.repliedByHim}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_quote_by_me', '${DEFAULT_SCORING_WEIGHTS.quoteByMe}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_quoted_by_him', '${DEFAULT_SCORING_WEIGHTS.quotedByHim}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_rt_by_me', '${DEFAULT_SCORING_WEIGHTS.rtByMe}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_rted_by_him', '${DEFAULT_SCORING_WEIGHTS.rtedByHim}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_mention_by_me', '${DEFAULT_SCORING_WEIGHTS.mentionByMe}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_weight_mentioned_by_him', '${DEFAULT_SCORING_WEIGHTS.mentionedByHim}');
    INSERT OR IGNORE INTO settings VALUES ('affinity_decay_lambda', '${DEFAULT_SCORING_WEIGHTS.decayLambda}');
    INSERT OR IGNORE INTO settings VALUES ('rate_limit_ms', '5500');
    INSERT OR IGNORE INTO settings VALUES ('mock_mode', '0');
    INSERT OR IGNORE INTO settings VALUES ('cache_ttl_tweets', '60');
    INSERT OR IGNORE INTO settings VALUES ('cache_ttl_interactions', '360');
    INSERT OR IGNORE INTO settings VALUES ('cache_ttl_mentions', '120');
    INSERT OR IGNORE INTO settings VALUES ('analysis_cache_ttl', '120');
    INSERT OR IGNORE INTO settings VALUES ('manual_slow_mode', '0');
    INSERT OR IGNORE INTO settings VALUES ('manual_rate_ms', '1000');
    INSERT OR IGNORE INTO settings VALUES ('integration_api_token', '');
    INSERT OR IGNORE INTO settings VALUES ('integration_rate_limit_per_min', '0');
    INSERT OR IGNORE INTO settings VALUES (
      'integration_rate_limit_per_hour',
      COALESCE((SELECT value FROM settings WHERE key = 'integration_rate_limit_per_min'), '0')
    );
  `);
  for (const col of [
    "ALTER TABLE analyses ADD COLUMN progress INTEGER DEFAULT 0",
    "ALTER TABLE analyses ADD COLUMN progress_msg TEXT DEFAULT ''",
    "ALTER TABLE analyses ADD COLUMN eta_sec INTEGER DEFAULT -1",
    "ALTER TABLE analyses ADD COLUMN slow_mode INTEGER DEFAULT 0",
    "ALTER TABLE analyses ADD COLUMN logs TEXT DEFAULT '[]'",
    "ALTER TABLE analyses ADD COLUMN raw_data TEXT",
    "ALTER TABLE analyses ADD COLUMN should_stop INTEGER DEFAULT 0",
    "ALTER TABLE cache_interactions ADD COLUMN profile_picture TEXT DEFAULT ''",
    "ALTER TABLE cache_mentions ADD COLUMN profile_picture TEXT DEFAULT ''",
    "ALTER TABLE analyses ADD COLUMN req_count INTEGER DEFAULT 0",
    "ALTER TABLE analyses ADD COLUMN spent_credits INTEGER DEFAULT 0",
    "ALTER TABLE analyses ADD COLUMN saved_credits INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN subscription INTEGER DEFAULT 0",
    "ALTER TABLE analyses ADD COLUMN user_id INTEGER DEFAULT NULL",
    "ALTER TABLE cache_interactions ADD COLUMN interaction_count INTEGER DEFAULT 1",
    "ALTER TABLE cache_interactions ADD COLUMN mutual_count INTEGER DEFAULT 0",
  ]) {
    try { db.exec(col); } catch { /* already exists */ }
  }
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

export function countIntegrationApiRequestsSince(sinceMs: number): number {
  const db = getDb();
  try {
    return (db.prepare("SELECT COUNT(*) as n FROM integration_api_request_log WHERE created_at >= ?").get(sinceMs) as { n: number }).n;
  } finally {
    db.close();
  }
}

export function logIntegrationApiRequest(atMs = Date.now()): void {
  const db = getDb();
  try {
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO integration_api_request_log (created_at) VALUES (?)").run(atMs);
      db.prepare("DELETE FROM integration_api_request_log WHERE created_at < ?").run(atMs - 24 * 60 * 60_000);
    });
    tx();
  } finally {
    db.close();
  }
}

export type AnalysisRow = {
  id: string; username: string; display_name: string | null; avatar: string | null;
  created_at: number; tweet_count: number; top_count: number; status: string;
  progress: number; progress_msg: string; eta_sec: number; slow_mode: number;
  logs: string; result: string | null;
  raw_data: string | null;   // JSON: RawData
  should_stop: number;       // 0 | 1
  req_count: number;
  spent_credits: number;
  saved_credits: number;
  user_id: number | null;
};

export function createAnalysis(id: string, username: string, topCount: number): void {
  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO analyses (id, username, created_at, top_count, status) VALUES (?, ?, ?, ?, 'pending')"
    ).run(id, username, Date.now(), topCount);
  } finally {
    db.close();
  }
}

export function updateAnalysis(id: string, data: Partial<AnalysisRow>): void {
  const db = getDb();
  try {
    const fields = Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = [...Object.values(data), id];
    db.prepare(`UPDATE analyses SET ${fields} WHERE id = ?`).run(...values);
  } finally {
    db.close();
  }
}

export function getAnalysis(id: string): AnalysisRow | undefined {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as AnalysisRow | undefined;
  } finally {
    db.close();
  }
}

export function listAnalyses(): AnalysisRow[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM analyses ORDER BY created_at DESC LIMIT 50").all() as AnalysisRow[];
  } finally {
    db.close();
  }
}

export function deleteAnalysis(id: string): void {
  const db = getDb();
  try {
    db.prepare("DELETE FROM analyses WHERE id = ?").run(id);
  } finally {
    db.close();
  }
}

export function findRecentAnalysis(username: string, ttlMs: number): AnalysisRow | undefined {
  const db = getDb();
  try {
    const cutoff = Date.now() - ttlMs;
    return db.prepare(
      "SELECT * FROM analyses WHERE LOWER(username) = LOWER(?) AND status = 'done' AND created_at > ? ORDER BY created_at DESC LIMIT 1"
    ).get(username, cutoff) as AnalysisRow | undefined;
  } finally {
    db.close();
  }
}

// ─────────────────────────────────────────────────────────
// Cache layer
// ─────────────────────────────────────────────────────────

export type CachedTweet = {
  tweet_id: string; username: string; tweet_text: string;
  reply_count: number; retweet_count: number; quote_count: number;
  created_at: string; fetched_at: number;
};

export type CachedInteraction = {
  tweet_id: string; itype: string;
  user_id: string; user_name: string; user_display: string; profile_picture: string;
  interaction_count: number;
  mutual_count: number;
  fetched_at: number;
};

/** Upsert a batch of fetched tweets for a username */
export function cacheSaveTweets(username: string, tweets: CachedTweet[]): void {
  const db = getDb();
  try {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO cache_tweets
       (tweet_id, username, tweet_text, reply_count, retweet_count, quote_count, created_at, fetched_at)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    const tx = db.transaction((rows: CachedTweet[]) => {
      for (const r of rows) stmt.run(r.tweet_id, username, r.tweet_text, r.reply_count, r.retweet_count, r.quote_count, r.created_at, r.fetched_at);
    });
    tx(tweets);
  } finally { db.close(); }
}

/** Get cached tweets for a username, null if all stale */
export function cacheGetTweets(username: string, ttlMs: number): CachedTweet[] | null {
  const db = getDb();
  try {
    const cutoff = Date.now() - ttlMs;
    const rows = db.prepare(
      "SELECT * FROM cache_tweets WHERE username=? ORDER BY fetched_at DESC"
    ).all(username) as CachedTweet[];
    if (rows.length === 0) return null;
    if (rows[0].fetched_at < cutoff) return null; // stale
    return rows;
  } finally { db.close(); }
}

/** Save fetched interaction users for a tweet+type */
export function cacheSaveInteractions(
  tweetId: string, itype: string,
  users: {
    user_id: string;
    user_name: string;
    user_display: string;
    profile_picture?: string;
    interaction_count?: number;
    mutual_count?: number;
  }[]
): void {
  const db = getDb();
  const now = Date.now();
  try {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO cache_interactions
       (tweet_id, itype, user_id, user_name, user_display, profile_picture, interaction_count, mutual_count, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const logStmt = db.prepare(
      `INSERT OR REPLACE INTO cache_fetch_log (tweet_id, itype, fetched_at) VALUES (?,?,?)`
    );
    const tx = db.transaction(() => {
      for (const u of users) stmt.run(
        tweetId,
        itype,
        u.user_id,
        u.user_name,
        u.user_display,
        u.profile_picture ?? "",
        u.interaction_count ?? 1,
        u.mutual_count ?? 0,
        now,
      );
      logStmt.run(tweetId, itype, now);
    });
    tx();
  } finally { db.close(); }
}

/** Returns cached interaction users, or null if not cached / stale */
export function cacheGetInteractions(tweetId: string, itype: string, ttlMs: number): CachedInteraction[] | null {
  const db = getDb();
  try {
    const log = db.prepare("SELECT fetched_at FROM cache_fetch_log WHERE tweet_id=? AND itype=?").get(tweetId, itype) as { fetched_at: number } | undefined;
    if (!log) return null;
    if (log.fetched_at < Date.now() - ttlMs) return null;
    return db.prepare("SELECT * FROM cache_interactions WHERE tweet_id=? AND itype=?").all(tweetId, itype) as CachedInteraction[];
  } finally { db.close(); }
}

/** Save mention users for a target user */
export function cacheSaveMentions(targetUserId: string, users: { user_id: string; user_name: string; user_display: string; profile_picture?: string }[]): void {
  const db = getDb();
  const now = Date.now();
  try {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO cache_mentions
       (target_user_id, user_id, user_name, user_display, profile_picture, fetched_at)
       VALUES (?,?,?,?,?,?)`
    );
    const logStmt = db.prepare(`INSERT OR REPLACE INTO cache_mention_log (target_user_id, fetched_at) VALUES (?,?)`);
    const tx = db.transaction(() => {
      for (const u of users) stmt.run(targetUserId, u.user_id, u.user_name, u.user_display, u.profile_picture ?? "", now);
      logStmt.run(targetUserId, now);
    });
    tx();
  } finally { db.close(); }
}

/** Returns cached mentions, or null if stale */
export function cacheGetMentions(targetUserId: string, ttlMs: number): { user_id: string; user_name: string; user_display: string; profile_picture: string }[] | null {
  const db = getDb();
  try {
    const log = db.prepare("SELECT fetched_at FROM cache_mention_log WHERE target_user_id=?").get(targetUserId) as { fetched_at: number } | undefined;
    if (!log || log.fetched_at < Date.now() - ttlMs) return null;
    return db.prepare("SELECT user_id, user_name, user_display, profile_picture FROM cache_mentions WHERE target_user_id=?").all(targetUserId) as { user_id: string; user_name: string; user_display: string; profile_picture: string }[];
  } finally { db.close(); }
}

export type CacheStats = {
  cachedTweetSets: number;  // distinct usernames with tweet cache
  cachedInteractionSets: number;  // tweet+type combos in fetch_log
  cachedMentionSets: number;
  totalInteractionUsers: number;
  oldestFetch: number | null;   // epoch ms
  newestFetch: number | null;
};

export function getCacheStats(): CacheStats {
  const db = getDb();
  try {
    const cachedTweetSets   = (db.prepare("SELECT COUNT(DISTINCT username) as n FROM cache_tweets").get() as { n: number }).n;
    const cachedInteractionSets = (db.prepare("SELECT COUNT(*) as n FROM cache_fetch_log").get() as { n: number }).n;
    const cachedMentionSets = (db.prepare("SELECT COUNT(*) as n FROM cache_mention_log").get() as { n: number }).n;
    const totalInteractionUsers = (db.prepare("SELECT COUNT(*) as n FROM cache_interactions").get() as { n: number }).n;
    const oldest = db.prepare("SELECT MIN(fetched_at) as t FROM cache_fetch_log").get() as { t: number | null };
    const newest = db.prepare("SELECT MAX(fetched_at) as t FROM cache_fetch_log").get() as { t: number | null };
    return { cachedTweetSets, cachedInteractionSets, cachedMentionSets, totalInteractionUsers, oldestFetch: oldest.t, newestFetch: newest.t };
  } finally { db.close(); }
}

export function clearCache(): void {
  const db = getDb();
  try {
    db.exec("DELETE FROM cache_tweets; DELETE FROM cache_interactions; DELETE FROM cache_fetch_log; DELETE FROM cache_mentions; DELETE FROM cache_mention_log;");
  } finally { db.close(); }
}

/** Evict stale entries older than given ms */
export function evictStaleCache(maxAgeMs: number): number {
  const db = getDb();
  const cutoff = Date.now() - maxAgeMs;
  try {
    const { changes } = db.prepare("DELETE FROM cache_fetch_log WHERE fetched_at < ?").run(cutoff);
    db.prepare("DELETE FROM cache_interactions WHERE tweet_id NOT IN (SELECT tweet_id FROM cache_fetch_log)").run();
    db.prepare("DELETE FROM cache_tweets WHERE fetched_at < ?").run(cutoff);
    db.prepare("DELETE FROM cache_mention_log WHERE fetched_at < ?").run(cutoff);
    db.prepare("DELETE FROM cache_mentions WHERE target_user_id NOT IN (SELECT target_user_id FROM cache_mention_log)").run();
    return changes;
  } finally { db.close(); }
}

// ─────────────────────────────────────────────────────────
// Users / Auth
// ─────────────────────────────────────────────────────────

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  email: string;
  role: string;
  subscription: number;
  created_at: number;
};

export function getUserCount(): number {
  const db = getDb();
  try {
    return (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }).n;
  } finally { db.close(); }
}

export function getUserByUsername(username: string): UserRow | undefined {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  } finally { db.close(); }
}

export function getUserById(id: number): UserRow | undefined {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  } finally { db.close(); }
}

export function listUsers(): UserRow[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as UserRow[];
  } finally { db.close(); }
}

export function setUserSubscription(id: number, subscribed: boolean): void {
  const db = getDb();
  try {
    db.prepare("UPDATE users SET subscription = ? WHERE id = ?").run(subscribed ? 1 : 0, id);
  } finally { db.close(); }
}

export function createUser(username: string, passwordHash: string, email = "", role = "user"): number {
  const db = getDb();
  try {
    const r = db.prepare(
      "INSERT INTO users (username, password_hash, email, role, subscription, created_at) VALUES (?, ?, ?, ?, 0, ?)"
    ).run(username, passwordHash, email, role, Date.now());
    return r.lastInsertRowid as number;
  } finally { db.close(); }
}
