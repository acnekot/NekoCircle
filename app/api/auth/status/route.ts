import { NextResponse } from "next/server";
import { getUserCount } from "@/lib/db";
import { initDb } from "@/lib/db";

export async function GET() {
  initDb();
  const count = getUserCount();
  return NextResponse.json({ hasUsers: count > 0 });
}
