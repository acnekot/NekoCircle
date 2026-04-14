"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { LOCALES, type Locale } from "@/lib/i18n";

const LABELS: Record<Locale, { flag: string; name: string }> = {
  zh: { flag: "🇨🇳", name: "中文" },
  en: { flag: "🇺🇸", name: "English" },
  ja: { flag: "🇯🇵", name: "日本語" },
};

export default function LanguageSwitcher() {
  const { locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const switchLocale = (target: Locale) => {
    if (target === locale) { setOpen(false); return; }
    // Set cookie (365 days)
    document.cookie = `neko_locale=${target};path=/;max-age=${365 * 86400};samesite=lax`;
    // Replace locale segment in URL
    const path = window.location.pathname;
    const segments = path.split("/");
    if (LOCALES.includes(segments[1] as Locale)) {
      segments[1] = target;
    } else {
      segments.splice(1, 0, target);
    }
    window.location.href = segments.join("/") || "/";
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        <span>{LABELS[locale].flag}</span>
        <span className="hidden sm:inline">{LABELS[locale].name}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-md shadow-xl overflow-hidden z-50">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => switchLocale(l)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                l === locale
                  ? "bg-[#1d9bf0]/15 text-[#1d9bf0]"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              <span>{LABELS[l].flag}</span>
              <span>{LABELS[l].name}</span>
              {l === locale && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
