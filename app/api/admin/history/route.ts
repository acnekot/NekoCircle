import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { initDb, listAnalyses, deleteAnalysis } from "@/lib/db";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("neko_session")?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return payload?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();
  const rows = listAnalyses();
  return NextResponse.json(rows.map((r) => ({ ...r, result: undefined })));
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();
  const { id } = await req.json();
  deleteAnalysis(id);
  return NextResponse.json({ ok: true });
}
