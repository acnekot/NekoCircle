import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行管理员登录页和登录/注册/状态 API
  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/"))   return NextResponse.next();

  // 非 admin 路由不拦截
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi  = pathname.startsWith("/api/admin");
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const token = req.cookies.get("neko_session")?.value;
  if (!token) {
    if (isAdminApi) {
      return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "admin") {
      if (isAdminApi) {
        return NextResponse.json({ error: "未登录或无权限" }, { status: 403 });
      }
      const res = NextResponse.redirect(new URL("/admin/login", req.url));
      res.cookies.delete("neko_session");
      return res;
    }
    return NextResponse.next();
  } catch {
    if (isAdminApi) {
      return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/admin/login", req.url));
    res.cookies.delete("neko_session");
    return res;
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
