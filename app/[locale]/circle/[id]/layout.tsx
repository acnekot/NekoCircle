import type { Metadata } from "next";
import { initDb, getYahooCircle } from "@/lib/db";
import { parseYahooCircleData } from "@/lib/circle-convert";

export const runtime = "nodejs";

type Props = { params: Promise<{ id: string; locale: string }> };

/**
 * 共有リンク（/zh/circle/<id>）用のメタデータ。
 *
 * 保存済みの圈子から作るので、カードの内容とページの内容が必ず一致する。
 * ここでライブ取得するとページ（保存済みを表示）とズレるため、あくまで
 * DB の値だけを使い、取得に失敗しても描画は止めない。
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;

  let screenName = "";
  let toYou = 0;
  let fromYou = 0;
  let people = 0;
  try {
    initDb();
    const row = getYahooCircle(id);
    if (row) {
      const parsed = parseYahooCircleData(row.circle_data);
      screenName = parsed.screenName || row.username || "";
      toYou = parsed.counts.toYou;
      fromYou = parsed.counts.fromYou;
      people =
        parsed.analysisResult.topUsers.length || parsed.circleUsers.length;
    }
  } catch {
    // メタデータが作れなくてもページ描画は続行させる
  }

  const name = screenName || "X";
  const titles: Record<string, string> = {
    zh: `${name} 的互动圈`,
    en: `${name}'s Interaction Circle`,
    ja: `${name} のサークル`,
  };
  const descriptions: Record<string, string> = {
    zh: `@${name} 的 X 互动圈：${people} 人 · 收到 ${toYou} 条 / 发出 ${fromYou} 条互动 - NekoCircle`,
    en: `@${name}'s X interaction circle: ${people} people · ${toYou} received / ${fromYou} sent - NekoCircle`,
    ja: `@${name} の X インタラクションサークル：${people} 人 · 受信 ${toYou} / 送信 ${fromYou} - NekoCircle`,
  };
  const title = titles[locale] ?? titles.zh;
  const description = descriptions[locale] ?? descriptions.zh;
  const ogImageUrl = `/api/og/circle?type=yahoo&circleId=${encodeURIComponent(id)}`;

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

export default function CircleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}