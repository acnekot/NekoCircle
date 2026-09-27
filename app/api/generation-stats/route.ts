import { NextResponse } from "next/server";
import { initDb, getGenerationCounts } from "@/lib/db";
import { getAppConfig } from "@/lib/app-config";

export async function GET() {
  try {
    initDb();
    const counts = getGenerationCounts();
    const offset = getAppConfig().statsGenerationOffset;
    return NextResponse.json({ yahoo: counts.yahoo + offset, total: counts.total + offset }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120, max-age=30",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
