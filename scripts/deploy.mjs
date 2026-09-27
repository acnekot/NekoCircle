// Windows + Baota rolling deployment. Run `node scripts/deploy.mjs help`.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const absolute = (value) => path.resolve(value);
const samePath = (a, b) => absolute(a).toLowerCase() === absolute(b).toLowerCase();

export function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content);
  try { fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function publishAssets(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, item.name);
    const to = path.join(destination, item.name);
    if (item.isDirectory()) publishAssets(from, to);
    else if (item.isFile()) {
      if (fs.existsSync(to)) {
        if (!fs.readFileSync(from).equals(fs.readFileSync(to))) {
          throw new Error(`Static asset collision: ${item.name}; existing file was preserved.`);
        }
      } else fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    } else throw new Error("Static asset symlinks are not supported.");
  }
}

export function proxyConfig(port, staticDirectory) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port.");
  const assets = absolute(staticDirectory).replace(/\\/g, "/");
  if (/[\r\n"$]/.test(assets)) throw new Error("Unsupported characters in static asset path.");
  return `# Managed by NekoCircle deploy.mjs. Keep this file inside the site's proxy include.
location ^~ /_next/static/ {
    alias "${assets}/";
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}
location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
`;
}

async function run(executable, args, options = {}) {
  const child = spawn(executable, args, { windowsHide: true, stdio: "inherit", ...options });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`Command failed (${code}): ${path.basename(executable)}`);
}

export async function checkHealth(target, url, attempts = 30) {
  const endpoint = url ?? `http://127.0.0.1:${target.port}/api/health/${target.releaseId ? "ready" : "live"}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store", headers: { Connection: "close" }, signal: AbortSignal.timeout(3_000),
      });
      const body = await response.json();
      if (response.ok && body.ok === true && (!target.releaseId || body.releaseId === target.releaseId)) return;
    } catch { /* Retry while the new worker starts. */ }
    if (attempt + 1 < attempts) await delay(1_000);
  }
  throw new Error("Health check failed; expected release did not become ready.");
}

/** Switch transaction: syntax failure or public verification failure restores the old file. */
export async function switchDeployment(state, target, options, dependencies = {}) {
  const health = dependencies.health ?? checkHealth;
  const nginx = dependencies.nginx ?? ((args) => run(options.nginx, ["-p", `${options.prefix.replace(/\\/g, "/")}/`, ...args]));
  await health(target);
  const before = fs.readFileSync(options.proxyFile);
  // A dedicated location include is required, so SSL/ACME/server configuration is never replaced.
  if (/\b(?:server|upstream)\s*\{/.test(before.toString()) ||
      !new RegExp(`proxy_pass\\s+http://(?:127\\.0\\.0\\.1|localhost):${state.active.port}(?:/)?\\s*;`).test(before.toString())) {
    throw new Error("Proxy file must be the dedicated location include pointing to the active port.");
  }
  await nginx(["-t"]);
  let reloadAttempted = false;
  try {
    atomicWrite(options.proxyFile, proxyConfig(target.port, options.staticDirectory));
    await nginx(["-t"]);
    reloadAttempted = true;
    await nginx(["-s", "reload"]);
    await health(target, options.verifyUrl);
    const candidates = { ...state.candidates };
    delete candidates[target.port];
    const next = { ...state, previous: state.active, active: target, candidates };
    options.persist?.(next);
    return next;
  } catch (error) {
    atomicWrite(options.proxyFile, before);
    if (reloadAttempted) {
      try { await nginx(["-t"]); await nginx(["-s", "reload"]); }
      catch (restoreError) { throw new AggregateError([error, restoreError], "Old config restored on disk; Nginx rollback failed, inspect its logs."); }
    }
    throw new Error("Update failed; previous Nginx configuration restored.", { cause: error });
  }
}

function argumentsOf(args) {
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--skip-build") values.skipBuild = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
      values[key.slice(2)] = value;
    }
  }
  return values;
}

function required(options, key) {
  if (!options[key]) throw new Error(`Required: --${key}`);
  return options[key];
}

async function assertFreePort(port) {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => socket.close(resolve));
}

async function prepare(state, options, stateDirectory) {
  const release = fs.realpathSync(required(options, "release"));
  const port = Number(required(options, "port"));
  proxyConfig(port, path.join(stateDirectory, "static")); // Validate before any mutation.
  const protectedReleases = [state.active, state.previous, ...Object.values(state.candidates)];
  if (protectedReleases.some((item) => item && (samePath(item.release, release) || item.port === port))) {
    throw new Error("Choose a fresh release directory and unused port; retained releases are protected.");
  }
  await assertFreePort(port);
  const releaseId = randomUUID();
  const env = { ...process.env, DB_PATH: state.db, NEKOCIRCLE_RELEASE_ID: releaseId };
  const envFile = options.env ? absolute(options.env) : state.envFile;
  if (envFile && !fs.existsSync(envFile)) throw new Error("Environment file does not exist.");
  const nodeFlags = envFile ? [`--env-file=${envFile}`] : [];
  if (!options.skipBuild) {
    const npmCli = options["npm-cli"] ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    if (!fs.existsSync(npmCli)) throw new Error("Cannot locate npm; provide --npm-cli pointing to npm-cli.js.");
    await run(process.execPath, [...nodeFlags, npmCli, "ci", "--no-audit", "--no-fund"], { cwd: release, env });
    await run(process.execPath, [...nodeFlags, npmCli, "run", "build"], { cwd: release, env });
  }
  if (!fs.existsSync(path.join(release, ".next/BUILD_ID"))) throw new Error("Production build is missing.");
  const logDirectory = path.join(stateDirectory, "logs");
  fs.mkdirSync(logDirectory, { recursive: true });
  const stdout = fs.openSync(path.join(logDirectory, `${releaseId}.out.log`), "a");
  const stderr = fs.openSync(path.join(logDirectory, `${releaseId}.err.log`), "a");
  const child = spawn(process.execPath, [...nodeFlags, path.join(release, "node_modules/next/dist/bin/next"),
    "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: release, env, detached: true, windowsHide: true, stdio: ["ignore", stdout, stderr],
  });
  fs.closeSync(stdout);
  fs.closeSync(stderr);
  await once(child, "spawn");
  child.unref();
  const candidate = { release, port, pid: child.pid, releaseId };
  try {
    await checkHealth(candidate);
    publishAssets(path.join(release, ".next/static"), path.join(stateDirectory, "static"));
    return { ...state, candidates: { ...state.candidates, [port]: candidate } };
  } catch (error) {
    child.kill(); // Only the candidate started by this invocation; old service is never stopped.
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (!command || command === "help") {
    console.log("NekoCircle deployment: init | prepare | switch | rollback | retire | status\nSee docs/windows-rolling-update.md for Baota setup and commands.");
    return;
  }
  if (!["init", "prepare", "switch", "rollback", "retire", "status"].includes(command)) throw new Error("Unknown command.");
  const options = argumentsOf(rest);
  const directory = absolute(required(options, "state"));
  fs.mkdirSync(directory, { recursive: true });
  const stateFile = path.join(directory, "deployment.json");
  if (command === "status") { console.log(fs.readFileSync(stateFile, "utf8")); return; }
  const lockFile = path.join(directory, "deployment.lock");
  const lock = fs.openSync(lockFile, "wx");
  try {
    let state;
    let persisted = false;
    if (command === "init") {
      if (fs.existsSync(stateFile)) throw new Error("Deployment is already initialized.");
      const db = fs.realpathSync(required(options, "db")); // Reject typo instead of creating an empty database.
      const release = fs.realpathSync(required(options, "release"));
      const port = Number(required(options, "port"));
      proxyConfig(port, path.join(directory, "static"));
      const active = { release, port, releaseId: null };
      await checkHealth(active, undefined, 3);
      publishAssets(path.join(release, ".next/static"), path.join(directory, "static"));
      const envFile = options.env ? absolute(options.env) : path.join(release, ".env.local");
      if (options.env && !fs.existsSync(envFile)) throw new Error("Environment file does not exist.");
      state = { version: 1, db, envFile: fs.existsSync(envFile) ? envFile : null, active, previous: null, candidates: {} };
    } else {
      state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (command === "prepare") state = await prepare(state, options, directory);
      else if (command === "retire") {
        const port = Number(required(options, "port"));
        proxyConfig(port, path.join(directory, "static"));
        if (port === state.active.port) throw new Error("The active port cannot be retired.");
        // Require the administrator to stop the old process after in-flight requests drain.
        // A busy port remains protected even if a PID has been reused.
        await assertFreePort(port);
        const candidates = { ...state.candidates };
        delete candidates[port];
        state = { ...state, candidates, previous: state.previous?.port === port ? null : state.previous };
      }
      else {
        const target = command === "rollback" ? state.previous : state.candidates[Number(required(options, "port"))];
        if (!target) throw new Error("No retained release available for this operation.");
        if (state.previous && target.port !== state.previous.port) {
          throw new Error("Retire the older rollback release before switching again; its process and port remain protected.");
        }
        const verifyUrl = new URL(required(options, "verify-url"));
        if (!/^https?:$/.test(verifyUrl.protocol)) throw new Error("Verification requires an HTTP(S) URL.");
        // The old release may predate /health/ready.
        verifyUrl.pathname = `/api/health/${target.releaseId ? "ready" : "live"}`;
        verifyUrl.search = `deployment=${randomUUID()}`;
        verifyUrl.hash = "";
        state = await switchDeployment(state, target, {
          proxyFile: fs.realpathSync(required(options, "proxy-file")),
          nginx: fs.realpathSync(required(options, "nginx")),
          prefix: fs.realpathSync(required(options, "prefix")),
          staticDirectory: path.join(directory, "static"), verifyUrl: verifyUrl.toString(),
          persist: (next) => { atomicWrite(stateFile, JSON.stringify(next, null, 2)); persisted = true; },
        });
      }
    }
    if (!persisted) atomicWrite(stateFile, JSON.stringify(state, null, 2));
    console.log(`${command} completed. Active port: ${state.active.port}. Old processes retained for draining and rollback.`);
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  }
}

if (process.argv[1] && pathToFileURL(absolute(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
