import { NextResponse } from "next/server";
import { initDb, getCacheStats, clearCache, evictStaleCache } from "@/lib/db";

export async function GET() {
  initDb();
  const stats = getCacheStats();
  return NextResponse.json(stats);
}

export async function DELETE(req: Request) {
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
