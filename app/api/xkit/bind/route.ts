import { NextRequest, NextResponse } from "next/server";
import { normalizeUsername } from "@/lib/interactions/normalize";
import { createXKitSession, deleteXKitSession, getXKitSession } from "@/lib/xkit/session";
import { verifyXKitCredentials } from "@/lib/xkit/client";
import { getSettingValue } from "@/lib/app-config";

const SESSION_COOKIE = "nekocircle_xkit_session";
const SCREEN_NAME_RE = /^[A-Za-z0-9_]{1,15}$/;

function localBindingEnabled(request: NextRequest, requireOrigin = false): boolean {
  if (process.env.NODE_ENV !== "development" || process.env.XKIT_LOCAL_TEST !== "true") return false;
  const host = request.nextUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const origin = request.headers.get("origin");
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return isLoopback && (requireOrigin ? origin === request.nextUrl.origin : !origin || origin === request.nextUrl.origin);
}

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(request: NextRequest) {
  const enabled = getSettingValue("xkit_beta_visible") === "true";
  if (!enabled || !localBindingEnabled(request)) return json({ enabled, available: false, bound: false }, 200);
  const session = getXKitSession(request.cookies.get(SESSION_COOKIE)?.value);
  return json({
    enabled,
    available: true,
    bound: Boolean(session),
    ...(session ? { accountName: session.accountName, expiresAt: session.expiresAt } : {}),
  });
}

export async function POST(request: NextRequest) {
  if (getSettingValue("xkit_beta_visible") !== "true") return json({ error: "xkit_beta_disabled" }, 404);
  if (!localBindingEnabled(request, true)) return json({ error: "xkit_local_only" }, 403);
  try {
    const body = await request.json() as { screenName?: unknown; authToken?: unknown; ct0?: unknown };
    const screenName = typeof body.screenName === "string" ? normalizeUsername(body.screenName) : "";
    const authToken = typeof body.authToken === "string" ? body.authToken.trim() : "";
    const ct0 = typeof body.ct0 === "string" ? body.ct0.trim() : "";
    if (!SCREEN_NAME_RE.test(screenName) || !authToken || !ct0 || authToken.length > 512 || ct0.length > 512) {
      return json({ error: "xkit_invalid_input" }, 400);
    }

    const verification = await verifyXKitCredentials({ authToken, ct0 });
    if (!verification.ok) return json({ error: verification.reason === "auth_failed" ? "xkit_auth_failed" : "xkit_request_failed" }, 401);
    if (verification.accountName !== screenName) return json({ error: "xkit_account_mismatch" }, 403);

    const session = createXKitSession({ authToken, ct0 }, verification.accountName);
    const response = json({ bound: true, accountName: verification.accountName, expiresAt: session.expiresAt });
    response.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      path: "/api/xkit",
    });
    return response;
  } catch {
    // Request parsing and auth failures are deliberately generic; never log cookie-bearing errors.
    return json({ error: "xkit_request_failed" }, 400);
  }
}

export async function DELETE(request: NextRequest) {
  if (!localBindingEnabled(request, true)) return json({ error: "xkit_local_only" }, 403);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  deleteXKitSession(sessionId);
  const response = json({ bound: false });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/xkit",
    maxAge: 0,
  });
  return response;
}
