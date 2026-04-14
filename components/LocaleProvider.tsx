"use client";

import { createContext, useContext, useMemo } from "react";
import { createT, type Locale, DEFAULT_LOCALE } from "@/lib/i18n";

type I18nCtx = { locale: Locale; t: ReturnType<typeof createT> };

const Ctx = createContext<I18nCtx>({
  locale: DEFAULT_LOCALE,
  t: createT(DEFAULT_LOCALE),
});

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: createT(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTranslation() {
  return useContext(Ctx);
}
