/** 统一用户名格式，便于跨数据源合并与去重。 */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}
