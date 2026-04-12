import { NextResponse } from "next/server";
import { initDb, listAnalyses, deleteAnalysis, getSetting } from "@/lib/db";

export async function GET() {
  initDb();
  const rows = listAnalyses();
  return NextResponse.json(rows.map((r) => ({ ...r, result: undefined })));
}

export async function DELETE(req: Request) {
  initDb();
  const { id, password } = await req.json();
  const stored = getSetting("admin_password");
  if (password !== stored) return NextResponse.json({ error: "密码错误" }, { status: 401 });
  deleteAnalysis(id);
  return NextResponse.json({ ok: true });
}
