"use client";

import { useEffect } from "react";
import Md3Icon from "@/components/Md3Icon";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="gradient-bg min-h-screen flex items-center justify-center px-4">
      <div className="card rounded-2xl p-8 max-w-md text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] bg-[#3c4278] text-[#bec2ff]"><Md3Icon name="sad" className="h-8 w-8" /></span>
        <h1 className="text-xl font-bold text-white">页面出现了问题</h1>
        <p className="mt-2 text-sm text-gray-500">请重试；如果问题持续发生，可返回首页重新生成。</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="btn-primary rounded-xl px-5 py-2 text-sm font-medium text-white">
            重试
          </button>
          <a href="/" className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm text-gray-300 hover:bg-white/10">
            返回首页
          </a>
        </div>
      </div>
    </main>
  );
}
