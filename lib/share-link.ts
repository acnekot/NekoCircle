const CANONICAL_SITE_ORIGIN = "https://circle.catsuki.cc";

/** Build a friend-shareable URL; local previews should not leak localhost links. */
export function getShareUrl(path: string, currentOrigin: string): string {
  const current = new URL(currentOrigin);
  const hostname = current.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
  return new URL(path, isLocal ? CANONICAL_SITE_ORIGIN : current.origin).toString();
}
