import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

test("GitHub 备份只包含已授权长期保存的圈子", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nekocircle-github-backup-"));
  process.env.DB_PATH = path.join(dir, "backup.db");
  const db = await import("../lib/db");
  const config = await import("../lib/app-config");
  const backup = await import("../lib/github-backup");
  const originalFetch = globalThis.fetch;
  const requestBodies: unknown[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) requestBodies.push(body);
    let response: unknown;
    if (url.includes("/git/ref/heads/")) response = { object: { sha: "parent-commit" } };
    else if (url.endsWith("/git/commits/parent-commit")) response = { tree: { sha: "parent-tree" } };
    else if (url.endsWith("/git/blobs")) response = { sha: `blob-${requestBodies.length}` };
    else if (url.endsWith("/git/trees")) response = { sha: "new-tree" };
    else if (url.endsWith("/git/commits")) response = { sha: "new-commit", html_url: "https://example.test/commit" };
    else if (url.includes("/git/refs/heads/")) response = { object: { sha: "new-commit" } };
    else throw new Error(`unexpected request: ${url}`);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    db.initDb();
    db.createYahooCircle("long0001", "alice", JSON.stringify({ marker: "keep" }), true);
    db.createYahooCircle("temp0001", "bob", JSON.stringify({ marker: "drop" }), false);
    config.saveSettingValue("github_backup_owner", "owner");
    config.saveSettingValue("github_backup_repo", "repo");
    config.saveSettingValue("github_backup_branch", "main");
    config.saveSettingValue("github_backup_path", "backups/long-term.json.gz");
    config.saveSettingValue("github_backup_token", "secret-token");

    const result = await backup.syncLongTermCirclesToGitHub();
    assert.equal(result.circleCount, 1);
    assert.equal(result.commitSha, "new-commit");

    const dataBlob = requestBodies.find(
      (value) => (value as { encoding?: string }).encoding === "base64",
    ) as { content: string };
    const bundle = JSON.parse(
      gunzipSync(Buffer.from(dataBlob.content, "base64")).toString("utf8"),
    ) as { tables: { yahoo_circles: Array<{ id: string; storage_consent: number }> } };
    assert.deepEqual(
      bundle.tables.yahoo_circles.map((row) => [row.id, row.storage_consent]),
      [["long0001", 1]],
    );
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GitHub 备份路径拒绝目录穿越", async () => {
  const { normalizeGitHubBackupPath } = await import("../lib/github-backup");
  assert.equal(
    normalizeGitHubBackupPath("/backups/circles.json.gz"),
    "backups/circles.json.gz",
  );
  assert.throws(() => normalizeGitHubBackupPath("../private.json.gz"));
  assert.throws(() => normalizeGitHubBackupPath("backups/circles.json"));
});
