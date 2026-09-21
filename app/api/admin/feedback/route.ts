import { NextResponse } from "next/server";
import { initDb, listFeedbacks } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    return NextResponse.json(listFeedbacks(), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "读取反馈失败" }, { status: 500 });
  }
}
