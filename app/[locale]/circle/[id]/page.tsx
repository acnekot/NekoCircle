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
import Md3Icon, { type Md3IconName } from "@/components/Md3Icon";

type UnifiedCircle = {
  source: "yahoo";
  id: string;
  username: string;
  created_at: number;
  storage_consent: boolean;
  consented_at: number | null;
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
  const [highlightedUsername, setHighlightedUsername] = useState<string | null>(null);

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
      className="md3-app-surface gradient-bg min-h-screen py-5 sm:py-8 px-4 sm:px-6"
      style={bgAccent ? {
        background: `radial-gradient(ellipse at 30% 10%, ${bgAccent}20 0%, transparent 55%), radial-gradient(ellipse at 84% 4%, rgba(99, 106, 204, .16), transparent 34rem), #121318`
      } : undefined}
    >
      <div className="max-w-[1440px] mx-auto">

        {/* Header */}
        <div className="tech-panel rounded-[28px] flex items-center gap-4 mb-6 px-4 sm:px-6 py-4 sm:py-5">
          <a href={`/${locale}`} className="md3-tonal-button shrink-0">{t("common.backHome")}</a>
          {circle && (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="hud-label px-3 py-1.5 rounded-full bg-[#3c4278]/70 border border-[#bec2ff]/15">
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
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#bec2ff] animate-spin" />
            <div className="text-center">
              <p className="text-white font-medium">{t("circle.loading")}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card rounded-2xl p-8 text-center">
            <Md3Icon name="error" className="mx-auto mb-4 h-10 w-10 text-red-300" />
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
                    <Md3Icon name="share" className="h-4 w-4" />
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
              <FindYourself
                topUsers={result.topUsers}
                ownerUsername={circle?.username}
                onHighlight={(name) => {
                  setHighlightedUsername(name);
                  if (name) setActiveTab("circle");
                }}
              />
            </div>

            {/* Right: Circle + List tabs */}
            <div className="result-main">
              {/* Tab bar */}
              <div className="tech-tabs flex flex-wrap gap-1 mb-4">
                {([
                  ["circle", t("circle.tabCircle"), "bubble"],
                  ["list", t("circle.tabList"), "list"],
                  ["family", t("extras.tabFamily"), "tree"],
                  ["ai", t("extras.tabAI"), "sparkle"],
                  ["value", t("extras.tabValue"), "wallet"],
                ] as [Tab, string, Md3IconName][]).map(([tab, label, icon]) => (
                  <button key={tab} type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      activeTab === tab
                        ? "bg-[#3c4278] text-[#dfe0ff] border border-[#bec2ff]/20"
                        : "border border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    }`}
                  ><Md3Icon name={icon} className="h-4 w-4" />{label}</button>
                ))}
              </div>

              {activeTab === "circle" && (
                <div className="card tech-display-frame result-chart-stage grid place-items-center p-2 sm:p-3">
                  <CircleChart
                    result={result}
                    style={styleConfig}
                    onAccentColor={(color) => setBgAccent(color)}
                    circleId={circleId}
                    highlightedUsername={highlightedUsername}
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
                                className="flex items-center gap-3 hover:text-[#bec2ff] transition-colors">
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

            <footer className="order-3 col-span-full mt-2 flex flex-col gap-2 border-t border-white/10 px-1 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t("yahoo.inspirationFrom")} {" "}
                <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="text-[#bec2ff] underline underline-offset-4 transition-colors hover:text-white">nareaitter</a>
              </span>
              <span className="inline-flex items-center gap-2">
                <Md3Icon name={circle?.storage_consent ? "check" : "restart"} className="h-4 w-4 text-[#bec2ff]" />
                <span><span className="text-slate-400">{t("yahoo.storageLabel")}：</span>{circle?.storage_consent ? t("yahoo.storageLongTerm") : t("yahoo.storageTemporary")}</span>
              </span>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
