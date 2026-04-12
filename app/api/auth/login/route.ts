import { NextResponse } from "next/server";
import { getUserByUsername } from "@/lib/db";
import { verifyPassword, createToken, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password)
      return NextResponse.json({ error: "缺少用户名或密码" }, { status: 400 });

    const user = getUserByUsername(String(username));
    if (!user)
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok)
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

    // 仅允许 admin 角色通过管理后台登录
    if (user.role !== "admin")
      return NextResponse.json({ error: "该账号无管理员权限" }, { status: 403 });

    const token = await createToken(user.id, user.username, user.role);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
