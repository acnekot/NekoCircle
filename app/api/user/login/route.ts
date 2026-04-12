import { NextResponse } from "next/server";
import { initDb, getUserByUsername } from "@/lib/db";
import { verifyPassword, createToken, USER_COOKIE_NAME, USER_COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    initDb();
    const { username, password } = await req.json();
    if (!username || !password)
      return NextResponse.json({ error: "缺少用户名或密码" }, { status: 400 });

    const user = getUserByUsername(String(username));
    if (!user)
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok)
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

    const subscribed = user.subscription === 1;
    const token = await createToken(user.id, user.username, user.role || "user", user.subscription ?? 0);
    const res = NextResponse.json({ ok: true, subscribed });
    res.cookies.set(USER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: USER_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
