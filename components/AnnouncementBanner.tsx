"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import Md3Icon, { type Md3IconName } from "@/components/Md3Icon";

type Announcement = {
  id: number;
  title: string;
  content: string;
  type: string; // 'info' | 'warning' | 'success'
  pinned: number;
  created_at: number;
};

const TYPE_CONFIG: Record<string, { border: string; bg: string; icon: Md3IconName; iconColor: string }> = {
  info:    { border: "border-blue-500/30",   bg: "bg-blue-500/5",   icon: "info",  iconColor: "text-blue-400" },
  warning: { border: "border-amber-500/30",  bg: "bg-amber-500/5",  icon: "warning",  iconColor: "text-amber-400" },
  success: { border: "border-green-500/30",  bg: "bg-green-500/5",  icon: "check",  iconColor: "text-green-400" },
};

function getDismissedIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem("dismissed_announcements");
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function addDismissedId(id: number) {
  const ids = getDismissedIds();
  ids.add(id);
  try {
    sessionStorage.setItem("dismissed_announcements", JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

export default function AnnouncementBanner() {
  const { locale, t } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDismissed(getDismissedIds());
    fetch(`/api/announcements?locale=${locale}`)
      .then((r) => r.json())
      .then((data: Announcement[]) => {
        if (Array.isArray(data)) setAnnouncements(data);
      })
      .catch(() => {});
  }, [locale]);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((a) => {
        const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.info;
        return (
          <div
            key={a.id}
            className={`relative rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-3 pr-10`}
          >
            {a.pinned === 1 && (
              <Md3Icon name="pin" className="absolute right-9 top-2 h-4 w-4 text-gray-600" />
            )}
            <button
              onClick={() => {
                addDismissedId(a.id);
                setDismissed((prev) => new Set(prev).add(a.id));
              }}
              className="absolute top-2.5 right-3 text-gray-600 hover:text-gray-300 transition-colors text-sm leading-none"
              title={t("common.close")}
            >
              <Md3Icon name="close" className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-2.5">
              <Md3Icon name={cfg.icon} className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white leading-snug">{a.title}</div>
                {a.content && (
                  <div className="text-xs text-gray-400 mt-1 leading-relaxed whitespace-pre-line">
                    {a.content}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
