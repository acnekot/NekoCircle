import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishAssets, proxyConfig, switchDeployment } from "../scripts/deploy.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nekocircle-deploy-"));
  const proxyFile = path.join(directory, "proxy.conf");
  const before = "location / { proxy_pass http://127.0.0.1:3001; }\n";
  fs.writeFileSync(proxyFile, before);
  const active = { port: 3001, release: "old", releaseId: null };
  const target = { port: 3002, release: "new", releaseId: "candidate-id" };
  const state = { active, previous: null, candidates: { 3002: target } };
  const options = { proxyFile, staticDirectory: path.join(directory, "static"), verifyUrl: "https://example.test/api/health/ready" };
  return { directory, proxyFile, before, active, target, state, options };
}

test("deployment syntax rejection restores original bytes before any reload", async () => {
  const f = fixture();
  let checks = 0;
  const calls: string[] = [];
  try {
    await assert.rejects(switchDeployment(f.state, f.target, f.options, {
      health: async () => {},
      nginx: async (args: string[]) => {
        calls.push(args.join(" "));
        if (args[0] === "-t" && ++checks === 2) throw new Error("bad config");
      },
    }), /previous Nginx configuration restored/);
    assert.equal(fs.readFileSync(f.proxyFile, "utf8"), f.before);
    assert.ok(!calls.includes("-s reload"));
    assert.equal(f.state.active.port, 3001);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("public verification failure reloads the restored configuration", async () => {
  const f = fixture();
  const calls: string[] = [];
  try {
    await assert.rejects(switchDeployment(f.state, f.target, f.options, {
      health: async (_target: unknown, url?: string) => { if (url) throw new Error("wrong release"); },
      nginx: async (args: string[]) => { calls.push(args.join(" ")); },
    }), /previous Nginx configuration restored/);
    assert.equal(fs.readFileSync(f.proxyFile, "utf8"), f.before);
    assert.deepEqual(calls, ["-t", "-t", "-s reload", "-t", "-s reload"]);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("successful deployment retains the previous target and verifies the public endpoint", async () => {
  const f = fixture();
  const healthUrls: Array<string | undefined> = [];
  try {
    const next = await switchDeployment(f.state, f.target, f.options, {
      health: async (_target: unknown, url?: string) => { healthUrls.push(url); },
      nginx: async () => {},
    });
    assert.equal(next.active.port, 3002);
    assert.equal(next.previous.port, 3001);
    assert.equal(next.candidates[3002], undefined);
    assert.deepEqual(healthUrls, [undefined, f.options.verifyUrl]);
    assert.match(fs.readFileSync(f.proxyFile, "utf8"), /127\.0\.0\.1:3002/);
    assert.equal(f.state.active.port, 3001);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("static publication preserves old chunks and refuses conflicting replacement", () => {
  const f = fixture();
  const source = path.join(f.directory, "source");
  const destination = path.join(f.directory, "static");
  try {
    fs.mkdirSync(source);
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "old.js"), "old");
    fs.writeFileSync(path.join(source, "new.js"), "new");
    publishAssets(source, destination);
    assert.equal(fs.readFileSync(path.join(destination, "old.js"), "utf8"), "old");
    assert.equal(fs.readFileSync(path.join(destination, "new.js"), "utf8"), "new");
    fs.writeFileSync(path.join(source, "old.js"), "conflict");
    assert.throws(() => publishAssets(source, destination), /collision/);
    assert.equal(fs.readFileSync(path.join(destination, "old.js"), "utf8"), "old");
    assert.throws(() => proxyConfig(3002, `${destination}"; bad`), /Unsupported/);
    assert.throws(() => proxyConfig(0, destination), /Invalid port/);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test("state persistence failure restores Nginx instead of leaving an unrecorded release active", async () => {
  const f = fixture();
  const calls: string[] = [];
  try {
    await assert.rejects(switchDeployment(f.state, f.target, {
      ...f.options, persist: () => { throw new Error("state disk full"); },
    }, {
      health: async () => {},
      nginx: async (args: string[]) => { calls.push(args.join(" ")); },
    }), /previous Nginx configuration restored/);
    assert.equal(fs.readFileSync(f.proxyFile, "utf8"), f.before);
    assert.deepEqual(calls, ["-t", "-t", "-s reload", "-t", "-s reload"]);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});
