import { NextResponse } from "next/server";
import { initDb, getSetting } from "@/lib/db";
import { getUserInfo, setApiKeys } from "@/lib/twitter";

// Simple in-memory cache so we don't hammer the API
let cached: { url: string; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  // Return cached
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ url: cached.url });
  }

  try {
    initDb();
    const apiKey = getSetting("api_key");
    const apiKeysRaw = getSetting("api_keys");
    const extraKeys = apiKeysRaw ? apiKeysRaw.split(/[\n,]+/).map(k => k.trim()).filter(Boolean) : [];
    const allKeys = [apiKey, ...extraKeys].filter(Boolean);
    if (!allKeys.length) return NextResponse.json({ url: "" });

    setApiKeys(allKeys);
    const user = await getUserInfo("acnekot", allKeys[0]);
    const avatarUrl = user.profilePicture ?? "";
    if (avatarUrl) cached = { url: avatarUrl, ts: Date.now() };
    return NextResponse.json({ url: avatarUrl });
  } catch {
    return NextResponse.json({ url: "" });
  }
}
