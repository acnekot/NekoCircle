"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";

type Announcement = {
  id: number;
  title: string;
  content: string;
  type: string; // 'info' | 'warning' | 'success'
  pinned: number;
  created_at: number;
};

const TYPE_CONFIG: Record<string, { border: string; bg: string; icon: string; iconColor: string }> = {
  info:    { border: "border-blue-500/30",   bg: "bg-blue-500/5",   icon: "ℹ️",  iconColor: "text-blue-400" },
  warning: { border: "border-amber-500/30",  bg: "bg-amber-500/5",  icon: "⚠️",  iconColor: "text-amber-400" },
  success: { border: "border-green-500/30",  bg: "bg-green-500/5",  icon: "✅",  iconColor: "text-green-400" },
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
              <span className="absolute top-2 right-9 text-xs text-gray-600">📌</span>
            )}
            <button
              onClick={() => {
                addDismissedId(a.id);
                setDismissed((prev) => new Set(prev).add(a.id));
              }}
              className="absolute top-2.5 right-3 text-gray-600 hover:text-gray-300 transition-colors text-sm leading-none"
              title={t("common.close")}
            >
              ✕
            </button>
            <div className="flex items-start gap-2.5">
              <span className={`shrink-0 text-base leading-none mt-0.5 ${cfg.iconColor}`}>
                {cfg.icon}
              </span>
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
