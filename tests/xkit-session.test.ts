import assert from "node:assert/strict";
import test from "node:test";
import {
  clearXKitSessionsForTests,
  createXKitSession,
  deleteXKitSession,
  getXKitSession,
} from "../lib/xkit/session";

test("temporary xKit binding is memory-only, expires after one hour, and can be revoked", () => {
  clearXKitSessionsForTests();
  const now = Date.UTC(2026, 8, 23);
  const created = createXKitSession({ authToken: "test-auth", ct0: "test-csrf" }, "acnekot", now);
  assert.equal(getXKitSession(created.id, now)?.accountName, "acnekot");
  assert.equal(getXKitSession(created.id, now + 3_599_999)?.credentials.ct0, "test-csrf");
  assert.equal(getXKitSession(created.id, now + 3_600_000), undefined);

  const another = createXKitSession({ authToken: "test-auth-2", ct0: "test-csrf-2" }, "other", now);
  deleteXKitSession(another.id);
  assert.equal(getXKitSession(another.id, now), undefined);
  clearXKitSessionsForTests();
});
