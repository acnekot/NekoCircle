import { NextRequest, NextResponse } from "next/server";
import { verifyToken, USER_COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ ok: false });

  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ ok: false });

  return NextResponse.json({
    ok: true,
    username: payload.usr,
    subscribed: payload.subscribed === 1 || payload.subscribed === true,
    role: payload.role,
  });
}
