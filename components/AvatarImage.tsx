"use client";

import { useState } from "react";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import { MONET_AVATAR_COLORS } from "@/lib/style";

type Props = {
  /** Yahoo 的 profileImage（尺寸小，且可能是坏的） */
  previewUrl?: string | null;
  /** 经 FixTweet 解析出的高清头像 */
  hdUrl?: string | null;
  /** 首字母兜底用的用户名 */
  name: string;
  imgClassName?: string;
  fallbackClassName?: string;
};

/**
 * SNS 头像。
 *
 * Yahoo 的 profileImage（rts-pctr.c.yimg.jp）对不存在的头像**不是返回 404**，
 * 而是「用 200 返回一张灰色占位图」。用裸 <img> 读它时 onError 不会触发，
 * 于是界面就定格在灰色圆圈上（实测浏览器事件：404+HTML → onerror；
 * 404+PNG → onload，naturalWidth=144）。
 *
 * 改走同源的 /api/image-proxy：服务端能拿到真正的 404，返回非图片响应，
 * 这样前端的 onError 才会可靠触发。于是可以按 preview → HD → 首字母 逐级回退。
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
  for (const raw of [
    previewUrl,
    hdUrl,
    `/api/avatar?username=${encodeURIComponent(name.replace(/^@+/, ""))}`,
  ]) {
    const v = raw?.trim();
    if (!v) continue;
    const src = proxiedImageSrc(v);
    if (!candidates.includes(src)) candidates.push(src);
  }

  const src = candidates.find((candidate) => !dead.includes(candidate));

  if (!src) {
    const seed = [...name].reduce((total, char) => total + char.codePointAt(0)!, 0);
    const backgroundColor = MONET_AVATAR_COLORS[seed % MONET_AVATAR_COLORS.length];
    return (
      <span
        className={fallbackClassName}
        style={{ backgroundColor, color: "#fffafc" }}
      >
        {name[0]?.toUpperCase()}
      </span>
    );
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
