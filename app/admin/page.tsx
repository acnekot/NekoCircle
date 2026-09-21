"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";

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
  retention: {
    longTerm: number;
    temporary: number;
  };
  daily: { date: string; count: number }[];
  hourly: { hour: number; count: number }[];
  weekdayHour: number[][];
  topUsers: { username: string; count: number; last_at: number }[];
  sources: { source: string; count: number }[];
  sizeDistribution: { bucket: string; count: number }[];
  recent: {
    username: string;
    created_at: number;
    source: string;
    id: string | null;
    bytes: number | null;
    storage_consent: number | null;
  }[];
  storage: {
    path: string;
    bytes: number;
    tables: { name: string; label: string; rows: number }[];
  };
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatCST(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="card rounded-2xl p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={
          "mt-1.5 text-2xl font-bold tabular-nums " +
          (accent ? "text-[#1d9bf0]" : "text-white")
        }
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {hint && <span className="text-[11px] text-gray-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data/stats", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "读取失败");
      setStats(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dailyMax = stats ? Math.max(1, ...stats.daily.map((d) => d.count)) : 1;
  const hourlyMax = stats ? Math.max(1, ...stats.hourly.map((h) => h.count)) : 1;
  const heatMax = stats
    ? Math.max(1, ...stats.weekdayHour.flat())
    : 1;
  const topMax = stats ? Math.max(1, ...stats.topUsers.map((u) => u.count)) : 1;
  const sizeTotal = stats
    ? Math.max(
        1,
        stats.sizeDistribution.reduce((a, b) => a + b.count, 0),
      )
    : 1;

  return (
    <div className="gradient-bg min-h-screen py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <AdminNav />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && !stats && (
          <div className="card rounded-2xl p-10 text-center text-gray-500 text-sm">
            正在统计…
          </div>
        )}

        {stats && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              <Kpi label="累计生成" value={stats.totals.generations} accent />
              <Kpi label="独立用户" value={stats.totals.uniqueUsers} />
              <Kpi label="已存圈子" value={stats.totals.circles} />
              <Kpi label="长期保存" value={stats.retention.longTerm} sub="用户已授权" />
              <Kpi label="临时保存" value={stats.retention.temporary} sub="可不定期清理" />
              <Kpi label="今日" value={stats.totals.today} />
              <Kpi label="近 24 小时" value={stats.totals.last24h} />
              <Kpi label="近 7 天" value={stats.totals.last7d} />
            </div>

            {/* 日别推移 */}
            <Panel
              title="每日生成量"
              hint={`近 30 天 · ${stats.timezone} · 峰值 ${dailyMax}`}
            >
              <div className="flex items-end gap-1 h-36">
                {stats.daily.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 group relative flex flex-col justify-end h-full"
                    title={`${d.date}：${d.count} 次`}
                  >
                    <div
                      className={
                        "w-full rounded-t transition-colors " +
                        (d.count
                          ? "bg-[#1d9bf0]/70 group-hover:bg-[#1d9bf0]"
                          : "bg-white/5")
                      }
                      style={{
                        height: d.count
                          ? `${Math.max(3, (d.count / dailyMax) * 100)}%`
                          : "2px",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-gray-600 mt-2">
                <span>{stats.daily[0]?.date.slice(5)}</span>
                <span>{stats.daily[stats.daily.length - 1]?.date.slice(5)}</span>
              </div>
            </Panel>

            <div className="grid md:grid-cols-2 gap-6">
              {/* 时间带 */}
              <Panel title="时段分布" hint="近 30 天">
                <div className="flex items-end gap-[3px] h-28">
                  {stats.hourly.map((h) => (
                    <div
                      key={h.hour}
                      className="flex-1 group relative flex flex-col justify-end h-full"
                      title={`${h.hour} 时：${h.count} 次`}
                    >
                      <div
                        className={
                          "w-full rounded-t " +
                          (h.count ? "bg-emerald-400/60 group-hover:bg-emerald-400" : "bg-white/5")
                        }
                        style={{
                          height: h.count
                            ? `${Math.max(4, (h.count / hourlyMax) * 100)}%`
                            : "2px",
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-gray-600 mt-2">
                  <span>0 时</span>
                  <span>12 时</span>
                  <span>23 时</span>
                </div>
              </Panel>

              {/* 来源 */}
              <Panel title="数据来源" hint="累计">
                {stats.sources.length === 0 ? (
                  <div className="text-gray-600 text-sm">暂无数据</div>
                ) : (
                  <div className="space-y-3">
                    {stats.sources.map((s) => {
                      const max = Math.max(...stats.sources.map((x) => x.count), 1);
                      return (
                        <div key={s.source}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-300">{s.source}</span>
                            <span className="text-gray-500 tabular-nums">
                              {s.count} · {((s.count / stats.totals.generations) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-[#1d9bf0]/70 rounded-full"
                              style={{ width: `${(s.count / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>

            {/* 热力图 */}
            <Panel title="星期 × 时段" hint="近 60 天">
              <div className="overflow-x-auto">
                <div className="min-w-[560px]">
                  <div className="flex gap-[3px] mb-1 pl-8">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        className="flex-1 text-center text-[9px] text-gray-600"
                      >
                        {h % 6 === 0 ? h : ""}
                      </div>
                    ))}
                  </div>
                  {stats.weekdayHour.map((row, w) => (
                    <div key={w} className="flex gap-[3px] items-center mb-[3px]">
                      <div className="w-8 text-[11px] text-gray-500 shrink-0">
                        {WEEKDAYS[w]}
                      </div>
                      {row.map((c, h) => {
                        const t = c / heatMax;
                        return (
                          <div
                            key={h}
                            title={`${WEEKDAYS[w]} ${h} 时：${c} 次`}
                            className="flex-1 h-5 rounded-[3px] bg-[#1d9bf0]"
                            style={{ opacity: c ? 0.15 + t * 0.85 : 0.04 }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <div className="grid md:grid-cols-2 gap-6">
              {/* 排行 */}
              <Panel title="生成次数排行" hint="前 12 名">
                {stats.topUsers.length === 0 ? (
                  <div className="text-gray-600 text-sm">暂无数据</div>
                ) : (
                  <div className="space-y-2.5">
                    {stats.topUsers.map((u, i) => (
                      <div key={u.username} className="flex items-center gap-3">
                        <span className="w-5 text-[11px] text-gray-600 tabular-nums">
                          {i + 1}
                        </span>
                        <a
                          href={`https://twitter.com/${u.username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gray-300 hover:text-[#1d9bf0] w-28 truncate shrink-0"
                        >
                          @{u.username}
                        </a>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full bg-violet-400/70 rounded-full"
                            style={{ width: `${(u.count / topMax) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                          {u.count}
                        </span>
                        <span className="text-[10px] text-gray-600 w-20 text-right">
                          {formatCST(u.last_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* 体积分布 + 存储 */}
              <Panel title="圈子数据体积" hint={`共 ${stats.totals.circles} 个`}>
                <div className="space-y-2.5 mb-5">
                  {stats.sizeDistribution.map((b) => (
                    <div key={b.bucket} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-20 shrink-0">
                        {b.bucket}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-amber-400/70 rounded-full"
                          style={{ width: `${(b.count / sizeTotal) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                        {b.count}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/5 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">数据库文件</span>
                    <span className="text-gray-300 tabular-nums">
                      {formatBytes(stats.storage.bytes)}
                    </span>
                  </div>
                  {stats.storage.tables.map((t) => (
                    <div key={t.name} className="flex justify-between text-xs">
                      <span className="text-gray-500">{t.label}</span>
                      <span className="text-gray-300 tabular-nums">
                        {t.rows.toLocaleString()} 行
                      </span>
                    </div>
                  ))}
                  <div className="text-[10px] text-gray-700 font-mono break-all pt-1">
                    {stats.storage.path}
                  </div>
                </div>
              </Panel>
            </div>

            {/* 最近 */}
            <Panel title="最近的生成" hint="最新 12 条">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-600 text-left">
                      <th className="font-normal pb-2">用户</th>
                      <th className="font-normal pb-2">时间</th>
                      <th className="font-normal pb-2">来源</th>
                      <th className="font-normal pb-2">保存方式</th>
                      <th className="font-normal pb-2 text-right">数据量</th>
                      <th className="font-normal pb-2 text-right">圈子</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((r, i) => (
                      <tr key={`${r.username}-${r.created_at}-${i}`} className="border-t border-white/5">
                        <td className="py-2 text-gray-300">
                          <a
                            href={`https://twitter.com/${r.username}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[#1d9bf0]"
                          >
                            @{r.username}
                          </a>
                        </td>
                        <td className="py-2 text-gray-500">{formatCST(r.created_at)}</td>
                        <td className="py-2 text-gray-500">{r.source}</td>
                        <td className="py-2">
                          {r.id ? (
                            <span className={r.storage_consent === 1
                              ? "inline-flex rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300"
                              : "inline-flex rounded-full bg-amber-400/10 px-2 py-1 text-[10px] text-amber-300"
                            }>
                              {r.storage_consent === 1 ? "长期授权" : "临时保存"}
                            </span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        <td className="py-2 text-gray-500 text-right tabular-nums">
                          {r.bytes ? formatBytes(r.bytes) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          {r.id ? (
                            <Link
                              href={`/zh/circle/${r.id}`}
                              target="_blank"
                              className="text-[#1d9bf0] hover:underline"
                            >
                              查看
                            </Link>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span>
                统计时间 {new Date(stats.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
              </span>
              <button
                onClick={load}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 hover:text-white transition-colors disabled:opacity-40"
              >
                {loading ? "刷新中…" : "刷新"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
