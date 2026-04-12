import { NextResponse } from "next/server";
import { initDb, updateAnalysis, getAnalysis } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  initDb();
  const { id } = await params;
  const row = getAnalysis(id);
  if (!row) return NextResponse.json({ error: "未找到" }, { status: 404 });
  if (row.status !== "running" && row.status !== "pending")
    return NextResponse.json({ error: "任务已结束" }, { status: 409 });
  updateAnalysis(id, { should_stop: 1 });
  return NextResponse.json({ ok: true });
}
