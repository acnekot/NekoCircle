import { NextResponse } from "next/server";
import { initDb, getAnalysis } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  initDb();
  const { id } = await params;
  const analysis = getAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "未找到" }, { status: 404 });
  // raw_data can be large; always return it so the UI can show raw data tab
  return NextResponse.json(analysis);
}
