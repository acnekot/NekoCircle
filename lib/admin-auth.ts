/**
 * 管理后台的鉴权工具。
 *
 * 这个文件必须保持「零依赖」：既被 Edge 运行时 的 middleware.ts 引用，
 * 也被 Node 运行时的路由处理引用，因此不能引入 lib/db 之类的服务端专属模块。
 */
import { jwtVerify } from "jose";

export const ADMIN_COOKIE = "neko_admin";

export function getAdminSecret(): Uint8Array {
  return new TextEncoder().encode(
    "neko-admin-" +
      (process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod") +
      "-isolated",
  );
}

/** 校验管理后台的 JWT。任何异常都视为未登录。 */
export async function verifyAdminToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getAdminSecret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}