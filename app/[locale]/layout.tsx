import { LocaleProvider } from "@/components/LocaleProvider";
import { isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { notFound } from "next/navigation";
import "@/app/globals.css";

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const titles: Record<string, string> = {
    zh: "推特互动圈生成器 — NekoCircle",
    en: "Twitter Interaction Circle Generator — NekoCircle",
    ja: "Twitter インタラクションサークル — NekoCircle",
  };
  const descriptions: Record<string, string> = {
    zh: "分析你的推特互动圈，找出最活跃的互动用户",
    en: "Analyze your Twitter interaction circle and find the most active users",
    ja: "Twitter のインタラクションサークルを分析して、最もアクティブなユーザーを見つけましょう",
  };
  return {
    title: titles[locale] ?? titles.zh,
    description: descriptions[locale] ?? descriptions.zh,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <LocaleProvider locale={locale as Locale}>{children}</LocaleProvider>
  );
}
