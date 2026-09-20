import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";

/* ────────────── i18n constants (duplicated to avoid importing from lib) ──────────────── */
const LOCALES = ["zh", "en", "ja"] as const;
type Locale = (typeof LOCALES)[number];
const DEFAULT_LOCALE: Locale = "zh";

function isLocale(s: string): s is Locale {
  return (LOCALES as readonly string[]).includes(s);
}

function detectLocale(req: NextRequest): Locale {
  // 1. Cookie
  const cookieLocale = req.cookies.get("neko_locale")?.value;
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  // 2. Accept-Language
  const accept = req.headers.get("accept-language") ?? "";
  for (const locale of LOCALES) {
    if (accept.includes(locale)) return locale;
  }
  return DEFAULT_LOCALE;
}

/* ────────────── Public origin ──────────────── */
// Next builds `req.url` from the address the server is bound to (127.0.0.1:3000),
// not from the incoming Host header, so a redirect based on `req.url` leaks
// `localhost` to public visitors behind the Cloudflare tunnel. Prefer the
// forwarded host/proto that the tunnel sets, and fall back to Host, then req.url.
function originOf(req: NextRequest): string {
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = fwdHost || req.headers.get("host") || req.nextUrl.host;
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = fwdProto || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/* ────────────── Admin auth ──────────────── */

async function handleAdminAuth(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API
  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/"))   return NextResponse.next();

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi  = pathname.startsWith("/api/admin");

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) {
    if (isAdminApi) {
      return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", originOf(req)));
  }

  if (await verifyAdminToken(token)) return NextResponse.next();

  // Invalid token: APIs get 401, pages get bounced to the login screen.
  if (isAdminApi) {
    return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
  }
  const res = NextResponse.redirect(new URL("/admin/login", originOf(req)));
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}

/* ────────────── Main middleware ──────────────── */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Static assets / API / admin — skip locale logic
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/admin")
  ) {
    // Handle admin auth for admin routes
    const isAdminPage = pathname.startsWith("/admin");
    const isAdminApi  = pathname.startsWith("/api/admin");
    if (isAdminPage || isAdminApi) {
      return handleAdminAuth(req);
    }
    return NextResponse.next();
  }

  // 2. Already has locale prefix? Pass through
  const segments = pathname.split("/");
  if (segments.length >= 2 && isLocale(segments[1])) {
    return NextResponse.next();
  }

  // 3. Root path "/" → redirect to /{locale}
  if (pathname === "/") {
    const locale = detectLocale(req);
    return NextResponse.redirect(new URL(`/${locale}`, originOf(req)));
  }

  // 4. Non-locale-prefixed paths (e.g., /circle/abc, /yahoo/user, /stats)
  //    Redirect to /{locale}{pathname}{search}
  const locale = detectLocale(req);
  const url = new URL(`/${locale}${pathname}${req.nextUrl.search}`, originOf(req));
  return NextResponse.redirect(url);
}

export const config = {
  // `api/admin/data/import` is excluded on purpose: middleware buffers the
  // request body, and POSTs above roughly 10MB arrive at the route corrupted
  // (measured: 11MB and 17MB both failed to parse as JSON, while the same
  // build without middleware handled 17MB fine). That route authenticates
  // itself with verifyAdminToken instead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/admin/data/import|.*\\..*).*)"],
};
