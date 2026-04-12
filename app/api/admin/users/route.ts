import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { initDb, listUsers } from "@/lib/db";

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
  const users = listUsers();
  // Don't expose password hashes
  return NextResponse.json(
    users.map(({ password_hash: _, ...u }) => u)
  );
}
