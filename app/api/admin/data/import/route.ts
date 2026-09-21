import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { gunzipSync } from "node:zlib";
import { initDb } from "@/lib/db";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { applyImport, ImportError, type ImportMode } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/**
 * 请求体上限（**压缩后**的字节数）。
 *
 * 注意：这个路由**不走** middleware 鉴权（见 middleware.ts 的 matcher 说明）
 * ——middleware 会缓冲请求体，超过约 10MB 的 POST 会在到达本路由前损坏。
 * 因此这里用 verifyAdminToken 自行鉴权。
 *
 * 2026-09-21 调整：原先设 64MB，注释里写着「当前整库导出约 17MB」。但站点真实
 * 使用增长后导出体积到了 67.8MB，**完整备份变得导得出、导不回去**。现在：
 *   1) 上传体积上限提到 256MB；
 *   2) 支持 gzip 请求体（见下），后台默认导出 `.json.gz`，实际传输只有几 MB。
 * 2) 是主要手段，1) 只是给未压缩上传留的余量。链路本身能承载 60MB 以上（实测）。
 */
const MAX_BODY_BYTES = 256 * 1024 * 1024;

/**
 * 解压后 JSON 的上限，防止解压炸弹（几 KB 的 gz 能膨胀到几 GB）。
 * 交给 zlib 的 maxOutputLength 强制截断，超出即抛错。
 */
const MAX_JSON_BYTES = 512 * 1024 * 1024;

const GZIP_MAGIC = [0x1f, 0x8b];

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

/** 判断请求体是不是「备份包本身」（允许直接 POST 原始备份文件，无需套一层信封）。 */
function looksLikeBundle(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { app?: unknown }).app === "string" &&
    !!(value as { tables?: unknown }).tables
  );
}

async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: `备份文件过大（上限 ${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB；建议改用压缩备份 .json.gz）。`,
      },
      { status: 413 },
    );
  }

  // 读成字节而不是 req.text()：要先看魔数判断是否是 gzip，
  // 而 text() 拿到压缩体只会得到乱码。
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "无法读取请求内容。" }, { status: 400 });
  }

  if (bytes.byteLength === 0)
    return NextResponse.json({ error: "请求内容为空。" }, { status: 400 });
  if (bytes.byteLength > MAX_BODY_BYTES)
    return NextResponse.json(
      {
        error: `备份文件过大（上限 ${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB；建议改用压缩备份 .json.gz）。`,
      },
      { status: 413 },
    );

  let raw: string;
  if (isGzip(bytes)) {
    try {
      raw = gunzipSync(bytes, { maxOutputLength: MAX_JSON_BYTES }).toString("utf8");
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      const tooBig =
        err instanceof RangeError || code === "ERR_BUFFER_TOO_LARGE";
      return NextResponse.json(
        {
          error: tooBig
            ? `解压后体积超过上限（${Math.round(MAX_JSON_BYTES / 1024 / 1024)}MB）。`
            : "压缩包无法解压，可能已损坏或不是 gzip 格式。",
        },
        { status: tooBig ? 413 : 400 },
      );
    }
  } else {
    raw = new TextDecoder("utf-8").decode(bytes);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "无法按 JSON 解析。" }, { status: 400 });
  }

  const envelope = (body ?? {}) as {
    bundle?: unknown;
    mode?: unknown;
    confirm?: unknown;
    dryRun?: unknown;
  };

  // 接受两种形态：
  //   1) 信封 `{bundle, mode, confirm, dryRun}`（未压缩的 JSON 上传走这条）；
  //   2) 请求体本身就是备份包（压缩包解压后即此形态；也便于
  //      `curl --data-binary @backup.json` 直接导入）。
  // 第 2 种没有信封可放参数，于是同时支持从 query 读（见下）。
  const direct = looksLikeBundle(body);

  const mode = (
    envelope.mode === "replace" || params.get("mode") === "replace"
      ? "replace"
      : "merge"
  ) as ImportMode;
  // 覆盖是破坏性操作，必须显式确认；确认信号来自信封或 query，二者都不默认放行
  const confirm = envelope.confirm === true || params.get("confirm") === "1";
  const dryRun = envelope.dryRun === true || params.get("dryRun") === "1";

  // bundle 允许是对象，也允许是 JSON 字符串
  let bundle: unknown = direct ? body : envelope.bundle;
  if (typeof bundle === "string") {
    try {
      bundle = JSON.parse(bundle);
    } catch {
      return NextResponse.json(
        { error: "备份内容无法按 JSON 解析。" },
        { status: 400 },
      );
    }
  }

  try {
    initDb();
    const report = applyImport(bundle, { mode, confirm, dryRun });
    return NextResponse.json(
      { ok: true, report },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "导入失败。" },
      { status: 500 },
    );
  }
}