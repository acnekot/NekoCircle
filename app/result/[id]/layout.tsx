import type { Metadata } from "next";
import { initDb, getAnalysis } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  let title = "X 互动圈";
  let description = "我的互动圈 - NekoCircle";
  let username = "";

  try {
    initDb();
    const row = getAnalysis(id);
    if (row) {
      username = row.display_name || row.username;
      title = `${username} 的互动圈`;
      description = `查看 @${row.username} 的 X 互动圈 - NekoCircle`;
    }
  } catch { /* fallback to defaults */ }

  const ogImageUrl = `/api/og/circle?type=twitter&id=${encodeURIComponent(id)}`;

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

export default function ResultLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
