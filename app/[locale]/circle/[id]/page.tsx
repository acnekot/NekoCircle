"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CircleChart, { renderToCanvas } from "@/components/CircleChart";
import StylePanel from "@/components/StylePanel";
import FindYourself from "@/components/FindYourself";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FamilyTree from "@/components/FamilyTree";
import AvatarImage from "@/components/AvatarImage";
import AIDiagnosisPanel from "@/components/AIDiagnosisPanel";
import AccountValuePanel from "@/components/AccountValuePanel";
import { DEFAULT_STYLE, loadStyleConfig, saveStyleConfig, type StyleConfig } from "@/lib/style";
import type { AnalysisResult } from "@/lib/circle-convert";
import type { CircleUser, SelfProfile } from "@/types/circle";
import { parseYahooCircleData } from "@/lib/circle-convert";
import { useTranslation } from "@/components/LocaleProvider";

type UnifiedCircle = {
  source: "yahoo";
  id: string;
  username: string;
  created_at: number;
  data: string;
};

type Tab = "circle" | "list" | "family" | "ai" | "value";

export default function CirclePreviewPage() {
  const params = useParams();
  const circleId = (params?.id as string) ?? "";
  const { locale, t } = useTranslation();

  const [circle, setCircle] = useState<UnifiedCircle | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [circleUsers, setCircleUsers] = useState<CircleUser[]>([]);
  const [self, setSelf] = useState<SelfProfile | null>(null);
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
        if (!r.ok) throw new Error(t("circle.notFound"));
        return r.json();
      })
      .then((data: UnifiedCircle) => {
        setCircle(data);
        const { analysisResult, circleUsers: cu, self: parsedSelf } = parseYahooCircleData(data.data);
        setResult(analysisResult);
        setCircleUsers(cu);
        setSelf(parsedSelf);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("circle.error")))
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
      className="gradient-bg min-h-screen py-5 sm:py-8 px-4 sm:px-6"
      style={bgAccent ? {
        background: `radial-gradient(ellipse at 30% 10%, ${bgAccent}28 0%, transparent 55%), radial-gradient(ellipse at top, #1a2744 0%, #0a0f1e 60%)`
      } : undefined}
    >
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="tech-panel rounded-2xl flex items-center gap-4 mb-6 px-4 sm:px-5 py-4">
          <a href={`/${locale}`} className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.03] px-3 py-2 text-slate-500 hover:text-cyan-200 hover:border-cyan-300/30 transition-colors text-xs font-mono">{t("common.backHome")}</a>
          {circle && (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="hud-label px-2 py-1 rounded-md bg-cyan-400/[0.07] border border-cyan-300/15">
                  {t("circle.tag")}
                </span>
                <button
                  onClick={() => { navigator.clipboard.writeText(circleId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                  className="text-xs text-gray-600 font-mono hover:text-gray-400 transition-colors cursor-pointer flex items-center gap-1"
                  title={t("common.copyIdShort")}
                >
                  ID: {circleId}
                  {copied ? (
                    <span className="text-green-400 text-xs ml-1">{t("common.copied")}</span>
                  ) : (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  )}
                </button>
              </div>
              <h1 className="tech-title text-2xl sm:text-3xl font-bold text-white">
                @{circle.username}
                <span className="text-gray-400 font-normal text-base ml-2">{t("circle.circle")}</span>
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {t("circle.createdAt")} {new Date(circle.created_at).toLocaleString(locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "zh-CN")}
                {" · "}{t("circle.users")}<span className="text-gray-300">{result?.topUsers.length ?? 0}</span> {t("circle.persons")}
              </p>
            </div>
          )}
          <LanguageSwitcher />
        </div>

        {/* Loading */}
        {loading && (
          <div className="card rounded-2xl p-16 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#1d9bf0] animate-spin" />
            <div className="text-center">
              <p className="text-white font-medium">{t("circle.loading")}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">😿</div>
            <h2 className="text-lg font-bold text-red-400 mb-2">{t("circle.error")}</h2>
            <p className="text-gray-400 text-sm">{error}</p>
            <a href={`/${locale}`} className="btn-primary inline-block mt-6 px-6 py-2 rounded-xl text-sm font-medium">{t("common.returnHome")}</a>
          </div>
        )}

        {/* Result */}
        {!loading && !error && result && (
          <div className="result-layout">

            {/* Left: style panel */}
            <div className="result-sidebar space-y-3">
              <StylePanel
                value={styleConfig}
                onChange={handleStyleChange}
                maxUsers={result.topUsers.length}
                showAllOption
              />
              <div className="card rounded-2xl p-4 space-y-2">
                <button
                  onClick={async () => {
                    const pageUrl = `https://circle.catsuki.cc/${locale}/circle/${circleId}`;
                    const shareText = `${t("circle.shareText1")}\n${t("circle.shareText2")} ${pageUrl}\n${t("circle.shareText3")}`;
                    try {
                      const blob = await getCanvasBlob();
                      if (blob && navigator.canShare?.({ files: [new File([blob], "circle.png", { type: "image/png" })] })) {
                        await navigator.share({ text: shareText, files: [new File([blob], `circle-${circle?.username}.png`, { type: "image/png" })] });
                        return;
                      }
                    } catch (e) { if ((e as DOMException)?.name === "AbortError") return; }
                    await downloadCanvas();
                    const text = encodeURIComponent(shareText);
                    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
                  }}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                    {t("common.share")}
                  </span>
                </button>
                <button
                  onClick={downloadCanvas}
                  className="w-full py-2 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-all"
                >
                  {t("common.download")}
                </button>
              </div>

              {/* Find yourself */}
              <FindYourself topUsers={result.topUsers} ownerUsername={circle?.username} />
            </div>

            {/* Right: Circle + List tabs */}
            <div className="result-main">
              {/* Tab bar */}
              <div className="tech-tabs flex flex-wrap gap-1 mb-4">
                {([
                  ["circle", t("circle.tabCircle")],
                  ["list", t("circle.tabList")],
                  ["family", t("extras.tabFamily")],
                  ["ai", t("extras.tabAI")],
                  ["value", t("extras.tabValue")],
                ] as [Tab, string][]).map(([tab, label]) => (
                  <button key={tab} type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      activeTab === tab
                        ? "bg-[#0a84ff]/20 text-white border border-[#0a84ff]/25"
                        : "border border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    }`}
                  >{label}</button>
                ))}
              </div>

              {activeTab === "circle" && (
                <div className="card tech-display-frame rounded-2xl p-3 sm:p-5 flex justify-center overflow-x-auto">
                  <CircleChart
                    result={result}
                    style={styleConfig}
                    onAccentColor={(color) => setBgAccent(color)}
                    circleId={circleId}
                  />
                </div>
              )}

              {activeTab === "list" && (
                <div className="card tech-display-frame rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-gray-400 text-sm">
                          <th className="px-4 py-3">{t("circle.colRank")}</th>
                          <th className="px-4 py-3">{t("circle.colUser")}</th>
                          <th className="px-4 py-3 text-pink-400">{t("circle.colMention")}</th>
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
                                  <AvatarImage
                                    hdUrl={item.user.profilePicture}
                                    name={item.user.userName}
                                    imgClassName="w-full h-full object-cover"
                                    fallbackClassName="w-full h-full flex items-center justify-center text-xs font-bold"
                                  />
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

              {activeTab === "family" && self && (
                <FamilyTree self={self} users={circleUsers} />
              )}

              {activeTab === "ai" && self && (
                <AIDiagnosisPanel self={self} users={circleUsers} />
              )}

              {activeTab === "value" && self && (
                <AccountValuePanel self={self} users={circleUsers} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
