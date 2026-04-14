"use client";
import { useEffect, useState, useRef } from "react";

type Stats = {
  yahooCircleCount: number;
  yahooUniqueUsers: number;
  generationCounts: { yahoo: number; total: number };
  yahooDailyStats: { day: string; circles: number }[];
  genDailyStats: { day: string; total: number }[];
  topYahooUsers: { username: string; count: number }[];
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
    <div className="card rounded-2xl p-6 flex flex-col gap-1">
      <div className={`text-3xl font-bold tabular-nums ${color}`}>
        {displayed.toLocaleString()}
      </div>
      <div className="text-sm text-gray-300 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="gradient-bg min-h-screen flex items-center justify-center">
      <div className="text-gray-500 text-sm animate-pulse">加载中…</div>
    </div>
  );

  if (!stats) return (
    <div className="gradient-bg min-h-screen flex items-center justify-center">
      <div className="text-gray-500 text-sm">数据加载失败</div>
    </div>
  );

  const maxGenDaily = Math.max(...(stats.genDailyStats ?? []).map(d => d.total), 1);

  return (
    <div className="gradient-bg min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">📊 数据统计</h1>
            <p className="text-gray-500 text-sm mt-1">NekoCircle 运营数据概览</p>
          </div>
          <a href="/" className="text-gray-500 hover:text-white text-sm transition-colors">← 返回首页</a>
        </div>

        {/* Generation Summary */}
        <div className="card rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-4">🌐 圈子生成总览</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400 tabular-nums">{stats.generationCounts?.yahoo ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">🟢 Yahoo 搜索</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white tabular-nums">{stats.generationCounts?.total ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">📊 总计</div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Yahoo 圈子" value={stats.yahooCircleCount ?? 0} sub={`${stats.yahooUniqueUsers ?? 0} 位用户`} color="text-green-400" />
          <StatCard label="总生成次数" value={stats.generationCounts?.total ?? 0} color="text-emerald-400" />
        </div>

        {/* Daily generation chart */}
        {stats.genDailyStats && stats.genDailyStats.length > 0 && (
          <div className="card rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-5">近 7 天生成趋势</h2>
            <div className="flex items-end gap-2 h-32">
              {stats.genDailyStats.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-white font-mono font-bold">{d.total || ""}</div>
                  <div
                    className="w-full bg-emerald-500/80 rounded-t transition-all duration-700"
                    style={{ height: `${Math.max(8, (d.total / maxGenDaily) * 96)}px` }}
                    title={`${d.total} 次生成`}
                  />
                  <div className="text-xs text-gray-600 text-center leading-tight">
                    {d.day.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Yahoo users */}
        {stats.topYahooUsers && stats.topYahooUsers.length > 0 && (
          <div className="card rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4">🟢 最活跃用户</h2>
            <div className="space-y-2">
              {stats.topYahooUsers.map((u, i) => (
                <div key={u.username} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 hover:bg-white/5 transition-colors">
                  <span className={`text-xs font-bold w-5 text-center ${
                    i === 0 ? "text-amber-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-gray-600"
                  }`}>{i + 1}</span>
                  <span className="flex-1 text-sm font-medium truncate">@{u.username}</span>
                  <span className="text-xs text-gray-500">{u.count} 次生成</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-gray-700 pb-4">数据实时统计 · 仅管理员可见完整数据</p>
      </div>
    </div>
  );
}
