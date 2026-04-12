import { timingSafeEqual } from "crypto";
import { getSetting } from "@/lib/db";

function normalizeToken(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function getIntegrationApiToken() {
  return normalizeToken(process.env.EXTERNAL_API_TOKEN) || normalizeToken(getSetting("integration_api_token"));
}

export function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function verifyIntegrationToken(req: Request) {
  const expected = getIntegrationApiToken();
  const provided = getBearerToken(req);

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
