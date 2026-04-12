import type { Metadata } from "next";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const decoded = decodeURIComponent(username).replace(/^@+/, "");
  const title = `${decoded} 的互动圈`;
  const description = `查看 @${decoded} 的 X 互动圈 - NekoCircle (Yahoo 搜索)`;
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
