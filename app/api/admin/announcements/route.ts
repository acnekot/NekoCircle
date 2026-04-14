import { NextResponse } from "next/server";
import { initDb, listAnnouncements, createAnnouncement } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    return NextResponse.json(listAnnouncements());
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    initDb();
    const { title, content, type } = await req.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }
    const validTypes = ["info", "warning", "success"];
    const safeType = validTypes.includes(type) ? type : "info";
    const id = createAnnouncement(title.trim(), (content ?? "").trim(), safeType);
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
