"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import CircleChart from "@/components/CircleChart";
import StylePanel from "@/components/StylePanel";
import type { AnalysisResult, LogEntry, RawData } from "@/lib/analyze";
import { DEFAULT_STYLE, loadStyleConfig, saveStyleConfig, type StyleConfig } from "@/lib/style";

type AnalysisRow = {
  id: string; username: string; display_name: string | null; avatar: string | null;
  status: string; tweet_count: number; top_count: number; created_at: number;
  progress: number; progress_msg: string; eta_sec: number; slow_mode: number;
  logs: string; result: string | null; raw_data: string | null; should_stop: number;
  req_count: number; spent_credits: number; saved_credits: number;
};

/* ── Avatar color → dark canvas bg ───────────────────── */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * ((max + min) / 2) - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100 };
}
function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%)`;
}
function accentToBgColors(hex: string): { bgColor1: string; bgColor2: string } {
  const { h, s } = hexToRgb(hex);
  return {
    bgColor1: hsl(h, Math.min(s, 55), 9),
    bgColor2: hsl(h, Math.min(s, 35), 4),
  };
}

/* ── Animated counter ─────────────────────────────────── */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    const to   = value;
    if (from === to) return;
    const startTime = performance.now();
    const duration  = Math.min(600, Math.abs(to - from) * 20);
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{display}</>;
}

/* ── Log entry colours ────────────────────────────────── */
const tagStyle: Record<string, string> = {
  info:    "text-blue-300",
  tweet:   "text-cyan-400",
  reply:   "text-green-400",
  rt:      "text-purple-400",
  quote:   "text-yellow-400",
  mention: "text-pink-400",
  score:   "text-orange-300",
  warn:    "text-yellow-600",
  done:    "text-emerald-400 font-bold",
};

function LogLine({ entry, isRaw, animate }: { entry: LogEntry; isRaw: boolean; animate?: boolean }) {
  const ts  = new Date(entry.ts).toLocaleTimeString("zh-CN", { hour12: false });
  const anim: React.CSSProperties = animate
    ? { animation: "log-appear 0.3s cubic-bezier(0.16,1,0.3,1) forwards", opacity: 0 }
    : {};
  if (isRaw) return (
    <div style={anim} className="leading-5 text-gray-300 select-text whitespace-pre-wrap break-all">
      [{ts}] [{entry.tag.toUpperCase().padEnd(7)}] {entry.msg}
    </div>
  );
  return (
    <div style={anim} className={`leading-5 whitespace-pre-wrap break-words select-text ${tagStyle[entry.tag] ?? "text-gray-300"}`}>
      <span className="text-gray-600 select-none">{ts} </span>
      {entry.msg}
    </div>
  );
}

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId]                     = useState("");
  const [analysis, setAnalysis]         = useState<AnalysisRow | null>(null);
  const [result, setResult]             = useState<AnalysisResult | null>(null);
  const [rawData, setRawData]           = useState<RawData | null>(null);
  const [error, setError]               = useState("");
  const [activeTab, setActiveTab]       = useState<"circle" | "list" | "raw" | "logs">("circle");
  const [logMode, setLogMode]           = useState<"visual" | "plain">("visual");
  const [logPaused, setLogPaused]       = useState(false);
  const [stopping, setStopping]         = useState(false);
  const [styleConfig, setStyleConfig]   = useState<StyleConfig>(DEFAULT_STYLE);
  const [bgAccent, setBgAccent]         = useState("");
  const [rawSearch, setRawSearch]       = useState("");
  const logBoxRef      = useRef<HTMLDivElement>(null);
  const logBox2Ref     = useRef<HTMLDivElement>(null);
  const logSnapshot    = useRef<LogEntry[]>([]);

  useEffect(() => { setStyleConfig(loadStyleConfig()); }, []);
  const handleStyleChange = (s: StyleConfig) => { setStyleConfig(s); saveStyleConfig(s); };

  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);

  // Auto-scroll log unless paused
  useEffect(() => {
    if (logPaused) return;
    if (logBoxRef.current)  logBoxRef.current.scrollTop  = logBoxRef.current.scrollHeight;
    if (logBox2Ref.current) logBox2Ref.current.scrollTop = logBox2Ref.current.scrollHeight;
  }, [analysis?.logs, logPaused]);

  const poll = useCallback(async () => {
    if (!id) return null;
    try {
      const res  = await fetch(`/api/results/${id}`);
      const data: AnalysisRow = await res.json();
      setAnalysis(data);
      if (!logPaused) logSnapshot.current = JSON.parse(data.logs || "[]");
      if (data.status === "done" && data.result) {
        setResult(JSON.parse(data.result));
        if (data.raw_data) setRawData(JSON.parse(data.raw_data));
      } else if (data.status === "error" && data.result) {
        setError(JSON.parse(data.result).error ?? "分析失败");
      }
      return data.status;
    } catch {
      setError("无法获取结果");
      return "error";
    }
  }, [id, logPaused]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (cancelled) return;
      const status = await poll();
      if (cancelled || status === "done" || status === "error") return;
      timer = setTimeout(loop, 3000);
    };

    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, poll]);

  // Pause logs: freeze snapshot, stop auto-scroll
  const toggleLogPause = () => {
    if (!logPaused) {
      // freeze current entries
      logSnapshot.current = JSON.parse(analysis?.logs || "[]");
    }
    setLogPaused(p => !p);
  };

  // Stop analysis
  const handleStop = async () => {
    setStopping(true);
    await fetch(`/api/results/${id}/stop`, { method: "POST" });
    setTimeout(() => { poll(); setStopping(false); }, 1500);
  };

  // Export crawled tweets and interactions as JSON file
  const exportRaw = () => {
    const data = rawData ?? (analysis?.raw_data ? JSON.parse(analysis.raw_data) : null);
    if (!data || !analysis) return;
    const payload = {
      analysis: {
        id,
        username: analysis.username,
        display_name: analysis.display_name,
        created_at: analysis.created_at,
        tweet_count: analysis.tweet_count,
        top_count: analysis.top_count,
        status: analysis.status,
        req_count: analysis.req_count,
        spent_credits: analysis.spent_credits,
        saved_credits: analysis.saved_credits,
      },
      summary: result ? {
        analyzedAt: result.analyzedAt,
        weights: result.weights,
        topUsers: result.topUsers,
      } : null,
      rawData: data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${analysis.username}-history-${id.slice(0, 8)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // Export logs as plain text
  const exportLogs = () => {
    const entries: LogEntry[] = JSON.parse(analysis?.logs || "[]");
    const lines = entries.map(e =>
      `[${new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false })}] [${e.tag.toUpperCase().padEnd(7)}] ${e.msg}`
    ).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `logs-${analysis?.username}-${id.slice(0, 8)}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCanvas = () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `circle-${analysis?.username}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const isRunning = analysis?.status === "pending" || analysis?.status === "running";
  const logs: LogEntry[] = logPaused ? logSnapshot.current : JSON.parse(analysis?.logs || "[]");

  // Typewriter: only animate entries that weren't seen in previous renders
  const seenTs          = useRef(new Set<number>());
  const logsInitialized = useRef(false);
  const getAnimate = (ts: number) => {
    if (!logsInitialized.current) return false;
    return !seenTs.current.has(ts);
  };
  // After every render, mark all current entries as seen
  useEffect(() => {
    logs.forEach(e => seenTs.current.add(e.ts));
    logsInitialized.current = true;
  });

  const statsBar = (analysis?.req_count ?? 0) > 0 && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] font-mono text-xs">
      <span className="text-gray-400">🔄 请求</span>
      <span className="text-[#1d9bf0] font-bold"><AnimatedNumber value={analysis?.req_count ?? 0} /> 次</span>
      <span className="text-gray-700">·</span>
      <span className="text-gray-400">💰 消耗</span>
      <span className="text-yellow-400 font-bold"><AnimatedNumber value={analysis?.spent_credits ?? 0} /> Credits</span>
      {(analysis?.saved_credits ?? 0) > 0 && (
        <>
          <span className="text-gray-700">·</span>
          <span className="text-gray-400">💾 节省</span>
          <span className="text-green-400 font-bold"><AnimatedNumber value={analysis?.saved_credits ?? 0} /> Credits</span>
        </>
      )}
    </div>
  );

  const logControls = (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs text-gray-400 font-mono flex-1">
        📡 实时日志 <span className="text-gray-600">({logs.length} 条)</span>
        {logPaused && <span className="ml-2 text-yellow-500">⏸ 已暂停</span>}
      </span>
      <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
        {(["visual", "plain"] as const).map(mode => (
          <button key={mode} onClick={() => setLogMode(mode)}
            className={`px-3 py-1 transition-colors ${logMode === mode ? "bg-white/15 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            {mode === "visual" ? "🎨" : "📄"}
          </button>
        ))}
      </div>
      <button onClick={toggleLogPause}
        className={`px-3 py-1 rounded-lg text-xs border transition-all ${logPaused ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : "border-white/10 text-gray-500 hover:text-gray-300"}`}>
        {logPaused ? "▶" : "⏸"}
      </button>
      <button onClick={exportLogs}
        className="px-3 py-1 rounded-lg text-xs border border-white/10 text-gray-500 hover:text-gray-300 transition-all">⬇</button>
    </div>
  );

  // Log body for running state (fills parent height)
  const runningLogBody = (
    <div ref={logBoxRef}
      className="flex-1 min-h-0 bg-black/70 border border-white/10 rounded-xl p-3 overflow-y-auto font-mono text-xs space-y-0.5">
      {logMode === "plain"
        ? <pre className="text-gray-300 whitespace-pre-wrap break-all select-text">
            {logs.map(e =>
              `[${new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false })}] [${e.tag.toUpperCase().padEnd(7)}] ${e.msg}`
            ).join("\n")}
          </pre>
        : logs.map(e => <LogLine key={e.ts} entry={e} isRaw={false} animate={getAnimate(e.ts)} />)
      }
    </div>
  );

  // Log body for after-done (fixed height)
  const doneLogBody = (
    <div ref={logBox2Ref}
      className="bg-black/60 border border-white/10 rounded-xl p-3 h-52 overflow-y-auto font-mono text-xs space-y-0.5">
      {logMode === "plain"
        ? <pre className="text-gray-300 whitespace-pre-wrap break-all select-text">
            {logs.map(e =>
              `[${new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false })}] [${e.tag.toUpperCase().padEnd(7)}] ${e.msg}`
            ).join("\n")}
          </pre>
        : logs.map(e => <LogLine key={e.ts} entry={e} isRaw={false} animate={false} />)
      }
    </div>
  );

  const statusLabel: Record<string, string> = {
    pending: "⏳ 等待中...", running: "🔄 分析中...", done: "✅ 完成", error: "❌ 出错",
  };

  /* ── Raw data viewer ─────────────────────────────────── */
  const RawDataTab = () => {
    if (!rawData) return <div className="text-gray-500 text-center py-16">暂无原始数据</div>;
    const seenIds = new Set<string>();
    const filteredTweets = rawData.tweets.filter(t => {
      if (seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return !rawSearch || t.text.toLowerCase().includes(rawSearch.toLowerCase()) || t.id.includes(rawSearch);
    });
    return (
      <div className="space-y-4">
        <div className="flex gap-2 items-center">
          <input
            value={rawSearch} onChange={e => setRawSearch(e.target.value)}
            placeholder="搜索推文内容或 ID..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30"
          />
          <button onClick={exportRaw}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 transition-all whitespace-nowrap">
            ⬇️ 导出 JSON
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ["🐦 推文", rawData.tweets.length],
            ["👥 互动用户", Object.values(rawData.interactions).reduce((s, v) =>
              s + v.replies.length + v.retweets.length + v.quotes.length, 0)],
            ["📣 Mention", rawData.mentions.length],
          ].map(([label, val]) => (
            <div key={String(label)} className="card rounded-xl p-3">
              <div className="text-2xl font-bold text-white">{val}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {rawData.partial && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm px-4 py-2 rounded-xl">
            ⚠️ 数据不完整（已暂停） · 停止于 {rawData.stoppedAt ? new Date(rawData.stoppedAt).toLocaleTimeString("zh-CN") : "-"}
          </div>
        )}

        {/* Mentions */}
        {rawData.mentions.length > 0 && (
          <div className="card rounded-xl p-4">
            <h3 className="text-sm font-semibold text-pink-400 mb-2">📣 Mentions ({rawData.mentions.length})</h3>
            <div className="flex flex-wrap gap-2">
              {rawData.mentions.map(u => (
                <span key={u.id} className="text-xs bg-pink-500/10 text-pink-300 px-2 py-1 rounded-full">@{u.userName}</span>
              ))}
            </div>
          </div>
        )}

        {/* Tweets & interactions */}
        <div className="space-y-3">
          {filteredTweets.map((tweet, ti) => {
            const ix = rawData.interactions[tweet.id] ?? null;
            const total = ix ? ix.replies.length + ix.retweets.length + ix.quotes.length : 0;
            return (
              <div key={`${tweet.id}-${ti}`} className="card rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-300 flex-1 leading-relaxed">{tweet.text.slice(0, 200)}</p>
                  <div className="text-right shrink-0 text-xs text-gray-600 font-mono">
                    <div>…{tweet.id.slice(-8)}</div>
                    <div className="mt-1 text-gray-500">
                      {tweet.replyCount}💬 {tweet.retweetCount}🔁 {tweet.quoteCount}🗨️
                    </div>
                  </div>
                </div>
                {ix && total > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 border-t border-white/5">
                    {ix.replies.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-blue-600 mr-1">reply</span>
                        {ix.replies.map((u, i) => (
                          <span key={`${u.id}-${i}`} className="text-xs text-blue-400">@{u.userName}</span>
                        ))}
                      </div>
                    )}
                    {ix.retweets.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-purple-600 mr-1">RT</span>
                        {ix.retweets.map((u, i) => (
                          <span key={`${u.id}-${i}`} className="text-xs text-purple-400">@{u.userName}</span>
                        ))}
                      </div>
                    )}
                    {ix.quotes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-yellow-600 mr-1">quote</span>
                        {ix.quotes.map((u, i) => (
                          <span key={`${u.id}-${i}`} className="text-xs text-yellow-400">@{u.userName}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="gradient-bg min-h-screen py-8 px-4" style={bgAccent ? {
      background: `radial-gradient(ellipse at 30% 10%, ${bgAccent}28 0%, transparent 55%), radial-gradient(ellipse at top, #1a2744 0%, #0a0f1e 60%)`
    } : undefined}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <a href="/" className="text-gray-500 hover:text-white transition-colors">← 返回</a>
          <div>
            <h1 className="text-2xl font-bold">
              {analysis?.display_name ?? analysis?.username ?? "..."}
              {analysis?.display_name && (
                <span className="text-gray-400 font-normal text-lg ml-2">@{analysis.username}</span>
              )}
            </h1>
            <div className="text-sm text-gray-500 mt-1">
              {statusLabel[analysis?.status ?? "pending"]}
              {analysis?.status === "done" && (
                <span className="ml-2">
                  · 分析了 {analysis.tweet_count} 条推文 · Top {analysis.top_count} 互动用户
                  {rawData?.partial && <span className="text-yellow-500 ml-1">（部分数据）</span>}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Running: 1:3 left-right layout ─────────────────── */}
        {isRunning && !error && (
          <div className="flex flex-col lg:flex-row gap-4 mb-6" style={{ height: 'calc(100vh - 180px)' }}>

            {/* Left (1 part): compact progress */}
            <div className="card rounded-2xl p-6 lg:w-72 shrink-0 flex flex-col items-center justify-between gap-4 overflow-hidden">
              <div className="text-center mt-2">
                <div className="text-2xl font-bold username-gradient mb-1">
                  {analysis?.display_name ?? analysis?.username ?? "..."}
                </div>
                {analysis?.display_name && (
                  <div className="text-gray-500 text-sm">@{analysis.username}</div>
                )}
              </div>

              <div className="w-full space-y-3">
                {analysis?.slow_mode === 1 && (
                  <div className="flex items-center justify-center gap-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-xs px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                    低速保护模式
                  </div>
                )}
                <p className="text-white/80 text-sm text-center leading-snug">
                  {analysis?.progress_msg || "正在启动..."}
                </p>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${analysis?.progress ?? 0}%`,
                      background: analysis?.slow_mode === 1
                        ? "linear-gradient(90deg,#f59e0b,#ef4444)"
                        : "linear-gradient(90deg,#1d9bf0,#7b6cf6)",
                    }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{analysis?.progress ?? 0}%</span>
                  {(analysis?.eta_sec ?? -1) >= 0
                    ? <span>{analysis!.eta_sec > 60 ? `约 ${Math.ceil(analysis!.eta_sec / 60)} 分钟` : `约 ${analysis!.eta_sec} 秒`}</span>
                    : <span>计算中...</span>}
                </div>
              </div>

              <button onClick={handleStop}
                disabled={stopping || analysis?.should_stop === 1}
                className="w-full py-2 rounded-xl text-sm font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40 mb-2">
                {stopping || analysis?.should_stop === 1 ? "⏹ 正在停止..." : "⏹ 暂停并输出"}
              </button>
            </div>

            {/* Right (3 parts): tall log terminal */}
            <div className="card rounded-2xl p-4 flex-1 flex flex-col min-h-0">
              {statsBar}
              {logControls}
              {runningLogBody}
            </div>
          </div>
        )}

        {/* ── Log Console (after done) ──────────────────────── */}

        {/* ── Error ────────────────────────────────────────── */}
        {error && (
          <div className="card rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">分析失败</h2>
            <p className="text-gray-400">{error}</p>
            <a href="/" className="btn-primary inline-block mt-6 px-6 py-2 rounded-xl text-sm font-medium">重新分析</a>
          </div>
        )}

        {/* ── Result ───────────────────────────────────────── */}
        {result && (
          <>
            {/* Top: user info banner */}
            <div className="card rounded-2xl px-5 py-4 mb-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-700 ring-2 ring-white/10 shrink-0">
                {analysis?.avatar
                  ? <img src={`/api/avatar?url=${encodeURIComponent(analysis.avatar)}`} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xl font-bold text-gray-400">{analysis?.username?.[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-base leading-tight">{analysis?.display_name ?? analysis?.username}</div>
                {analysis?.display_name && <div className="text-gray-400 text-sm truncate">@{analysis.username}</div>}
              </div>
              <div className="hidden sm:flex items-center gap-6 text-center shrink-0">
                <div>
                  <div className="text-white font-bold">{analysis?.tweet_count ?? 0}</div>
                  <div className="text-gray-500 text-xs">推文</div>
                </div>
                <div>
                  <div className="text-white font-bold">{result.topUsers.length}</div>
                  <div className="text-gray-500 text-xs">互动用户</div>
                </div>
                <div className="text-gray-600 text-xs">
                  {new Date(result.analyzedAt).toLocaleString("zh-CN")}
                </div>
              </div>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/result/${id}`;
                  const text = encodeURIComponent("我的互动圈");
                  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, "_blank");
                }}
                className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  分享到 X
                </span>
              </button>
              <button onClick={downloadCanvas}
                className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all whitespace-nowrap">
                ⬇️ 下载图片
              </button>
            </div>

            {/* 1:3 layout */}
            <div className="flex flex-col lg:flex-row gap-4">

              {/* Left (1): style controls */}
              <div className="lg:w-72 shrink-0 space-y-3">
                <StylePanel value={styleConfig} onChange={handleStyleChange} maxUsers={result.topUsers.length} />
              </div>

              {/* Right (3): tabs + content */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex gap-2 flex-wrap items-center">
                  {([
                    ["logs",   "📋 日志"],
                    ["circle", "🔵 互动圈"],
                    ["list",   "📊 排行榜"],
                    ["raw",    "🗂 原始数据"],
                  ] as const).map(([tab, label]) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        activeTab === tab ? "bg-[#1d9bf0] text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}>
                      {label}
                    </button>
                  ))}
                  {activeTab === "raw" && (
                    <button onClick={exportRaw}
                      className="ml-auto px-4 py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 transition-all">
                      ⬇️ 导出推文与互动
                    </button>
                  )}
                </div>

                {activeTab === "logs" && (
                  <div className="card rounded-2xl p-4">
                    {statsBar}
                    {logControls}
                    {doneLogBody}
                  </div>
                )}

                {activeTab === "circle" && (
                  <div className="card rounded-2xl p-4 flex justify-center overflow-hidden">
                    <CircleChart result={result} style={styleConfig}
                      onAccentColor={(color) => setBgAccent(color)} />
                  </div>
                )}

                {activeTab === "list" && (
                  <div className="card rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-gray-400 text-sm">
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">用户</th>
                            <th className="px-4 py-3 text-blue-400">Reply</th>
                            <th className="px-4 py-3 text-purple-400">Quote</th>
                            <th className="px-4 py-3 text-pink-400">Mention</th>
                            <th className="px-4 py-3 text-green-400">RT</th>
                            <th className="px-4 py-3 text-cyan-400">主动分</th>
                            <th className="px-4 py-3 text-orange-400">被动分</th>
                            <th className="px-4 py-3 text-yellow-400">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.topUsers.map((item, i) => (
                            <tr key={item.user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3 text-gray-500 font-mono text-sm">{i + 1}</td>
                              <td className="px-4 py-3">
                                <a href={`https://x.com/${item.user.userName}`} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-3 hover:text-[#1d9bf0] transition-colors">
                                  <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden shrink-0">
                                    {item.user.profilePicture
                                      ? <img src={`/api/avatar?url=${encodeURIComponent(item.user.profilePicture)}`} alt="" className="w-full h-full object-cover" />
                                      : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{item.user.userName[0].toUpperCase()}</div>
                                    }
                                  </div>
                                  <div>
                                    <div className="font-medium text-sm">{item.user.name}</div>
                                    <div className="text-gray-500 text-xs">@{item.user.userName}</div>
                                  </div>
                                </a>
                              </td>
                              <td className="px-4 py-3 text-blue-300 font-mono">{item.replies}</td>
                              <td className="px-4 py-3 text-purple-300 font-mono">{item.quotes}</td>
                              <td className="px-4 py-3 text-pink-300 font-mono">{item.mentions}</td>
                              <td className="px-4 py-3 text-green-300 font-mono">{item.retweets}</td>
                              <td className="px-4 py-3 text-cyan-300 font-mono">{item.outboundScore.toFixed(1)}</td>
                              <td className="px-4 py-3 text-orange-300 font-mono">{item.inboundScore.toFixed(1)}</td>
                              <td className="px-4 py-3 text-yellow-400 font-bold font-mono">{item.score.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "raw" && <RawDataTab />}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
