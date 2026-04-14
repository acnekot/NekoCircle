import { NextResponse } from "next/server";
import { initDb, getCircleByAnyId } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  initDb();
  const { id } = await params;

  const circle = getCircleByAnyId(id);
  if (!circle) {
    return NextResponse.json({ error: "未找到该圈子" }, { status: 404 });
  }

  return NextResponse.json(circle);
}
