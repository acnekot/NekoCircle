import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// ─── 管理员 Cookie（独立系统，和用户完全分离）───
export const ADMIN_COOKIE_NAME   = "neko_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// ─── 普通用户 Cookie ───
export const USER_COOKIE_NAME   = "neko_user";
export const USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// 旧名保留兼容（middleware 清理用）
export const COOKIE_NAME   = "neko_session";

const getUserSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod"
  );

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

/** 创建普通用户 token */
export async function createUserToken(userId: number, username: string, subscribed = 0) {
  return new SignJWT({ sub: String(userId), usr: username, role: "user", subscribed })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getUserSecret());
}

/** 验证普通用户 token */
export async function verifyUserToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getUserSecret());
    return payload;
  } catch {
    return null;
  }
}

// ─── 兼容旧代码的别名（逐步废弃） ───
export const createToken = createUserToken;
export const verifyToken = verifyUserToken;
