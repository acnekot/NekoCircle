import { NextResponse } from "next/server";
import { initDb, getSetting } from "@/lib/db";

export async function GET() {
  initDb();
  const hash = getSetting("admin_password_hash");
  return NextResponse.json({ hasAdmin: !!hash });
}
