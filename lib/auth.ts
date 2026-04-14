import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// ─── 管理员 Cookie（公告管理用）───
export const ADMIN_COOKIE_NAME   = "neko_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** 管理员使用独立 secret，即使 JWT_SECRET 泄露也无法伪造管理员 token */
const getAdminSecret = () =>
  new TextEncoder().encode(
    "neko-admin-" + (process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod") + "-isolated"
  );

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** 创建管理员 token（独立 secret） */
export async function createAdminToken(label: string) {
  return new SignJWT({ role: "admin", label })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getAdminSecret());
}

/** 验证管理员 token（独立 secret） */
export async function verifyAdminToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getAdminSecret());
    if (payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}
