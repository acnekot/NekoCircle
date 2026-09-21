"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Md3Icon from "@/components/Md3Icon";
import { useTranslation } from "@/components/LocaleProvider";

type Stats = {
  generatedAt: string;
  timezone: string;
  totals: {
    circles: number;
    generations: number;
    uniqueUsers: number;
    today: number;
    last24h: number;
    last7d: number;
  };
  retention: { longTerm: number; temporary: number };
  daily: { date: string; count: number }[];
  hourly: { hour: number; count: number }[];
  weekdayHour: number[][];
  sources: { source: string; count: number }[];
  sizeDistribution: { bucket: string; count: number }[];
  storage: { bytes: number };
};

const COPY = {
  zh: {
    title: "服务状态",
    subtitle: "公开、实时的 NekoCircle 运行与数据概览",
    total: "累计生成", users: "独立用户", circles: "已存圈子",
    longTerm: "长期保存", temporary: "临时保存", today: "今日",
    last24h: "近 24 小时", last7d: "近 7 天", authorized: "用户已授权",
    cleanup: "按保留策略清理", daily: "每日生成量", hourly: "时段分布",
    source: "数据来源", heat: "星期 × 时段", size: "圈子数据体积",
    storage: "数据库占用", days30: "近 30 天", days60: "近 60 天",
    cumulative: "累计", refresh: "刷新", refreshing: "刷新中…",
    updated: "更新时间", loading: "正在读取服务状态…", error: "状态读取失败",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
  },
  en: {
    title: "Service status",
    subtitle: "Public, live overview of NekoCircle activity and storage",
    total: "Generations", users: "Unique users", circles: "Stored circles",
    longTerm: "Long-term", temporary: "Temporary", today: "Today",
    last24h: "Last 24 hours", last7d: "Last 7 days", authorized: "User approved",
    cleanup: "Retention cleanup", daily: "Daily generations", hourly: "Hourly activity",
    source: "Data sources", heat: "Weekday × hour", size: "Circle payload sizes",
    storage: "Database storage", days30: "Last 30 days", days60: "Last 60 days",
    cumulative: "All time", refresh: "Refresh", refreshing: "Refreshing…",
    updated: "Updated", loading: "Loading service status…", error: "Could not load status",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  ja: {
    title: "サービス状況",
    subtitle: "NekoCircle の稼働状況とデータをリアルタイムで公開",
    total: "累計生成", users: "ユニークユーザー", circles: "保存サークル",
    longTerm: "長期保存", temporary: "一時保存", today: "今日",
    last24h: "過去 24 時間", last7d: "過去 7 日", authorized: "ユーザー許可済み",
    cleanup: "保持ポリシーで削除", daily: "日別生成数", hourly: "時間帯分布",
    source: "データソース", heat: "曜日 × 時間", size: "サークルデータ容量",
    storage: "DB 使用量", days30: "過去 30 日", days60: "過去 60 日",
    cumulative: "累計", refresh: "更新", refreshing: "更新中…",
    updated: "更新日時", loading: "サービス状況を読み込み中…", error: "状況を取得できません",
    weekdays: ["日", "月", "火", "水", "木", "金", "土"],
  },
} as const;

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function Kpi({ label, value, sub, accent = false }: {
  label: string; value: number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="card rounded-[22px] p-4">
      <div className="text-xs text-[#8f8e98]">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accent ? "text-[#bec2ff]" : "text-white"}`}>
        {value.toLocaleString()}
      </div>
      {sub && <div className="mt-1 text-[10px] text-[#74737d]">{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card rounded-[28px] p-5 sm:p-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {hint && <span className="text-[11px] text-[#74737d]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const { locale } = useTranslation();
  const copy = COPY[locale];
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/stats", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || copy.error);
      setStats(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error]);

  useEffect(() => { load(); }, [load]);

  const dailyMax = stats ? Math.max(1, ...stats.daily.map((item) => item.count)) : 1;
  const hourlyMax = stats ? Math.max(1, ...stats.hourly.map((item) => item.count)) : 1;
  const heatMax = stats ? Math.max(1, ...stats.weekdayHour.flat()) : 1;
  const sizeTotal = stats ? Math.max(1, stats.sizeDistribution.reduce((sum, item) => sum + item.count, 0)) : 1;

  return (
    <main className="md3-app-surface gradient-bg min-h-screen px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href={`/${locale}`} className="flex items-center gap-3">
            <Image src="/assets/neko-logo.png" alt="" width={44} height={44} className="h-11 w-11 rounded-2xl object-cover" priority />
            <span>
              <b className="block text-base text-white">NekoCircle</b>
              <small className="text-[10px] uppercase tracking-[0.16em] text-[#8f8e98]">service status</small>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href={`/${locale}`} className="inline-flex min-h-10 items-center rounded-full px-4 text-xs text-[#bec2ff] hover:bg-white/5">
              {locale === "zh" ? "返回主页" : locale === "ja" ? "ホームへ" : "Home"}
            </Link>
            <LanguageSwitcher />
          </div>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-4 pb-2 pt-6">
          <div>
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3c4278] text-[#dfe0ff]">
              <Md3Icon name="chart" className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-bold tracking-[-0.05em] text-white sm:text-5xl">{copy.title}</h1>
            <p className="mt-3 text-sm text-[#a9a7b1]">{copy.subtitle}</p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#34353b] px-5 text-xs text-[#e5e1e9] transition hover:bg-[#414249] disabled:opacity-50">
            <Md3Icon name="restart" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? copy.refreshing : copy.refresh}
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {loading && !stats && <div className="card rounded-[28px] p-12 text-center text-sm text-[#8f8e98]">{copy.loading}</div>}

        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <Kpi label={copy.total} value={stats.totals.generations} accent />
              <Kpi label={copy.users} value={stats.totals.uniqueUsers} />
              <Kpi label={copy.circles} value={stats.totals.circles} />
              <Kpi label={copy.longTerm} value={stats.retention.longTerm} sub={copy.authorized} />
              <Kpi label={copy.temporary} value={stats.retention.temporary} sub={copy.cleanup} />
              <Kpi label={copy.today} value={stats.totals.today} />
              <Kpi label={copy.last24h} value={stats.totals.last24h} />
              <Kpi label={copy.last7d} value={stats.totals.last7d} />
            </div>

            <Panel title={copy.daily} hint={`${copy.days30} · ${stats.timezone}`}>
              <div className="flex h-40 items-end gap-1">
                {stats.daily.map((item) => (
                  <div key={item.date} className="group flex h-full flex-1 flex-col justify-end" title={`${item.date}: ${item.count}`}>
                    <div className={item.count ? "w-full rounded-t bg-[#bec2ff]/65 group-hover:bg-[#bec2ff]" : "h-0.5 w-full bg-white/5"} style={item.count ? { height: `${Math.max(4, item.count / dailyMax * 100)}%` } : undefined} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[#74737d]"><span>{stats.daily[0]?.date.slice(5)}</span><span>{stats.daily.at(-1)?.date.slice(5)}</span></div>
            </Panel>

            <div className="grid gap-6 md:grid-cols-2">
              <Panel title={copy.hourly} hint={copy.days30}>
                <div className="flex h-28 items-end gap-[3px]">
                  {stats.hourly.map((item) => (
                    <div key={item.hour} className="group flex h-full flex-1 flex-col justify-end" title={`${item.hour}:00 · ${item.count}`}>
                      <div className={item.count ? "w-full rounded-t bg-[#73dda0]/65 group-hover:bg-[#73dda0]" : "h-0.5 w-full bg-white/5"} style={item.count ? { height: `${Math.max(4, item.count / hourlyMax * 100)}%` } : undefined} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-[#74737d]"><span>0</span><span>12</span><span>23</span></div>
              </Panel>

              <Panel title={copy.source} hint={copy.cumulative}>
                <div className="space-y-4">
                  {stats.sources.map((item) => {
                    const max = Math.max(1, ...stats.sources.map((source) => source.count));
                    return <div key={item.source}>
                      <div className="mb-1.5 flex justify-between text-xs"><span>{item.source}</span><span className="text-[#8f8e98]">{item.count.toLocaleString()}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[#bec2ff]" style={{ width: `${item.count / max * 100}%` }} /></div>
                    </div>;
                  })}
                </div>
              </Panel>
            </div>

            <Panel title={copy.heat} hint={copy.days60}>
              <div className="overflow-x-auto">
                <div className="min-w-[620px] space-y-1">
                  {stats.weekdayHour.map((row, weekday) => (
                    <div key={weekday} className="flex items-center gap-1">
                      <span className="w-10 shrink-0 text-[10px] text-[#8f8e98]">{copy.weekdays[weekday]}</span>
                      {row.map((count, hour) => <div key={hour} title={`${copy.weekdays[weekday]} ${hour}:00 · ${count}`} className="h-6 flex-1 rounded bg-[#bec2ff]" style={{ opacity: count ? 0.16 + count / heatMax * 0.84 : 0.035 }} />)}
                    </div>
                  ))}
                  <div className="flex justify-between pl-11 text-[10px] text-[#74737d]"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
              <Panel title={copy.size} hint={`${stats.totals.circles.toLocaleString()} ${copy.circles.toLowerCase()}`}>
                <div className="space-y-3">
                  {stats.sizeDistribution.map((item) => <div key={item.bucket} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-[#a9a7b1]">{item.bucket}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[#f0b7d2]" style={{ width: `${item.count / sizeTotal * 100}%` }} /></div>
                    <span className="w-8 text-right text-xs tabular-nums text-[#8f8e98]">{item.count}</span>
                  </div>)}
                </div>
              </Panel>
              <Panel title={copy.storage} hint={copy.cumulative}>
                <div className="text-4xl font-bold tracking-[-0.05em] text-[#bec2ff]">{formatBytes(stats.storage.bytes)}</div>
                <p className="mt-3 text-xs leading-6 text-[#8f8e98]">{stats.retention.longTerm.toLocaleString()} {copy.longTerm.toLowerCase()} · {stats.retention.temporary.toLocaleString()} {copy.temporary.toLowerCase()}</p>
              </Panel>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 pb-6 text-[11px] text-[#74737d]">
              <span>{copy.updated} {new Date(stats.generatedAt).toLocaleString(locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US", { hour12: false })}</span>
              <span>{stats.timezone}</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
