"use client";

import { useState } from "react";
import { proxiedImageSrc } from "@/lib/proxied-image-src";

type Props = {
  /** Yahoo の profileImage（小さめ・壊れていることがある） */
  previewUrl?: string | null;
  /** FixTweet 経由の高解像度アイコン */
  hdUrl?: string | null;
  /** 頭文字フォールバックに使うユーザー名 */
  name: string;
  imgClassName?: string;
  fallbackClassName?: string;
};

/**
 * SNS アイコン。
 *
 * Yahoo の profileImage（rts-pctr.c.yimg.jp）は、存在しないアイコンに対して
 * 404 ではなく「グレーのプレースホルダ画像を 200 で返す」ことがある。
 * 素の <img> でこれを読むと onError が発火せず、グレー円のまま固まってしまう。
 *
 * 同一オリジンの /api/image-proxy を経由すると、サーバー側は本当の 404 を
 * 受け取るので、こちらの onError が確実に発火する。
 * そこで preview → HD → 頭文字 の順に落としていく。
 */
export default function AvatarImage({
  previewUrl,
  hdUrl,
  name,
  imgClassName,
  fallbackClassName,
}: Props) {
  const [dead, setDead] = useState<string[]>([]);

  const candidates: string[] = [];
  for (const raw of [previewUrl, hdUrl]) {
    const v = raw?.trim();
    if (!v) continue;
    const src = proxiedImageSrc(v);
    if (!candidates.includes(src)) candidates.push(src);
  }

  const src = candidates.find((candidate) => !dead.includes(candidate));

  if (!src) {
    return <span className={fallbackClassName}>{name[0]?.toUpperCase()}</span>;
  }

  return (
    <img
      src={src}
      alt=""
      className={imgClassName}
      decoding="async"
      onError={() =>
        setDead((prev) => (prev.includes(src) ? prev : [...prev, src]))
      }
    />
  );
}