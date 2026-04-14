import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X 互动圈生成器 — NekoCircle",
  description: "分析你的 X 互动圈，找出最活跃的互动用户",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
