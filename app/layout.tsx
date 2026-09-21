import type { Metadata } from "next";
import { Aldrich } from "next/font/google";
import "./globals.css";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/m-plus-1-code";
import { metadataBaseFromEnv } from "@/lib/site-url";

const aldrich = Aldrich({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-aldrich",
});

export const metadata: Metadata = {
  // 相对路径的 OG 图靠它补全成公网地址。缺了它，分享出去的链接会指向
  // http://localhost:3000/...，抓取方拿不到预览图。见 lib/site-url.ts。
  metadataBase: metadataBaseFromEnv(),
  title: "X 互动圈生成器 — NekoCircle",
  description: "分析你的 X 互动圈，找出最活跃的互动用户",
  icons: {
    icon: "/assets/neko-logo.png",
    shortcut: "/assets/neko-logo.png",
    apple: "/assets/neko-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className={`${aldrich.variable} min-h-screen bg-gray-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
