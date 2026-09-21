import { NextResponse } from "next/server";
import { deleteFeedback, initDb, updateFeedbackStatus } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "反馈 ID 无效" }, { status: 400 });
  }
  try {
    const body = await req.json() as { status?: unknown };
    if (body.status !== "new" && body.status !== "reviewed") {
      return NextResponse.json({ error: "状态无效" }, { status: 400 });
    }
    initDb();
    updateFeedbackStatus(id, body.status);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "反馈 ID 无效" }, { status: 400 });
  }
  try {
    initDb();
    deleteFeedback(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
