import { NextRequest, NextResponse } from "next/server";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";
import { normalizeUsername } from "@/lib/interactions/normalize";
import { getXKitSession } from "@/lib/xkit/session";
import { buildYahooPayload } from "@/lib/circle-payload";
import { getSettingValue } from "@/lib/app-config";

const SESSION_COOKIE = "nekocircle_xkit_session";
const SCREEN_NAME_RE = /^[A-Za-z0-9_]{1,15}$/;

export async function GET(request: NextRequest) {
  if (getSettingValue("xkit_beta_visible") !== "true") {
    return NextResponse.json({ error: "xkit_beta_unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.NODE_ENV !== "development" || process.env.XKIT_LOCAL_TEST !== "true") {
    return NextResponse.json({ error: "xkit_beta_unavailable" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const host = request.nextUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    return NextResponse.json({ error: "xkit_local_only" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const session = getXKitSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "xkit_not_bound" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let name: string;
  try {
    name = normalizeScreenName(request.nextUrl.searchParams.get("screenName") ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_screen_name" }, { status: 400 });
  }
  if (!SCREEN_NAME_RE.test(name)) return NextResponse.json({ error: "invalid_screen_name" }, { status: 400 });
  if (normalizeUsername(name) !== session.accountName) {
    return NextResponse.json({ error: "xkit_account_mismatch" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const payload = await buildYahooPayload(name, true, true, session.credentials);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "xkit_request_failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
