import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/auth";
import { initDb, getAllSettings, setSetting } from "@/lib/db";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  const payload = await verifyAdminToken(token);
  return !!payload;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();
  const settings = getAllSettings();
  const { admin_password: _1, admin_password_hash: _2, api_key, ...rest } = settings;
  void _1; void _2;
  return NextResponse.json({ ...rest, api_key_set: !!api_key });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();

  const body = await req.json();
  // 禁止通过 API 修改管理员密码哈希和敏感字段
  const { password: _pw, admin_password: _ap, admin_password_hash: _aph, ...updates } = body;
  void _pw; void _ap; void _aph;

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string") setSetting(key, value);
  }
  return NextResponse.json({ ok: true });
}
