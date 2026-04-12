import { NextResponse } from "next/server";
import { initDb, getSetting, setSetting } from "@/lib/db";
import { hashPassword, verifyPassword, createAdminToken, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    initDb();
    const { password } = await req.json();
    if (!password)
      return NextResponse.json({ error: "缺少密码" }, { status: 400 });

    const stored = getSetting("admin_password_hash");

    // 首次设置：还没有管理员密码（bcrypt 哈希以 $2 开头）
    if (!stored || !stored.startsWith("$2")) {
      if (String(password).length < 6)
        return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
      const hash = await hashPassword(String(password));
      setSetting("admin_password_hash", hash);
      const token = await createAdminToken("admin");
      const res = NextResponse.json({ ok: true, firstTime: true });
      res.cookies.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ADMIN_COOKIE_MAX_AGE,
        path: "/",
      });
      return res;
    }

    // 正常登录：验证密码
    const ok = await verifyPassword(String(password), stored);
    if (!ok)
      return NextResponse.json({ error: "密码错误" }, { status: 401 });

    const token = await createAdminToken("admin");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ADMIN_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
