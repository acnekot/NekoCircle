"use client";
import { useEffect, useState, useRef } from "react";

type Stats = {
  totalUsers: number;
  activeUsers: number;
  totalAnalyses: number;
  doneAnalyses: number;
  totalRequests: number;
  totalCredits: number;
  savedCredits: number;
  dailyStats: { day: string; analyses: number; done: number; requests: number; credits: number }[];
  topUsers: { username: string; count: number; credits: number }[];
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

const BAR_COLORS = ["bg-[#1d9bf0]", "bg-[#7b6cf6]", "bg-[#10b981]", "bg-[#f59e0b]"];

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

  const maxCredits = Math.max(...stats.dailyStats.map(d => d.credits), 1);
  const maxRequests = Math.max(...stats.dailyStats.map(d => d.requests), 1);

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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="注册用户" value={stats.totalUsers} sub={`${stats.activeUsers} 位已订阅`} color="text-[#1d9bf0]" />
          <StatCard label="成功生成" value={stats.doneAnalyses} sub={`共发起 ${stats.totalAnalyses} 次`} color="text-emerald-400" />
          <StatCard label="API 请求" value={stats.totalRequests} sub="总请求次数" color="text-purple-400" />
          <StatCard label="消耗 Credits" value={stats.totalCredits} sub={`节省 ${stats.savedCredits.toLocaleString()}`} color="text-amber-400" />
        </div>

        {/* Success rate */}
        {stats.totalAnalyses > 0 && (
          <div className="card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-300">生成成功率</span>
              <span className="text-sm font-bold text-emerald-400">
                {((stats.doneAnalyses / stats.totalAnalyses) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-1000"
                style={{ width: `${(stats.doneAnalyses / stats.totalAnalyses) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Daily chart */}
        {stats.dailyStats.length > 0 && (
          <div className="card rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-5">近 7 天趋势</h2>
            <div className="space-y-6">
              {/* Credits bar chart */}
              <div>
                <div className="text-xs text-gray-500 mb-3">每日 Credits 消耗</div>
                <div className="flex items-end gap-2 h-24">
                  {stats.dailyStats.map((d, i) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-amber-400 font-mono">{d.credits || ""}</div>
                      <div
                        className={`w-full rounded-t ${BAR_COLORS[0]} opacity-80 transition-all duration-700`}
                        style={{ height: `${Math.max(4, (d.credits / maxCredits) * 72)}px` }}
                        title={`${d.credits} credits`}
                      />
                      <div className="text-xs text-gray-600 text-center leading-tight">
                        {d.day.slice(5)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Requests bar chart */}
              <div>
                <div className="text-xs text-gray-500 mb-3">每日 API 请求次数</div>
                <div className="flex items-end gap-2 h-24">
                  {stats.dailyStats.map((d) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-purple-400 font-mono">{d.requests || ""}</div>
                      <div
                        className={`w-full rounded-t ${BAR_COLORS[1]} opacity-80 transition-all duration-700`}
                        style={{ height: `${Math.max(4, (d.requests / maxRequests) * 72)}px` }}
                        title={`${d.requests} requests`}
                      />
                      <div className="text-xs text-gray-600 text-center leading-tight">
                        {d.day.slice(5)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Done analyses */}
              <div className="grid grid-cols-7 gap-2">
                {stats.dailyStats.map(d => (
                  <div key={d.day} className="text-center">
                    <div className="text-xs text-emerald-400 font-bold">{d.done}</div>
                    <div className="text-xs text-gray-600">{d.day.slice(5)}</div>
                    <div className="text-xs text-gray-700">/{d.analyses}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top users */}
        {stats.topUsers.length > 0 && (
          <div className="card rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4">🏆 最活跃用户</h2>
            <div className="space-y-2">
              {stats.topUsers.map((u, i) => (
                <div key={u.username ?? i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 hover:bg-white/5 transition-colors">
                  <span className={`text-xs font-bold w-5 text-center ${
                    i === 0 ? "text-amber-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-gray-600"
                  }`}>{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">@{u.username ?? "匿名"}</span>
                  <span className="text-xs text-gray-500">{u.count} 次生成</span>
                  <span className="text-xs text-amber-400/70">{u.credits} cr</span>
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
