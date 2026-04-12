import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { initDb, getCacheStats, clearCache, evictStaleCache } from "@/lib/db";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("neko_session")?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return payload?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();
  const stats = getCacheStats();
  return NextResponse.json(stats);
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();
  const { searchParams } = new URL(req.url);
  if (searchParams.get("evict")) {
    const days = parseInt(searchParams.get("days") || "7");
    const removed = evictStaleCache(days * 24 * 60 * 60_000);
    return NextResponse.json({ ok: true, removed });
  }
  clearCache();
  return NextResponse.json({ ok: true });
}
