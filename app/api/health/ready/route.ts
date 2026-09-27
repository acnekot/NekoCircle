import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 部署就绪探针；进程看门狗仍使用不访问数据库的 /health/live。 */
export async function GET() {
  let db: ReturnType<typeof getDb> | undefined;
  try {
    db = getDb();
    db.prepare("SELECT key FROM settings LIMIT 1").get();
    db.prepare("SELECT id FROM yahoo_circles LIMIT 1").get();
    db.prepare("SELECT id FROM generation_log LIMIT 1").get();
    return NextResponse.json({
      ok: true,
      releaseId: process.env.NEKOCIRCLE_RELEASE_ID ?? null,
      buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION ?? "development",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "database unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  } finally {
    db?.close();
  }
}
