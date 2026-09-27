import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { getSettingValue } from "./app-config";
import { getDb, type YahooCircleRow } from "./db";
import { SCHEMA_VERSION, type ExportBundle } from "./admin-data";

const GITHUB_API = "https://api.github.com";
const MAX_COMPRESSED_BYTES = 90 * 1024 * 1024;

type BackupConfig = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
};

export type GitHubBackupResult = {
  ok: true;
  exportedAt: string;
  circleCount: number;
  compressedBytes: number;
  commitSha: string;
  commitUrl: string;
  repository: string;
  branch: string;
  path: string;
};

export type GitHubBackupStatus = {
  configured: boolean;
  automatic: boolean;
  running: boolean;
  lastResult: GitHubBackupResult | null;
  lastError: string | null;
};

let running: Promise<GitHubBackupResult> | null = null;
let scheduled: ReturnType<typeof setTimeout> | null = null;
let lastResult: GitHubBackupResult | null = null;
let lastError: string | null = null;

function setting(key: string): string {
  return getSettingValue(key).trim();
}

export function normalizeGitHubBackupPath(raw: string): string {
  const normalized = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) throw new Error("请填写备份文件路径。");
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("备份文件路径不能包含空目录、. 或 ..。");
  }
  if (!normalized.toLowerCase().endsWith(".json.gz")) {
    throw new Error("备份文件路径必须以 .json.gz 结尾。");
  }
  return normalized;
}

function readConfig(): BackupConfig {
  const owner = setting("github_backup_owner");
  const repo = setting("github_backup_repo");
  const branch = setting("github_backup_branch") || "main";
  const path = normalizeGitHubBackupPath(
    setting("github_backup_path") || "backups/nekocircle-long-term.json.gz",
  );
  const token = setting("github_backup_token");

  if (!/^[A-Za-z0-9_.-]+$/.test(owner)) throw new Error("GitHub 仓库所有者格式不正确。");
  if (!/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GitHub 仓库名称格式不正确。");
  if (!branch || /[\x00-\x20~^:?*[\\]/.test(branch) || branch.includes("..")) {
    throw new Error("GitHub 分支名称格式不正确。");
  }
  if (!token) throw new Error("尚未设置 GitHub 访问令牌。");
  return { owner, repo, branch, path, token };
}

function isConfigured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

function buildLongTermBundle(): { bundle: ExportBundle; rows: YahooCircleRow[] } {
  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT id, username, circle_data, storage_consent, consented_at, created_at
       FROM yahoo_circles
       WHERE storage_consent = 1
       ORDER BY created_at ASC, id ASC`,
    ).all() as YahooCircleRow[];
    const bundle: ExportBundle = {
      app: "nekocircle",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      options: { credentials: false, tables: ["yahoo_circles"] },
      counts: { yahoo_circles: rows.length },
      tables: { yahoo_circles: rows as unknown as Record<string, unknown>[] },
    };
    return { bundle, rows };
  } finally {
    db.close();
  }
}

async function githubRequest<T>(config: BackupConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "user-agent": "NekoCircle-GitHub-Backup/1.0",
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json() as { message?: string };
      detail = body.message ? `：${body.message}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`GitHub 请求失败（${response.status}）${detail}`);
  }
  return response.json() as Promise<T>;
}

async function performBackup(): Promise<GitHubBackupResult> {
  const config = readConfig();
  const { bundle, rows } = buildLongTermBundle();
  const json = JSON.stringify(bundle);
  const compressed = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  if (compressed.byteLength > MAX_COMPRESSED_BYTES) {
    throw new Error("长期数据压缩后超过 90MB，已停止上传；请拆分备份仓库或先导出到本地。");
  }

  const digest = createHash("sha256").update(compressed).digest("hex");
  const repoPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const ref = await githubRequest<{ object: { sha: string } }>(
    config,
    `${repoPath}/git/ref/heads/${encodeURIComponent(config.branch)}`,
  );
  const parentSha = ref.object.sha;
  const parent = await githubRequest<{ tree: { sha: string } }>(
    config,
    `${repoPath}/git/commits/${encodeURIComponent(parentSha)}`,
  );

  const dataBlob = await githubRequest<{ sha: string }>(config, `${repoPath}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: compressed.toString("base64"), encoding: "base64" }),
  });
  const metadataPath = config.path.replace(/\.json\.gz$/i, ".meta.json");
  const metadata = JSON.stringify({
    app: "nekocircle",
    type: "long-term-circles",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: bundle.exportedAt,
    circleCount: rows.length,
    uncompressedBytes: Buffer.byteLength(json, "utf8"),
    compressedBytes: compressed.byteLength,
    sha256: digest,
    dataFile: config.path,
  }, null, 2);
  const metaBlob = await githubRequest<{ sha: string }>(config, `${repoPath}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: metadata, encoding: "utf-8" }),
  });
  const tree = await githubRequest<{ sha: string }>(config, `${repoPath}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [
        { path: config.path, mode: "100644", type: "blob", sha: dataBlob.sha },
        { path: metadataPath, mode: "100644", type: "blob", sha: metaBlob.sha },
      ],
    }),
  });
  const commit = await githubRequest<{ sha: string; html_url?: string }>(config, `${repoPath}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Backup ${rows.length} long-term NekoCircle circles`,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });
  await githubRequest(config, `${repoPath}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    ok: true,
    exportedAt: bundle.exportedAt,
    circleCount: rows.length,
    compressedBytes: compressed.byteLength,
    commitSha: commit.sha,
    commitUrl: commit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${commit.sha}`,
    repository: `${config.owner}/${config.repo}`,
    branch: config.branch,
    path: config.path,
  };
}

export async function syncLongTermCirclesToGitHub(): Promise<GitHubBackupResult> {
  if (running) return running;
  running = performBackup()
    .then((result) => {
      lastResult = result;
      lastError = null;
      return result;
    })
    .catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export function scheduleGitHubLongTermBackup(): void {
  try {
    if (setting("github_backup_enabled") !== "true" || !isConfigured()) return;
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      scheduled = null;
      void syncLongTermCirclesToGitHub().catch((error) => {
        console.error("[github-backup] automatic sync failed:", error);
      });
    }, 5_000);
    scheduled.unref?.();
  } catch (error) {
    // 备份永远不能反过来让正常的圈子保存失败。
    console.error("[github-backup] unable to schedule automatic sync:", error);
  }
}

export function getGitHubBackupStatus(): GitHubBackupStatus {
  return {
    configured: isConfigured(),
    automatic: setting("github_backup_enabled") === "true",
    running: running !== null,
    lastResult,
    lastError,
  };
}
