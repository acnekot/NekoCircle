import { NextResponse } from "next/server";
import { initDb, listUsers } from "@/lib/db";

export async function GET() {
  initDb();
  const users = listUsers();
  // Don't expose password hashes
  return NextResponse.json(
    users.map(({ password_hash: _, ...u }) => u)
  );
}
