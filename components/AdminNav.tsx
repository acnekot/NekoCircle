"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "概览", exact: true },
  { href: "/admin/settings", label: "参数设置" },
  { href: "/admin/announcements", label: "公告" },
  { href: "/admin/feedback", label: "反馈" },
  { href: "/admin/data", label: "数据导出 / 导入" },
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const handleLogout = () => {
    document.cookie = "neko_admin=; path=/; max-age=0";
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Image
            src="/assets/neko-logo.png"
            alt=""
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-xl border border-[#bec2ff]/20 object-cover shadow-lg shadow-black/20"
          />
          <h1 className="text-lg font-bold text-white">NekoCircle 管理后台</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/zh"
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors"
          >
            返回主页
          </Link>
          <Link
            href="/zh/stats"
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors"
          >
            服务状态
          </Link>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
        {LINKS.map((l) => {
          const active = isActive(l.href, "exact" in l ? l.exact : false);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                "px-3.5 py-2 rounded-lg text-sm font-medium transition-colors " +
                (active
                  ? "bg-[#1d9bf0] text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5")
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
