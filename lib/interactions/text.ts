const MAX_EXCERPT_LENGTH = 180;

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (decimal) {
        const codePoint = Number.parseInt(decimal, 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      if (hexadecimal) {
        const codePoint = Number.parseInt(hexadecimal, 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      const replacements: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: " ",
        quot: '"',
      };
      return replacements[named?.toLowerCase() ?? ""] ?? entity;
    },
  );
}

/** 将公开推文正文清理成适合列表和持久化的短摘要。 */
export function normalizeInteractionText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  const characters = Array.from(normalized);
  if (characters.length <= MAX_EXCERPT_LENGTH) return normalized;
  return `${characters.slice(0, MAX_EXCERPT_LENGTH).join("")}…`;
}
