"use client";
import { useEffect, useState, useRef } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/components/LocaleProvider";
import Md3Icon from "@/components/Md3Icon";

type Stats = {
  yahooCircleCount: number;
  yahooUniqueUsers: number;
  generationCounts: { yahoo: number; total: number };
  yahooDailyStats: { day: string; circles: number }[];
  totalGenerations: number;
  todayGenerations: number;
  todayCircles: number;
};

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    cancelAnimationFrame(raf.current);
    function step(now: number) {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * ease));
      if (p < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  const displayed = useCountUp(value);
  return (
    <div className="card rounded-[28px] p-6 flex flex-col gap-1">
      <div className={`text-3xl font-bold tabular-nums ${color}`}>
        {displayed.toLocaleString()}
      </div>
      <div className="text-sm text-gray-300 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const { locale, t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="md3-app-surface gradient-bg min-h-screen flex items-center justify-center">
      <div className="text-gray-500 text-sm animate-pulse">{t("stats.loading")}</div>
    </div>
  );

  if (!stats) return (
    <div className="md3-app-surface gradient-bg min-h-screen flex items-center justify-center">
      <div className="text-gray-500 text-sm">{t("stats.error")}</div>
    </div>
  );

  return (
    <div className="md3-app-surface gradient-bg min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="tech-panel rounded-[28px] p-5 sm:p-7 flex items-center justify-between gap-5">
          <div>
            <h1 className="flex items-center gap-3 text-3xl sm:text-4xl font-bold tracking-[-0.04em]"><Md3Icon name="chart" className="h-8 w-8 text-[#bec2ff]" />{t("stats.title")}</h1>
            <p className="text-[#c7c5cf] text-sm mt-2">{t("stats.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <a href={`/${locale}`} className="md3-tonal-button">{t("common.backHome")}</a>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Generation Summary */}
        <div className="card rounded-[28px] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Md3Icon name="globe" className="h-5 w-5 text-[#bec2ff]" />{t("stats.genOverview")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400 tabular-nums">{stats.generationCounts?.yahoo ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">{t("stats.yahooSearch")}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white tabular-nums">{stats.generationCounts?.total ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">{t("stats.totalLabel")}</div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard label={t("stats.yahooCircles")} value={stats.yahooCircleCount ?? 0} sub={t("stats.yahooUsersSub", { n: stats.yahooUniqueUsers ?? 0 })} color="text-[#f0b7d2]" />
          <StatCard label={t("stats.totalGen")} value={stats.generationCounts?.total ?? 0} color="text-[#bec2ff]" />
        </div>

        {/* Total generation stats */}
        <div className="card rounded-[28px] p-6">
          <h2 className="mb-5 flex items-center gap-2 text-base font-semibold"><Md3Icon name="trend" className="h-5 w-5 text-[#bec2ff]" />{t("stats.totalStats")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-[#34353b] border border-white/[0.04] py-4 px-3">
              <span className="text-xs text-gray-500">{t("stats.totalGenCount")}</span>
              <span className="text-2xl font-bold text-emerald-400 tabular-nums">{(stats.totalGenerations ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-[#34353b] border border-white/[0.04] py-4 px-3">
              <span className="text-xs text-gray-500">{t("stats.totalCircleCount")}</span>
              <span className="text-2xl font-bold text-blue-400 tabular-nums">{(stats.yahooCircleCount ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-[#34353b] border border-white/[0.04] py-4 px-3">
              <span className="text-xs text-gray-500">{t("stats.todayGen")}</span>
              <span className="text-2xl font-bold text-amber-400 tabular-nums">{(stats.todayGenerations ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-[#34353b] border border-white/[0.04] py-4 px-3">
              <span className="text-xs text-gray-500">{t("stats.todayCircle")}</span>
              <span className="text-2xl font-bold text-pink-400 tabular-nums">{(stats.todayCircles ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Unique users */}
        <div className="card rounded-[28px] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Md3Icon name="person" className="h-5 w-5 text-[#bec2ff]" />{t("stats.uniqueUsers")}</h2>
          <div className="flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold text-[#bec2ff] tabular-nums">{(stats.yahooUniqueUsers ?? 0).toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-2">{t("stats.uniqueUsersDesc")}</div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-700 pb-4">{t("stats.footer")}</p>
      </div>
    </div>
  );
}
