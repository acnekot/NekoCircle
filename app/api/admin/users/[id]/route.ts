import { NextResponse } from "next/server";
import { initDb, setUserSubscription } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  initDb();
  const { id } = await params;
  const { subscribed } = await req.json();
  setUserSubscription(parseInt(id), Boolean(subscribed));
  return NextResponse.json({ ok: true });
}
