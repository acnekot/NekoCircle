import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { LOCALES, DEFAULT_LOCALE, isLocale } from "@/lib/i18n";

export default async function RootPage() {
  // 1. Cookie preference
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("neko_locale")?.value;
  if (cookieLocale && isLocale(cookieLocale)) redirect(`/${cookieLocale}`);

  // 2. Accept-Language header
  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  for (const locale of LOCALES) {
    if (accept.includes(locale)) redirect(`/${locale}`);
  }

  // 3. Default
  redirect(`/${DEFAULT_LOCALE}`);
}
