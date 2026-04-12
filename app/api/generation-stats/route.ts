import { NextResponse } from "next/server";
import { initDb, getGenerationCounts } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    const counts = getGenerationCounts();
    return NextResponse.json(counts, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120, max-age=30",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
