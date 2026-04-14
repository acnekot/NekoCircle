"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CircleChart, { renderToCanvas } from "@/components/CircleChart";
import StylePanel from "@/components/StylePanel";
import FindYourself from "@/components/FindYourself";
import { DEFAULT_STYLE, loadStyleConfig, saveStyleConfig, type StyleConfig } from "@/lib/style";
import type { AnalysisResult } from "@/lib/circle-convert";
import type { CircleUser } from "@/types/circle";
import { parseYahooCircleData } from "@/lib/circle-convert";

type UnifiedCircle = {
  source: "yahoo";
  id: string;
  username: string;
  created_at: number;
  data: string;
};

type Tab = "circle" | "list";

export default function CirclePreviewPage() {
  const params = useParams();
  const circleId = (params?.id as string) ?? "";

  const [circle, setCircle] = useState<UnifiedCircle | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [circleUsers, setCircleUsers] = useState<CircleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [styleConfig, setStyleConfig] = useState<StyleConfig>(DEFAULT_STYLE);
  const [bgAccent, setBgAccent] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("circle");
  const [copied, setCopied] = useState(false);

  useEffect(() => { setStyleConfig(loadStyleConfig()); }, []);
  const handleStyleChange = (s: StyleConfig) => { setStyleConfig(s); saveStyleConfig(s); };

  useEffect(() => {
    if (!circleId) return;
    setLoading(true);
    setError("");
    fetch(`/api/circle/${circleId}`)
      .then((r) => {
        if (!r.ok) throw new Error("未找到该圈子");
        return r.json();
      })
      .then((data: UnifiedCircle) => {
        setCircle(data);
        const { analysisResult, circleUsers: cu } = parseYahooCircleData(data.data);
        setResult(analysisResult);
        setCircleUsers(cu);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "获取失败"))
      .finally(() => setLoading(false));
  }, [circleId]);

  const getCanvasBlob = (): Promise<Blob | null> => {
    if (!result) return Promise.resolve(null);
    const EXPORT_SCALE = 4;
    const offscreen = document.createElement("canvas");
    const screenCanvas = document.querySelector<HTMLCanvasElement>("canvas[data-circle]");
    const imgCache: Map<string, HTMLImageElement> = new Map();
    if (screenCanvas) {
      const cached = (screenCanvas as HTMLCanvasElement & { _imgCache?: Map<string, HTMLImageElement> })._imgCache;
      if (cached) cached.forEach((v, k) => imgCache.set(k, v));
    }
    renderToCanvas(offscreen, result, styleConfig, imgCache, { exportScale: EXPORT_SCALE, circleId });
    return new Promise((res) => offscreen.toBlob(res, "image/png"));
  };

  const downloadCanvas = async () => {
    const blob = await getCanvasBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `circle-${circle?.username ?? circleId}.png`;
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
          {circle && (
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-green-500/20 border-green-500/30 text-green-400">
                  Yahoo 搜索 · 免费
                </span>
                <button
                  onClick={() => { navigator.clipboard.writeText(circleId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                  className="text-xs text-gray-600 font-mono hover:text-gray-400 transition-colors cursor-pointer flex items-center gap-1"
                  title="点击复制 ID"
                >
                  ID: {circleId}
                  {copied ? (
                    <span className="text-green-400 text-xs ml-1">✓ 已复制</span>
                  ) : (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  )}
                </button>
              </div>
              <h1 className="text-2xl font-bold text-white">
                @{circle.username}
                <span className="text-gray-400 font-normal text-base ml-2">的互动圈</span>
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                创建于 {new Date(circle.created_at).toLocaleString("zh-CN")}
                {" · "}互动用户：<span className="text-gray-300">{result?.topUsers.length ?? 0}</span> 人
              </p>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="card rounded-2xl p-16 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#1d9bf0] animate-spin" />
            <div className="text-center">
              <p className="text-white font-medium">正在加载圈子...</p>
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
        {!loading && !error && result && (
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Left: 样式面板 */}
            <div className="lg:w-72 shrink-0 space-y-3">
              <StylePanel
                value={styleConfig}
                onChange={handleStyleChange}
                maxUsers={result.topUsers.length}
                showAllOption
              />
              <div className="card rounded-2xl p-4 space-y-2">
                <button
                  onClick={async () => {
                    const pageUrl = `${window.location.origin}/circle/${circleId}`;
                    const shareText = `我的互动圈\n${pageUrl}`;
                    try {
                      const blob = await getCanvasBlob();
                      if (blob && navigator.canShare?.({ files: [new File([blob], "circle.png", { type: "image/png" })] })) {
                        await navigator.share({ text: shareText, files: [new File([blob], `circle-${circle?.username}.png`, { type: "image/png" })] });
                        return;
                      }
                    } catch (e) { if ((e as DOMException)?.name === "AbortError") return; }
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
              </div>

              {/* 查找自我 */}
              <FindYourself topUsers={result.topUsers} />
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
                    result={result}
                    style={styleConfig}
                    onAccentColor={(color) => setBgAccent(color)}
                    circleId={circleId}
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
                        {result.topUsers.map((item, i) => (
                          <tr key={item.user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-gray-500 font-mono text-sm">{i + 1}</td>
                            <td className="px-4 py-3">
                              <a href={`https://x.com/${item.user.userName}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 hover:text-[#1d9bf0] transition-colors">
                                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden shrink-0">
                                  {item.user.profilePicture
                                    ? <img src={item.user.profilePicture} alt="" className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{item.user.userName[0]?.toUpperCase()}</div>
                                  }
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{item.user.name}</div>
                                  <div className="text-gray-500 text-xs">@{item.user.userName}</div>
                                </div>
                              </a>
                            </td>
                            <td className="px-4 py-3 text-pink-300 font-mono">{item.mentions}</td>
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
