import zh from "@/messages/zh.json";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";

export const LOCALES = ["zh", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";

const messages: Record<Locale, Record<string, string>> = { zh, en, ja };

export function isLocale(s: string): s is Locale {
  return (LOCALES as readonly string[]).includes(s);
}

/** Detect locale from cookie → Accept-Language → default */
export function detectLocale(cookieLocale?: string, acceptLang?: string): Locale {
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  if (acceptLang) {
    for (const locale of LOCALES) {
      if (acceptLang.includes(locale)) return locale;
    }
  }
  return DEFAULT_LOCALE;
}

/** Create a t() function with {var} interpolation */
export function createT(locale: Locale) {
  const m = messages[locale] ?? messages.zh;
  return (key: string, vars?: Record<string, string | number>) => {
    let s = m[key] ?? messages.zh[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        s = s.replaceAll(`{${k}}`, String(v));
      });
    }
    return s;
  };
}

export function getMessages(locale: Locale) {
  return messages[locale] ?? messages.zh;
}
