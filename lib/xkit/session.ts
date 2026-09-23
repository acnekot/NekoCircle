import { randomBytes } from "node:crypto";

export type XKitCredentials = { authToken: string; ct0: string };
type BoundSession = {
  credentials: XKitCredentials;
  accountName: string;
  expiresAt: number;
  expiryTimer: ReturnType<typeof setTimeout>;
};

const SESSION_TTL_MS = 60 * 60 * 1000;
const sessions = new Map<string, BoundSession>();

export function createXKitSession(credentials: XKitCredentials, accountName: string, now = Date.now()): {
  id: string;
  expiresAt: number;
} {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) deleteXKitSession(id);
  }
  const id = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;
  const expiryTimer = setTimeout(() => { deleteXKitSession(id); }, SESSION_TTL_MS);
  expiryTimer.unref?.();
  sessions.set(id, { credentials, accountName, expiresAt, expiryTimer });
  return { id, expiresAt };
}

export function getXKitSession(id: string | undefined, now = Date.now()): BoundSession | undefined {
  if (!id) return undefined;
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.expiresAt <= now) {
    deleteXKitSession(id);
    return undefined;
  }
  return session;
}

export function deleteXKitSession(id: string | undefined): void {
  if (!id) return;
  const session = sessions.get(id);
  if (session) clearTimeout(session.expiryTimer);
  sessions.delete(id);
}

export function clearXKitSessionsForTests(): void {
  for (const session of sessions.values()) clearTimeout(session.expiryTimer);
  sessions.clear();
}
