import { NextResponse } from "next/server";
import { initDb, getUserByUsername, createUser } from "@/lib/db";
import { hashPassword, createToken, USER_COOKIE_NAME, USER_COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    initDb();
    const { username, password, email = "" } = await req.json();
    if (!username || !password)
      return NextResponse.json({ error: "缺少用户名或密码" }, { status: 400 });
    if (String(password).length < 6)
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });

    const existing = getUserByUsername(String(username));
    if (existing)
      return NextResponse.json({ error: "用户名已存在" }, { status: 409 });

    const hash = await hashPassword(String(password));
    const id = createUser(String(username), hash, String(email), "user");

    const token = await createToken(id, String(username), "user", 0);
    const res = NextResponse.json({ ok: true });
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
