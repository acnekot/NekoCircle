/**
 * 站点的对外地址（用于 metadata 里相对路径的补全，尤其是 OG 图）。
 *
 * 为什么需要显式配置：应用只绑在 127.0.0.1（隧道回源），Next 无从得知公网域名，
 * 于是 `openGraph.images` 里的相对路径会被解析成 `http://localhost:3000/...`，
 * 结果是分享到 X / Telegram / Discord 时**没有预览图**——而且本地开发和线上
 * 都"看起来正常"，只有抓取方会失败。
 *
 * 取值顺序：SITE_URL → NEXT_PUBLIC_SITE_URL。都未配置时返回 undefined，
 * 此时保持 Next 的默认行为（仅本机开发可接受）。
 *
 * 与 middleware.ts 的 `originOf()` 同源：两者的根因都是「应用不知道自己的对外地址」。
 */
export function siteUrlFromEnv(): string | undefined {
  const raw = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return undefined;
  // 允许只写域名（circle.example.com），自动补 https
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** 供 `Metadata.metadataBase` 使用；配置缺失或非法时返回 undefined。 */
export function metadataBaseFromEnv(): URL | undefined {
  const value = siteUrlFromEnv();
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}