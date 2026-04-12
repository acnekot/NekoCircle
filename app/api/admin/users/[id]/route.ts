import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { initDb, setUserSubscription } from "@/lib/db";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("neko_session")?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return payload?.role === "admin";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  initDb();
  const { id } = await params;
  const { subscribed } = await req.json();
  setUserSubscription(parseInt(id), Boolean(subscribed));
  return NextResponse.json({ ok: true });
}
