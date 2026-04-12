import { NextResponse } from "next/server";
import { getUserCount, createUser } from "@/lib/db";
import { hashPassword, createToken, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password)
      return NextResponse.json({ error: "缺少用户名或密码" }, { status: 400 });
    if (String(password).length < 6)
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });

    // Only allow registration if no users exist (first-time setup)
    const count = getUserCount();
    if (count > 0)
      return NextResponse.json({ error: "注册已关闭，请直接登录" }, { status: 403 });

    const hash = await hashPassword(String(password));
    const id   = createUser(String(username), hash);
    const token = await createToken(id, String(username));

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
