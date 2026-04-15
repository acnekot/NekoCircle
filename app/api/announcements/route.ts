import { NextResponse } from "next/server";
import { initDb, getActiveAnnouncements } from "@/lib/db";

export async function GET(req: Request) {
  try {
    initDb();
    const { searchParams } = new URL(req.url);
    const locale = searchParams.get("locale") || undefined;
    const list = getActiveAnnouncements(locale);
    return NextResponse.json(list, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
