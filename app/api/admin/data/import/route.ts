import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initDb } from "@/lib/db";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { applyImport, ImportError, type ImportMode } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/**
 * 导入 JSON 的体积上限。
 *
 * 注意：这个路由**不走** middleware 鉴权（见 middleware.ts 的 matcher 说明）
 * ——middleware 会缓冲请求体，超过约 10MB 的 POST 会在到达本路由前损坏。
 * 因此这里用 verifyAdminToken 自行鉴权。
 *
 * 上限设为 64MB：`req.text()` 会把整个请求体读进内存，再解析成对象，
 * 峰值占用约为请求体的数倍。当前整库导出约 17MB，留了足够余量。
 */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `备份文件过大（上限 ${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB）。` },
      { status: 413 },
    );
  }

  const raw = await req.text().catch(() => "");
  if (!raw) return NextResponse.json({ error: "请求内容为空。" }, { status: 400 });
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json(
      { error: `备份文件过大（上限 ${Math.round(MAX_BODY_BYTES / 1024 / 1024)}MB）。` },
      { status: 413 },
    );

  let body: {
    bundle?: unknown;
    mode?: string;
    confirm?: boolean;
    dryRun?: boolean;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "无法按 JSON 解析。" }, { status: 400 });
  }

  const mode = (body.mode === "replace" ? "replace" : "merge") as ImportMode;
  const confirm = body.confirm === true;
  const dryRun = body.dryRun === true;

  // bundle 允许是对象，也允许是 JSON 字符串
  let bundle: unknown = body.bundle;
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