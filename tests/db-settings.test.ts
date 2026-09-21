import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * 回归防线：settings 里绝不能再出现明文凭证键。
 *
 * 历史包袱是 lib/db.ts 曾用 `INSERT OR IGNORE INTO settings VALUES
 * ('admin_password', 'admin123')` 种入一行明文。它从未被任何代码读取
 * （登录只读 admin_password_hash），但会随每次备份外带，让人误以为
 * admin123 就是后台密码。这里同时锁住两件事：新库不再种入、旧库会被清理。
 */
test("initDb 不再种入明文 admin_password，并清理历史残留", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nekocircle-db-"));
  // DB_PATH 在模块加载时求值，因此必须先设定再动态导入。
  process.env.DB_PATH = path.join(dir, "legacy.db");
  const db = await import("../lib/db");

  try {
    // 情形一：从旧快照还原的库，里面已经有明文键
    db.initDb();
    db.setSetting("admin_password", "admin123");
    assert.equal(db.getAllSettings().admin_password, "admin123");

    // 再跑一次初始化必须把它清掉
    db.initDb();
    assert.equal(db.getAllSettings().admin_password, undefined);

    // 情形二：全新库，不该有任何 ^admin_password 明文键
    for (const f of ["legacy.db", "legacy.db-wal", "legacy.db-shm"]) {
      fs.rmSync(path.join(dir, f), { force: true });
    }
    db.initDb();
    const plaintextKeys = Object.keys(db.getAllSettings()).filter(
      (k) => /^admin_password/i.test(k) && !k.endsWith("_hash"),
    );
    assert.deepEqual(plaintextKeys, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});