"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import CircleChart, { renderToCanvas } from "@/components/CircleChart";
import StylePanel from "@/components/StylePanel";
import FindYourself from "@/components/FindYourself";
import { DEFAULT_STYLE, loadStyleConfig, saveStyleConfig, type StyleConfig } from "@/lib/style";
import type { CircleUser, SelfProfile } from "@/types/circle";
import { yahooToAnalysisResult } from "@/lib/circle-convert";
import { readYahooCircleCache, writeYahooCircleCache } from "@/lib/yahoo-client-cache";

type Tab = "circle" | "list";

type YahooMentionsResponse = {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  circleId?: string;
  createdAt?: number;
  error?: string;
};

const EMPTY_SELF: SelfProfile = { screenName: "", displayName: "" };

export default function YahooCirclePage() {
  const params = useParams();
  const username = (params?.username as string) ?? "";

  const [self, setSelf] = useState<SelfProfile>(EMPTY_SELF);
  const [users, setUsers] = useState<CircleUser[]>([]);
  const [counts, setCounts] = useState<{ toYou: number; fromYou: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [styleConfig, setStyleConfig] = useState<StyleConfig>(DEFAULT_STYLE);
  const [bgAccent, setBgAccent] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("circle");
  const [circleId, setCircleId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setStyleConfig(loadStyleConfig()); }, []);
  const handleStyleChange = (s: StyleConfig) => { setStyleConfig(s); saveStyleConfig(s); };

  useEffect(() => {
    if (!username) return;
    const name = username.replace(/^@+/, "");
    if (!name) return;

    const cached = readYahooCircleCache(name);
    if (cached) {
      setCounts({ toYou: cached.counts.mentionsToYou, fromYou: cached.counts.mentionsFromYou });
      setUsers(cached.circleUsers ?? []);
      setSelf({
        screenName: cached.screenName,
        displayName: cached.screenName,
        avatarUrl: cached.selfAvatarUrl,
        avatarUrlPreview: cached.selfAvatarUrlPreview,
        mentionTotal: cached.counts.mentionsToYou + cached.counts.mentionsFromYou,
      });
      if (cached.circleId) setCircleId(cached.circleId);
      if (cached.createdAt) setCreatedAt(cached.createdAt);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const q = new URLSearchParams({ screenName: name, buildCircle: "1" });
    fetch(`/api/yahoo-mentions?${q.toString()}`)
      .then((r) => r.json())
      .then((data: YahooMentionsResponse) => {
        if (data.error) { setError(data.error); return; }
        setCounts({ toYou: data.counts.mentionsToYou, fromYou: data.counts.mentionsFromYou });
        setUsers(data.circleUsers ?? []);
        setSelf({
          screenName: data.screenName,
          displayName: data.screenName,
          avatarUrl: data.selfAvatarUrl,
          avatarUrlPreview: data.selfAvatarUrlPreview,
          mentionTotal: data.counts.mentionsToYou + data.counts.mentionsFromYou,
        });
        if (data.circleId) setCircleId(data.circleId);
        if (data.createdAt) setCreatedAt(data.createdAt);
        writeYahooCircleCache(name, {
          screenName: data.screenName,
          counts: data.counts,
          circleUsers: data.circleUsers,
          selfAvatarUrl: data.selfAvatarUrl,
          selfAvatarUrlPreview: data.selfAvatarUrlPreview,
          circleId: data.circleId,
          createdAt: data.createdAt,
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "数据获取失败"))
      .finally(() => setLoading(false));
  }, [username]);

  const analysisResult =
    self.screenName && counts
      ? yahooToAnalysisResult(self, users, counts)
      : null;

  // CircleChart 自己根据 displayCount 截取，这里直接传完整结果
  const displayedResult = analysisResult;

  const getCanvasBlob = (): Promise<Blob | null> => {
    if (!displayedResult) return Promise.resolve(null);
    const EXPORT_SCALE = 4;
    const offscreen = document.createElement("canvas");
    const screenCanvas = document.querySelector<HTMLCanvasElement>("canvas[data-circle]");
    const imgCache: Map<string, HTMLImageElement> = new Map();
    if (screenCanvas) {
      const cached = (screenCanvas as HTMLCanvasElement & { _imgCache?: Map<string, HTMLImageElement> })._imgCache;
      if (cached) cached.forEach((v, k) => imgCache.set(k, v));
    }
    renderToCanvas(offscreen, displayedResult, styleConfig, imgCache, { exportScale: EXPORT_SCALE, circleId: circleId ?? undefined });
    return new Promise((res) => offscreen.toBlob(res, "image/png"));
  };

  const downloadCanvas = async () => {
    const blob = await getCanvasBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `yahoo-circle-${username}.png`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="gradient-bg min-h-screen py-8 px-4"
      style={bgAccent ? {
        background: `radial-gradient(ellipse at 30% 10%, ${bgAccent}28 0%, transparent 55%), radial-gradient(ellipse at top, #1a2744 0%, #0a0f1e 60%)`
      } : undefined}
    >
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <a href="/" className="text-gray-500 hover:text-white transition-colors text-sm">← 返回首页</a>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 font-medium">
                Yahoo 搜索 · 免费
              </span>
              {circleId && (
                <button
                  onClick={() => { navigator.clipboard.writeText(circleId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                  className="text-xs text-gray-600 font-mono hover:text-gray-400 transition-colors cursor-pointer flex items-center gap-1"
                  title="点击复制完整 ID"
                >
                  ID: {circleId.slice(0, 8)}
                  {copied ? (
                    <span className="text-green-400 text-xs ml-1">✓ 已复制</span>
                  ) : (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  )}
                </button>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white">
              @{username}
              <span className="text-gray-400 font-normal text-base ml-2">的互动圈</span>
            </h1>
            {counts && (
              <p className="text-sm text-gray-500 mt-0.5">
                {createdAt && (
                  <>
                    生成于 <span className="text-gray-300">{new Date(createdAt).toLocaleString("zh-CN")}</span>
                    {" · "}
                  </>
                )}
                别人 mention 你：<span className="text-gray-300">{counts.toYou}</span> 条
                {" · "}你 mention 别人：<span className="text-gray-300">{counts.fromYou}</span> 条
                {" · "}互动用户：<span className="text-gray-300">{users.length}</span> 人
              </p>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card rounded-2xl p-16 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#1d9bf0] animate-spin" />
            <div className="text-center">
              <p className="text-white font-medium">正在获取数据...</p>
              <p className="text-gray-500 text-sm mt-1">通过 Yahoo 实时搜索抓取，约需 10~40 秒</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">😿</div>
            <h2 className="text-lg font-bold text-red-400 mb-2">获取失败</h2>
            <p className="text-gray-400 text-sm">{error}</p>
            <a href="/" className="btn-primary inline-block mt-6 px-6 py-2 rounded-xl text-sm font-medium">返回首页</a>
          </div>
        )}

        {/* Result */}
        {!loading && !error && displayedResult && (
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Left: 样式面板 */}
            <div className="lg:w-72 shrink-0 space-y-3">
              <StylePanel
                value={styleConfig}
                onChange={handleStyleChange}
                maxUsers={users.length}
                showAllOption
              />
              <div className="card rounded-2xl p-4 space-y-2">
                <button
                  onClick={async () => {
                    const shareId = circleId ?? username;
                    const pageUrl = circleId
                      ? `${window.location.origin}/circle/${circleId}`
                      : `${window.location.origin}/yahoo/${encodeURIComponent(username)}`;
                    const shareText = `我的互动圈\n${pageUrl}`;
                    try {
                      const blob = await getCanvasBlob();
                      if (blob && navigator.canShare?.({ files: [new File([blob], "circle.png", { type: "image/png" })] })) {
                        await navigator.share({ text: shareText, files: [new File([blob], `yahoo-circle-${username}.png`, { type: "image/png" })] });
                        return;
                      }
                    } catch (e) { if ((e as DOMException)?.name === "AbortError") return; }
                    // Fallback: download image + open tweet intent
                    await downloadCanvas();
                    const text = encodeURIComponent("我的互动圈");
                    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(pageUrl)}`, "_blank");
                  }}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    分享到 X
                  </span>
                </button>
                <button
                  onClick={downloadCanvas}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all"
                >
                  ⬇️ 下载图片
                </button>
                <button
                  onClick={() => { window.location.reload(); }}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all"
                >
                  🔄 刷新数据
                </button>
                <div className="text-xs text-gray-600 pt-1 border-t border-white/5 leading-relaxed">
                  数据来自 Yahoo 实时搜索 · 仅含过去 30 天公开 Mention · 无需登录或 API Key
                  <br />
                  灵感来自 <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-400 transition-colors">nareaitter</a>
                </div>
              </div>

              {/* 查找自我 */}
              {displayedResult && (
                <FindYourself topUsers={displayedResult.topUsers} ownerUsername={username} />
              )}
            </div>

            {/* Right: Circle + List tabs */}
            <div className="flex-1 min-w-0">

              {/* Tab bar */}
              <div className="flex gap-1 mb-3">
                {([["circle", "🔵 互动圈"], ["list", "📋 排名列表"]] as [Tab, string][]).map(([tab, label]) => (
                  <button key={tab} type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "bg-[#1d9bf0] text-white"
                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >{label}</button>
                ))}
              </div>

              {activeTab === "circle" && (
                <div className="card rounded-2xl p-4 flex justify-center overflow-x-auto">
                  <CircleChart
                    result={displayedResult}
                    style={styleConfig}
                    onAccentColor={(color) => setBgAccent(color)}
                    circleId={circleId ?? undefined}
                  />
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
                          <th className="px-4 py-3 text-pink-400">Mention 次数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u, i) => (
                          <tr key={u.screenName} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-gray-500 font-mono text-sm">{i + 1}</td>
                            <td className="px-4 py-3">
                              <a href={`https://x.com/${u.screenName}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 hover:text-[#1d9bf0] transition-colors">
                                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden shrink-0">
                                  {u.avatarUrlPreview || u.avatarUrl
                                    ? <img src={u.avatarUrlPreview ?? u.avatarUrl ?? ""} alt="" className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{u.screenName[0]?.toUpperCase()}</div>
                                  }
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{u.displayName || u.screenName}</div>
                                  <div className="text-gray-500 text-xs">@{u.screenName}</div>
                                </div>
                              </a>
                            </td>
                            <td className="px-4 py-3 text-pink-300 font-mono">{u.interactionCount ?? u.interactionScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
