import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { initDb, getAllSettings, setSetting } from "@/lib/db";

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
  const settings = getAllSettings();
  const { admin_password: _, api_key, integration_api_token, ...rest } = settings;
  void _;
  void integration_api_token;
  return NextResponse.json({ ...rest, api_key_set: !!api_key, integration_api_token_set: !!integration_api_token });
}

export async function POST(req: Request) {
  initDb();
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }

  const body = await req.json();
  // Remove legacy password field if present
  const { password: _pw, admin_password: _ap, ...updates } = body;
  void _pw; void _ap;

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string") setSetting(key, value);
  }
  return NextResponse.json({ ok: true });
}
