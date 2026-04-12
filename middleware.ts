import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (!pathname.startsWith("/admin"))      return NextResponse.next();

  const token = req.cookies.get("neko_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") {
      const res = NextResponse.redirect(new URL("/admin/login", req.url));
      res.cookies.delete("neko_session");
      return res;
    }
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/admin/login", req.url));
    res.cookies.delete("neko_session");
    return res;
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
