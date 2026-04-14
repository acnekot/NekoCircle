import type { Metadata } from "next";

type Props = { params: Promise<{ username: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, locale } = await params;
  const decoded = decodeURIComponent(username).replace(/^@+/, "");

  const titles: Record<string, string> = {
    zh: `${decoded} 的互动圈`,
    en: `${decoded}'s Interaction Circle`,
    ja: `${decoded} のサークル`,
  };
  const descriptions: Record<string, string> = {
    zh: `查看 @${decoded} 的 X 互动圈 - NekoCircle (Yahoo 搜索)`,
    en: `View @${decoded}'s X interaction circle - NekoCircle (Yahoo Search)`,
    ja: `@${decoded} の X インタラクションサークルを見る - NekoCircle (Yahoo 検索)`,
  };

  const title = titles[locale] ?? titles.zh;
  const description = descriptions[locale] ?? descriptions.zh;
  const ogImageUrl = `/api/og/circle?type=yahoo&screenName=${encodeURIComponent(decoded)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 1200,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function YahooLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
