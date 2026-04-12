import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/** 管理员独立 secret，和用户 JWT 完全分离 */
const getAdminSecret = () =>
  new TextEncoder().encode(
    "neko-admin-" + (process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod") + "-isolated"
  );

const ADMIN_COOKIE = "neko_admin";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行管理员登录页和登录/状态 API
  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/"))   return NextResponse.next();

  // 非 admin 路由不拦截
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi  = pathname.startsWith("/api/admin");
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  // 只认 neko_admin cookie，用户的 neko_user / neko_session 无效
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) {
    if (isAdminApi) {
      return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, getAdminSecret());
    if (payload.role !== "admin") throw new Error("not admin");
    return NextResponse.next();
  } catch {
    if (isAdminApi) {
      return NextResponse.json({ error: "未登录或无权限" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/admin/login", req.url));
    res.cookies.delete(ADMIN_COOKIE);
    return res;
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
