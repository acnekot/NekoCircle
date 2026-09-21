"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Md3Icon from "@/components/Md3Icon";

const LINKS = [
  { href: "/admin", label: "概览", exact: true },
  { href: "/admin/announcements", label: "公告" },
  { href: "/admin/feedback", label: "反馈" },
  { href: "/admin/data", label: "数据导出 / 导入" },
  { href: "/admin/settings", label: "参数设置" },
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
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#3c4278] text-[#bec2ff]"><Md3Icon name="pet" className="h-5 w-5" /></span>
          <h1 className="text-lg font-bold text-white">NekoCircle 管理后台</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors"
        >
          退出登录
        </button>
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
