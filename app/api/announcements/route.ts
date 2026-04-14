import { NextResponse } from "next/server";
import { initDb, getActiveAnnouncements } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    const list = getActiveAnnouncements();
    return NextResponse.json(list, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
