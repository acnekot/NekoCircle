/**
 * 备份的导出 / 导入。
 *
 * 设计原则：
 * - 表与列通过 allowlist + PRAGMA 动态解析，不给调用方注入任意表名/列名的余地。
 * - `replace` 属破坏性操作，一律「先快照 → 再在单个事务内应用」。
 * - 默认排除认证信息，避免还原时把密码一起回滚造成意外。
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "node:crypto";
import { DB_PATH, getDb } from "./db";
import { CREDENTIAL_KEY_RE, getSettingDef } from "./app-config";

export type TableName = "settings" | "announcements" | "generation_log" | "yahoo_circles" | "feedbacks";

export type TableMeta = {
  name: TableName;
  label: string;
  description: string;
  /** 冲突时优先保留已有行的主键 */
  primaryKey: string[];
};

/** 导出/导入涉及的表（按此顺序处理） */
export const TABLE_META: TableMeta[] = [
  {
    name: "settings",
    label: "设置",
    description: "后台的参数设置。是否包含认证信息由单独的开关决定。",
    primaryKey: ["key"],
  },
  {
    name: "announcements",
    label: "公告",
    description: "首页展示的公告。",
    primaryKey: ["id"],
  },
  {
    name: "generation_log",
    label: "生成日志",
    description: "每次生成记录一行（统计数据来源）。",
    primaryKey: ["id"],
  },
  {
    name: "yahoo_circles",
    label: "圈子数据",
    description: "已生成圈子的本体，体积最大（单条约数 KB 至数百 KB）。",
    primaryKey: ["id"],
  },
  {
    name: "feedbacks",
    label: "用户反馈",
    description: "生成页提交的反馈及可选联系方式。",
    primaryKey: ["id"],
  },
];

const TABLE_BY_NAME = new Map(TABLE_META.map((t) => [t.name, t]));

export const SCHEMA_VERSION = 3;

export type ExportBundle = {
  app: "nekocircle";
  schemaVersion: number;
  exportedAt: string;
  options: {
    credentials: boolean;
    tables: TableName[];
  };
  counts: Record<string, number>;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
};

export type ExportOptions = {
  tables?: TableName[];
  includeCredentials?: boolean;
};

function columnsOf(db: ReturnType<typeof getDb>, table: TableName): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

function parseTableList(input: unknown): TableName[] {
  if (!Array.isArray(input)) return TABLE_META.map((t) => t.name);
  const out: TableName[] = [];
  for (const raw of input) {
    const name = String(raw) as TableName;
    if (TABLE_BY_NAME.has(name) && !out.includes(name)) out.push(name);
  }
  return out.length ? out : TABLE_META.map((t) => t.name);
}

/* ------------------------------------------------------------------ */
/* 导出                                                               */
/* ------------------------------------------------------------------ */

export function buildExportBundle(options: ExportOptions = {}): ExportBundle {
  const tables = parseTableList(options.tables);
  const includeCredentials = options.includeCredentials === true;
  const db = getDb();
  try {
    const bundle: ExportBundle = {
      app: "nekocircle",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      options: { credentials: includeCredentials, tables },
      counts: {},
      tables: {},
    };

    for (const name of tables) {
      let rows = db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[];
      if (name === "settings") {
        rows = rows.filter((r) => {
          const k = String(r.key ?? "");
          if (!CREDENTIAL_KEY_RE.test(k)) return true;
          // 认证信息需显式勾选，且只带哈希（明文种子值不外带）
          return includeCredentials && k.endsWith("_hash");
        });
      }
      bundle.tables[name] = rows;
      bundle.counts[name] = rows.length;
    }
    return bundle;
  } finally {
    db.close();
  }
}

export function exportFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(
    now.getHours(),
  )}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `nekocircle-backup-${stamp}.json`;
}

/* ------------------------------------------------------------------ */
/* 导入                                                               */
/* ------------------------------------------------------------------ */

export type ImportMode = "merge" | "replace";

export type TableReport = {
  table: TableName;
  label: string;
  received: number;
  inserted: number;
  skipped: number;
  /** 导入时被丢弃行的原因（仅前几条） */
  notes: string[];
};

export type ImportReport = {
  mode: ImportMode;
  appliedAt: string;
  snapshotPath: string | null;
  tables: TableReport[];
  dryRun: boolean;
};

export class ImportError extends Error {}

const MAX_ROWS_PER_TABLE = 200_000;

/**
 * 事前快照（仅 replace）。
 *
 * 快照是**破坏性操作的最后一道保险**，所以这里不吞异常：失败就抛，由调用方
 * 决定是中止导入还是降级（见 applyImport）。
 *
 * 命名带毫秒 + 随机后缀：`VACUUM INTO` 在目标文件已存在时会直接失败
 * （`output file already exists`），而原先的文件名只精确到秒——同一秒内两次
 * 覆盖导入，第二次会**静默拿不到快照**（实测复现）。加上随机后缀后不会撞名。
 */
function snapshotDatabase(tag: string): string {
  const dir = path.resolve(process.cwd(), "..", "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("Z", "")
    .slice(0, 23); // 到毫秒
  const rand = randomBytes(3).toString("hex");
  const db = getDb();
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = attempt === 0 ? "" : `-${attempt}`;
      const dest = path.join(
        dir,
        `nekocircle-pre-import-${stamp}-${rand}${suffix}-${tag}.db`,
      );
      if (fs.existsSync(dest)) continue;
      db.prepare("VACUUM INTO ?").run(dest);
      return dest;
    }
    throw new Error("无法生成唯一的快照文件名");
  } finally {
    db.close();
  }
}

/**
 * settings 行的导入校验：
 * - 只接受「本应用真正会读的 key」——即参数设置白名单中的键，加上认证键。
 *   否则备份里的任意垃圾键会被写进 DB，未来某个版本恰好用了同名 key 时
 *   会静默生效，很难排查。
 * - 认证信息只接受「看起来像哈希」的值。混入明文种子值会出现
 *   「看起来登录能用、其实没生效」的迷惑状态。
 */
function normalizeSettingRow(row: Record<string, unknown>): Record<string, unknown> | string {
  const key = String(row.key ?? "");
  if (!key) return "key 为空的行";
  const value = row.value === undefined || row.value === null ? "" : String(row.value);
  if (CREDENTIAL_KEY_RE.test(key)) {
    if (key.endsWith("_hash") && !/^\$2[aby]\$/.test(value))
      return `${key}：不是 bcrypt 哈希，已排除`;
    if (!key.endsWith("_hash")) return `${key}：认证信息不参与导入`;
    return { key, value };
  }
  if (!getSettingDef(key)) return `${key}：不是已知的设置项，已忽略`;
  return { key, value };
}

export type ImportOptions = {
  mode: ImportMode;
  /** replace 的执行确认，false 时抛错。 */
  confirm?: boolean;
  /** 只做校验，不修改 DB（整个事务回滚）。 */
  dryRun?: boolean;
};

/** 用于在 dry-run 时回滚事务的内部信号 */
class RollbackSignal extends Error {}

export function applyImport(raw: unknown, options: ImportOptions): ImportReport {
  const mode = options.mode;
  const confirm = options.confirm === true;
  const dryRun = options.dryRun === true;

  if (mode !== "merge" && mode !== "replace") throw new ImportError("mode 只能是 merge 或 replace。");
  if (mode === "replace" && !confirm && !dryRun)
    throw new ImportError("replace 会清空已有数据，需要 confirm 确认。");

  if (!raw || typeof raw !== "object") throw new ImportError("不是 JSON 对象。");
  const bundle = raw as Partial<ExportBundle>;
  if (bundle.app !== "nekocircle")
    throw new ImportError("不是 NekoCircle 的备份文件（app 字段不匹配）。");
  if (bundle.schemaVersion !== undefined && Number(bundle.schemaVersion) > SCHEMA_VERSION)
    throw new ImportError(
      `这个备份的格式较新（schemaVersion ${bundle.schemaVersion} > ${SCHEMA_VERSION}）。`,
    );
  if (!bundle.tables || typeof bundle.tables !== "object")
    throw new ImportError("缺少 tables 字段。");

  const requested = Object.keys(bundle.tables).filter((k) =>
    TABLE_BY_NAME.has(k as TableName),
  ) as TableName[];
  if (!requested.length) throw new ImportError("没有可导入的表。");

  // dry-run 连快照都不做（不触碰 DB）
  let snapshotPath: string | null = null;
  if (mode === "replace" && !dryRun) {
    try {
      snapshotPath = snapshotDatabase(mode);
    } catch (err) {
      // 拿不到「事前快照」就不做破坏性导入：宁可失败可见，也不要静默丢数据。
      throw new ImportError(
        `无法生成导入前的数据库快照，已中止覆盖导入：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const db = getDb();
  const reports: TableReport[] = [];
  try {
    const run = db.transaction(() => {
      for (const meta of TABLE_META) {
        if (!requested.includes(meta.name)) continue;
        const incoming = (bundle.tables as Record<string, unknown>)[meta.name];
        const report: TableReport = {
          table: meta.name,
          label: meta.label,
          received: Array.isArray(incoming) ? incoming.length : 0,
          inserted: 0,
          skipped: 0,
          notes: [],
        };
        reports.push(report);

        if (!Array.isArray(incoming)) {
          report.notes.push("不是数组，已跳过。");
          continue;
        }
        if (incoming.length > MAX_ROWS_PER_TABLE)
          throw new ImportError(`${meta.label}：行数过多（上限 ${MAX_ROWS_PER_TABLE}）。`);

        const validColumns = columnsOf(db, meta.name);
        const rows: Record<string, unknown>[] = [];
        for (const item of incoming) {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            report.skipped += 1;
            if (report.notes.length < 3) report.notes.push("不是对象的行");
            continue;
          }
          const normalized =
            meta.name === "settings"
              ? normalizeSettingRow(item as Record<string, unknown>)
              : (item as Record<string, unknown>);
          if (typeof normalized === "string") {
            report.skipped += 1;
            if (report.notes.length < 3) report.notes.push(normalized);
            continue;
          }
          // 丢弃未知列；若一行里没有任何已知列则整行舍弃
          const filtered: Record<string, unknown> = {};
          for (const col of validColumns) {
            if (Object.prototype.hasOwnProperty.call(normalized, col)) filtered[col] = normalized[col];
          }
          if (!Object.keys(filtered).length) {
            report.skipped += 1;
            if (report.notes.length < 3) report.notes.push("没有任何已知列的行");
            continue;
          }
          rows.push(filtered);
        }

        if (mode === "replace") {
          // settings 表在 replace 模式下特殊处理：默认导出的备份不含认证信息
          // （admin 密码哈希等）。若无条件清空整表，导入后哈希就没了 —— 而本应用
          // 在哈希缺失时会把「下一次登录提交的密码」写成管理员密码，
          // 等于把后台交给第一个访问登录页的人。
          // 因此：只清掉备份里确实带了的 key，未被携带的凭据键原样保留。
          let preserved: string[] = [];
          if (meta.name === "settings") {
            const incomingKeys = new Set(rows.map((r) => String((r as { key?: unknown }).key ?? "")));
            const existing = db.prepare("SELECT key FROM settings").all() as { key: string }[];
            preserved = existing
              .map((r) => r.key)
              .filter((k) => CREDENTIAL_KEY_RE.test(k) && !incomingKeys.has(k));
          }
          if (preserved.length) {
            const placeholders = preserved.map(() => "?").join(", ");
            db.prepare(`DELETE FROM settings WHERE key NOT IN (${placeholders})`).run(
              ...(preserved as never[]),
            );
            report.notes.push(`已保留未随备份携带的认证信息（${preserved.length} 项）`);
          } else {
            db.prepare(`DELETE FROM ${meta.name}`).run();
          }
        }
        const verb = mode === "replace" ? "INSERT" : "INSERT OR IGNORE";
        for (const row of rows) {
          const cols = Object.keys(row);
          const sql = `${verb} INTO ${meta.name} (${cols.join(", ")}) VALUES (${cols
            .map(() => "?")
            .join(", ")})`;
          const info = db.prepare(sql).run(cols.map((c) => row[c] as never));
          if (info.changes > 0) report.inserted += 1;
          else report.skipped += 1;
        }

        if (meta.name === "yahoo_circles" || meta.name === "announcements" || meta.name === "feedbacks") {
          // 把 AUTOINCREMENT 计数器对齐到实际数据（显式插入 id 时可能错位）
          try {
            const maxRow = db.prepare(`SELECT MAX(rowid) m FROM ${meta.name}`).get() as {
              m: number | null;
            };
            db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ?").run(
              maxRow.m ?? 0,
              meta.name,
            );
          } catch {
            /* 没有 sqlite_sequence 表时什么都不做 */
          }
        }
      }

      // dry-run 在此抛异常，让整个事务回滚
      if (dryRun) throw new RollbackSignal();
    });

    try {
      run();
    } catch (err) {
      if (!(err instanceof RollbackSignal)) throw err;
    }
  } finally {
    db.close();
  }

  return { mode, appliedAt: new Date().toISOString(), snapshotPath, tables: reports, dryRun };
}

/* ------------------------------------------------------------------ */
/* 现状概览                                                            */
/* ------------------------------------------------------------------ */

export type DatabaseOverview = {
  path: string;
  bytes: number;
  tables: { name: TableName; label: string; rows: number }[];
};

export function databaseOverview(): DatabaseOverview {
  const db = getDb();
  try {
    const tables = TABLE_META.map((meta) => {
      let rows = 0;
      try {
        rows = (db.prepare(`SELECT COUNT(*) c FROM ${meta.name}`).get() as { c: number }).c;
      } catch {
        rows = 0;
      }
      return { name: meta.name, label: meta.label, rows };
    });
    let bytes = 0;
    try {
      bytes = fs.statSync(DB_PATH).size;
    } catch {
      bytes = 0;
    }
    return { path: DB_PATH, bytes, tables };
  } finally {
    db.close();
  }
}
