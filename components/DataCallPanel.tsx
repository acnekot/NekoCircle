"use client";

import { useMemo, useState } from "react";
import Md3Icon from "@/components/Md3Icon";
import { useTranslation } from "@/components/LocaleProvider";
import type {
  InteractionDiagnosticEntry,
  InteractionDiagnostics,
} from "@/types/interaction";

const PAGE_SIZE = 30;

const TYPE_STYLES: Record<InteractionDiagnosticEntry["type"], string> = {
  reply: "border-sky-300/20 bg-sky-400/10 text-sky-200",
  quote: "border-violet-300/20 bg-violet-400/10 text-violet-200",
  mention: "border-pink-300/20 bg-pink-400/10 text-pink-200",
  repost: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
};

function formatDuration(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatTime(value: number | undefined, locale: string): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Intl.DateTimeFormat(
    locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "zh-CN",
    { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
  ).format(new Date(timestamp));
}

export default function DataCallPanel({ data }: { data: InteractionDiagnostics | null }) {
  const { locale, t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const entries = useMemo(
    () => (data?.entries ?? []).filter((entry) => filter === "all" || entry.direction === filter),
    [data?.entries, filter],
  );
  const visibleEntries = entries.slice(0, visibleCount);
  const timings = data?.timings;
  const hasData = Boolean(data && (data.stats || timings || data.entries));

  const changeFilter = (next: "all" | "inbound" | "outbound") => {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  };

  if (!hasData) {
    return (
      <div className="card tech-display-frame rounded-2xl p-8 text-center">
        <Md3Icon name="chart" className="mx-auto h-9 w-9 text-slate-500" />
        <p className="mt-3 text-sm text-slate-400">{t("calls.unavailable")}</p>
      </div>
    );
  }

  const summary = [
    [t("calls.uniqueTweets"), data?.counts?.mergedUniqueTweets],
    [t("calls.mergedEvents"), data?.stats?.mergedEvents],
    [t("calls.uniqueUsers"), data?.stats?.uniqueUsers],
    [t("calls.totalTime"), formatDuration(timings?.total)],
  ] as const;

  return (
    <div className="card tech-display-frame rounded-2xl p-4 sm:p-6">
      <div className="flex flex-col gap-2 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-white">
            <Md3Icon name="chart" className="h-5 w-5 text-[#bec2ff]" />
            {t("calls.title")}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{t("calls.subtitle")}</p>
        </div>
        {data?.dataVersion !== undefined && (
          <span className="hud-label self-start rounded-full border border-[#bec2ff]/15 bg-[#3c4278]/45 px-3 py-1 text-[#dfe0ff]">
            v{data.dataVersion}
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="tech-tabs flex flex-wrap gap-1">
          {(["all", "inbound", "outbound"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => changeFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "border border-[#bec2ff]/20 bg-[#3c4278] text-[#dfe0ff]"
                  : "border border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300"
              }`}
            >
              {t(`calls.filter.${key}`)}
            </button>
          ))}
        </div>
        <div className="text-xs tabular-nums text-slate-500">
          {t("calls.showing", { shown: Math.min(visibleCount, entries.length), total: entries.length })}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {visibleEntries.map((entry) => (
          <article
            key={`${entry.tweetId}-${entry.author}-${entry.target}-${entry.type}`}
            className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"
          >
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${TYPE_STYLES[entry.type]}`}>
                {t(`calls.type.${entry.type}`)}
              </span>
              <span className={`text-xs ${entry.direction === "inbound" ? "text-emerald-300" : "text-amber-200"}`}>
                {entry.direction === "inbound" ? "←" : "→"}
              </span>
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm text-slate-200">
                <span className="font-medium">@{entry.author}</span>
                <span className="mx-2 text-slate-600">→</span>
                <span className="font-medium">@{entry.target}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
                <span>{formatTime(entry.createdAt, locale)}</span>
                <span>·</span>
                <span>{entry.sources.join(" + ")}</span>
                <span>·</span>
                <span className="font-mono">{entry.tweetId}</span>
              </div>
              {entry.text && (
                <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-slate-400">
                  {entry.text}
                </p>
              )}
            </div>

            <a
              href={`https://x.com/i/web/status/${encodeURIComponent(entry.tweetId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-[#bec2ff]/25 hover:bg-[#3c4278]/45 hover:text-white"
            >
              {t("calls.open")}
              <Md3Icon name="open" className="h-3.5 w-3.5" />
            </a>
          </article>
        ))}
      </div>

      {visibleEntries.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
          {t("calls.empty")}
        </div>
      )}

      {visibleCount < entries.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10"
        >
          {t("calls.more")}
        </button>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-600">{t("calls.note")}</p>
    </div>
  );
}
