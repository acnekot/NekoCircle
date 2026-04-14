import { NextResponse } from "next/server";
import { initDb, getSetting, setSetting } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    initDb();
    const { oldPassword, newPassword } = await req.json();

    if (!oldPassword || !newPassword)
      return NextResponse.json({ error: "请填写旧密码和新密码" }, { status: 400 });

    if (String(newPassword).length < 6)
      return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });

    const stored = getSetting("admin_password_hash");
    if (!stored || !stored.startsWith("$2"))
      return NextResponse.json({ error: "尚未设置管理员密码" }, { status: 400 });

    const ok = await verifyPassword(String(oldPassword), stored);
    if (!ok)
      return NextResponse.json({ error: "旧密码错误" }, { status: 401 });

    const hash = await hashPassword(String(newPassword));
    setSetting("admin_password_hash", hash);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
