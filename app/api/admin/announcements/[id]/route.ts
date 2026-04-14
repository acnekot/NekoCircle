import { NextResponse } from "next/server";
import { initDb, updateAnnouncement, deleteAnnouncement } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id || isNaN(id)) {
      return NextResponse.json({ error: "无效 ID" }, { status: 400 });
    }
    const body = await req.json();
    const allowed = ["title", "content", "type", "active", "pinned"] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }
    updateAnnouncement(id, data as Parameters<typeof updateAnnouncement>[1]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    initDb();
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id || isNaN(id)) {
      return NextResponse.json({ error: "无效 ID" }, { status: 400 });
    }
    deleteAnnouncement(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
