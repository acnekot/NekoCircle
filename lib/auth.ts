import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME   = "neko_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const USER_COOKIE_NAME   = "neko_user";
export const USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const getSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ?? "neko-circle-secret-change-in-prod"
  );

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createToken(userId: number, username: string, role = "user", subscribed = 0) {
  return new SignJWT({ sub: String(userId), usr: username, role, subscribed })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(role === "admin" ? "7d" : "30d")
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}
