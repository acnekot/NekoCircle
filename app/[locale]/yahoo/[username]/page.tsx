"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import CircleChart, { renderToCanvas } from "@/components/CircleChart";
import StylePanel from "@/components/StylePanel";
import FindYourself from "@/components/FindYourself";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FamilyTree from "@/components/FamilyTree";
import AvatarImage from "@/components/AvatarImage";
import AccountValuePanel from "@/components/AccountValuePanel";
import DataCallPanel from "@/components/DataCallPanel";
import { DEFAULT_STYLE, loadStyleConfig, saveStyleConfig, type StyleConfig } from "@/lib/style";
import type { CircleUser, SelfProfile } from "@/types/circle";
import { yahooToAnalysisResult } from "@/lib/circle-convert";
import { readYahooCircleCache, writeYahooCircleCache } from "@/lib/yahoo-client-cache";
import { useTranslation } from "@/components/LocaleProvider";
import Md3Icon, { type Md3IconName } from "@/components/Md3Icon";
import type { InteractionDiagnostics } from "@/types/interaction";

type Tab = "circle" | "list" | "family" | "value" | "data";

type YahooMentionsResponse = InteractionDiagnostics & {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  profileFollowers?: number;
  profileFollowing?: number;
  profileTweets?: number;
  profileLikes?: number;
  profileJoinedAt?: string;
  circleId?: string;
  createdAt?: number;
  storageConsent?: boolean;
  retentionMode?: "long_term" | "temporary";
  xkit?: { status: "unavailable" | "ok" | "partial"; reason?: string; scannedLikes?: number; elapsedMs?: number };
  error?: string;
};

type XKitBetaState = "idle" | "loading" | "ok" | "partial" | "unavailable" | "error";

const EMPTY_SELF: SelfProfile = { screenName: "", displayName: "" };

export default function YahooCirclePage() {
  const params = useParams();
  const username = (params?.username as string) ?? "";
  const { locale, t } = useTranslation();

  const [self, setSelf] = useState<SelfProfile>(EMPTY_SELF);
  const [users, setUsers] = useState<CircleUser[]>([]);
  const [counts, setCounts] = useState<{ toYou: number; fromYou: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [styleConfig, setStyleConfig] = useState<StyleConfig>(DEFAULT_STYLE);
  const [bgAccent, setBgAccent] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("circle");
  const [circleId, setCircleId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [storedLongTerm, setStoredLongTerm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedUsername, setHighlightedUsername] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<InteractionDiagnostics | null>(null);
  const [xkitBetaState, setXkitBetaState] = useState<XKitBetaState>("idle");
  const [xkitBindAvailable, setXkitBindAvailable] = useState(false);
  const [xkitBoundAccount, setXkitBoundAccount] = useState<string | null>(null);

  useEffect(() => { setStyleConfig(loadStyleConfig()); }, []);
  const handleStyleChange = (s: StyleConfig) => { setStyleConfig(s); saveStyleConfig(s); };

  const applyPayload = useCallback((data: YahooMentionsResponse) => {
    setCounts({ toYou: data.counts.mentionsToYou, fromYou: data.counts.mentionsFromYou });
    setUsers(data.circleUsers ?? []);
    setSelf({
      screenName: data.screenName,
      displayName: data.screenName,
      avatarUrl: data.selfAvatarUrl,
      avatarUrlPreview: data.selfAvatarUrlPreview,
      mentionTotal: data.counts.mentionsToYou + data.counts.mentionsFromYou,
      profileFollowers: data.profileFollowers,
      profileFollowing: data.profileFollowing,
      profileTweets: data.profileTweets,
      profileLikes: data.profileLikes,
      profileJoinedAt: data.profileJoinedAt,
    });
    if (data.circleId) setCircleId(data.circleId);
    if (data.createdAt) setCreatedAt(data.createdAt);
    setStoredLongTerm(data.storageConsent === true || data.retentionMode === "long_term");
    setDiagnostics(data);
  }, []);

  /**
   * force = true のときはキャッシュを全部迂回して取り直す。
   * ブラウザの sessionStorage もここで意図的に飛ばす。
   */
  const load = useCallback(async (force: boolean) => {
    const name = username.replace(/^@+/, "");
    if (!name) return;

    if (force) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const requestedStorageConsent =
        searchParams.get("storageConsent") === "1" ||
        searchParams.get("storageConsent") === "true";
      const requestedXKit = searchParams.get("xkit") === "1";
      if (!force && !requestedXKit) {
        const cached = readYahooCircleCache(name, requestedStorageConsent);
        if (cached) {
          applyPayload({
            screenName: cached.screenName,
            counts: cached.counts,
            circleUsers: cached.circleUsers,
            selfAvatarUrl: cached.selfAvatarUrl,
            selfAvatarUrlPreview: cached.selfAvatarUrlPreview,
            profileFollowers: cached.profileFollowers,
            profileFollowing: cached.profileFollowing,
            profileTweets: cached.profileTweets,
            profileLikes: cached.profileLikes,
            profileJoinedAt: cached.profileJoinedAt,
            circleId: cached.circleId,
            createdAt: cached.createdAt,
            storageConsent: cached.storageConsent,
            retentionMode: cached.retentionMode,
            dataVersion: cached.dataVersion,
            sourceStatus: cached.sourceStatus,
            stats: cached.stats,
            timings: cached.timings,
            entries: cached.entries,
          });
          return;
        }
      }

      const q = new URLSearchParams({ screenName: name, buildCircle: "1" });
      q.set("storageConsent", requestedStorageConsent ? "1" : "0");
      if (requestedXKit) q.set("xkit", "1");
      if (force) q.set("refresh", "1");
      const r = await fetch(`/api/yahoo-mentions?${q.toString()}`, {
        cache: force || requestedXKit ? "no-store" : "default",
      });
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        // 数据源异常时边缘节点可能返回 HTML 错误页，直接 r.json() 会抛出
        // "Unexpected token '<'" 这类内部错误，这里统一转成可读提示。
        throw new Error(t("yahoo.dataFailed"));
      }
      const data = (await r.json()) as YahooMentionsResponse;
      if (data.error) { setError(data.error); return; }
      applyPayload(data);
      if (!requestedXKit) writeYahooCircleCache(name, requestedStorageConsent, {
        screenName: data.screenName,
        counts: data.counts,
        circleUsers: data.circleUsers,
        selfAvatarUrl: data.selfAvatarUrl,
        selfAvatarUrlPreview: data.selfAvatarUrlPreview,
        profileFollowers: data.profileFollowers,
        profileFollowing: data.profileFollowing,
        profileTweets: data.profileTweets,
        profileLikes: data.profileLikes,
        profileJoinedAt: data.profileJoinedAt,
        circleId: data.circleId,
        createdAt: data.createdAt,
        storageConsent: data.storageConsent,
        retentionMode: data.retentionMode,
        dataVersion: data.dataVersion,
        sourceStatus: data.sourceStatus,
        stats: data.stats,
        timings: data.timings,
        entries: data.entries,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("yahoo.dataFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [username, applyPayload, t]);

  const tryXKitBeta = useCallback(async () => {
    const name = username.replace(/^@+/, "");
    if (!name || xkitBetaState === "loading") return;
    setXkitBetaState("loading");
    try {
      const query = new URLSearchParams({ screenName: name });
      const response = await fetch(`/api/xkit/enhance?${query.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as YahooMentionsResponse;
      if (!response.ok || data.error) {
        if (data.error === "xkit_not_bound") {
          setXkitBoundAccount(null);
          setXkitBetaState("idle");
        } else {
          setXkitBetaState(data.error === "xkit_beta_unavailable" ? "unavailable" : "error");
        }
        return;
      }
      const status = data.xkit?.status ?? "unavailable";
      setXkitBetaState(status);
      // An unavailable optional provider must never replace the valid public-data result.
      if (status === "ok" || status === "partial") {
        // Beta output is transient; don't associate it with the previously saved public circle.
        setCircleId(null);
        applyPayload({
          ...data,
          circleId: undefined,
          createdAt: createdAt ?? undefined,
          storageConsent: storedLongTerm,
          retentionMode: storedLongTerm ? "long_term" : "temporary",
        });
      }
    } catch {
      setXkitBetaState("error");
    }
  }, [username, xkitBetaState, applyPayload, circleId, createdAt, storedLongTerm]);

  const unbindXKit = useCallback(async () => {
    try {
      await fetch("/api/xkit/bind", { method: "DELETE", cache: "no-store" });
    } finally {
      setXkitBoundAccount(null);
      setXkitBetaState("idle");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/xkit/bind", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { available?: boolean; bound?: boolean; accountName?: string }) => {
        if (!active) return;
        setXkitBindAvailable(data.available === true);
        setXkitBoundAccount(data.bound === true ? data.accountName ?? null : null);
      })
      .catch(() => {
        if (active) setXkitBindAvailable(false);
      });
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    if (!username) return;
    setXkitBetaState("idle");
    // ?refresh=1 付きで開かれたら最初から強制再取得
    const sp = new URLSearchParams(window.location.search);
    const force =
      sp.get("refresh") === "1" ||
      sp.get("ref") === "1" ||
      sp.get("force") === "1";
    void load(force);
  }, [username, load]);

  const analysisResult =
    self.screenName && counts
      ? yahooToAnalysisResult(self, users, counts)
      : null;

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
    renderToCanvas(offscreen, displayedResult, styleConfig, imgCache, {
      exportScale: EXPORT_SCALE,
      circleId: styleConfig.showCircleId ? circleId ?? undefined : undefined,
    });
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

  const shareCircle = async () => {
    const cid = circleId ?? "";
    const pageUrl = cid
      ? `https://circle.catsuki.cc/${locale}/circle/${cid}`
      : `${window.location.origin}/${locale}/yahoo/${encodeURIComponent(username)}`;
    const shareText = `${t("yahoo.shareText1")}\n${t("yahoo.shareText2")} ${pageUrl}\n${t("yahoo.shareText3")}`;
    try {
      const blob = await getCanvasBlob();
      if (blob && navigator.canShare?.({ files: [new File([blob], "circle.png", { type: "image/png" })] })) {
        await navigator.share({ text: shareText, files: [new File([blob], `yahoo-circle-${username}.png`, { type: "image/png" })] });
        return;
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
    await downloadCanvas();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
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
        <header className="tech-panel result-header rounded-[28px] mb-5 sm:mb-6 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <a href={`/${locale}`} className="md3-tonal-button shrink-0">{t("common.backHome")}</a>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {circleId && (
                <button
                  onClick={() => { navigator.clipboard.writeText(circleId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                  className="text-xs text-gray-600 font-mono hover:text-gray-400 transition-colors cursor-pointer flex items-center gap-1"
                  title={t("common.copyId")}
                >
                  ID: {circleId.slice(0, 8)}
                  {copied ? (
                    <span className="text-green-400 text-xs ml-1">{t("common.copied")}</span>
                  ) : (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  )}
                </button>
              )}
            </div>
            <LanguageSwitcher />
          </div>

          <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <h1 className="tech-title text-3xl sm:text-4xl font-bold text-white">
              @{username}
                <span className="ml-2 text-base sm:text-lg font-normal text-slate-400">{t("yahoo.circle")}</span>
              </h1>
              {createdAt && (
                <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.55)]" />
                  {t("yahoo.generatedAt")} <span className="text-slate-300">{new Date(createdAt).toLocaleString(locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "zh-CN")}</span>
                </p>
              )}
            </div>

            {displayedResult && (
              <div className="result-actions grid w-full grid-cols-3 gap-2 xl:w-auto">
                <button type="button" onClick={() => { void shareCircle(); }} className="btn-primary result-action">
                  <Md3Icon name="share" className="h-4 w-4" />
                  <span>{t("common.share")}</span>
                </button>
                <button type="button" onClick={() => { void downloadCanvas(); }} className="result-action bg-white/[0.055] text-slate-200 hover:bg-white/10">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></svg>
                  <span>{t("common.download")}</span>
                </button>
                <button type="button" onClick={() => { void load(true); }} disabled={refreshing || loading} className="result-action bg-white/[0.055] text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                  <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66" /><path d="M20 4v7h-7" /></svg>
                  <span>{refreshing ? t("yahoo.loading") : t("common.forceRefresh")}</span>
                </button>
              </div>
            )}
          </div>

          {counts && (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
              <div className="result-stat">
                <span>{t("yahoo.mentionTo").replace(/[：:]\s*$/, "")}</span>
                <strong>{counts.toYou}</strong>
              </div>
              <div className="result-stat">
                <span>{t("yahoo.mentionFrom").replace(/[：:]\s*$/, "")}</span>
                <strong>{counts.fromYou}</strong>
              </div>
              <div className="result-stat">
                <span>{t("yahoo.users").replace(/[：:]\s*$/, "")}</span>
                <strong>{users.length}</strong>
              </div>
            </div>
          )}

          {displayedResult && (
            <section className="mt-3 flex flex-col gap-3 rounded-2xl border border-[#bec2ff]/15 bg-[#3c4278]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Md3Icon name="sparkle" className="mt-0.5 h-5 w-5 shrink-0 text-[#bec2ff]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">{t("yahoo.xkitBetaTitle")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {!xkitBindAvailable
                      ? t("yahoo.xkitBeta.localOnly")
                      : xkitBoundAccount
                        ? t(`yahoo.xkitBeta.${xkitBetaState}`)
                        : t("yahoo.xkitBeta.bindRequired")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {xkitBindAvailable && !xkitBoundAccount && (
                  <Link href={`/${locale}/xkit/bind/${encodeURIComponent(username.replace(/^@+/, ""))}`} className="result-action border-[#bec2ff]/20 bg-[#3c4278]/35 text-[#dfe0ff] hover:bg-[#3c4278]/60">
                    <Md3Icon name="key" className="h-4 w-4" />
                    <span>{t("yahoo.xkitBeta.bindButton")}</span>
                  </Link>
                )}
                {xkitBoundAccount && <>
                  <button type="button" onClick={() => { void tryXKitBeta(); }} disabled={xkitBetaState === "loading"} className="result-action border-[#bec2ff]/20 bg-[#3c4278]/35 text-[#dfe0ff] hover:bg-[#3c4278]/60 disabled:cursor-wait disabled:opacity-60">
                    <Md3Icon name="sparkle" className={`h-4 w-4 ${xkitBetaState === "loading" ? "animate-spin" : ""}`} />
                    <span>{xkitBetaState === "loading" ? t("yahoo.xkitBeta.loadingButton") : t("yahoo.xkitBeta.button")}</span>
                  </button>
                  <button type="button" onClick={() => { void unbindXKit(); }} className="result-action bg-white/[0.055] text-slate-300 hover:bg-white/10">
                    <Md3Icon name="close" className="h-4 w-4" />
                    <span>{t("yahoo.xkitBeta.unbindButton")}</span>
                  </button>
                </>}
              </div>
            </section>
          )}
        </header>

        {/* Loading */}
        {loading && (
          <div className="card loading-stage rounded-2xl p-6 sm:p-10">
            <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-[1fr_1.1fr] md:items-center">
              <div>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#bec2ff]/15 bg-[#3c4278]/35">
                  <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-[#bec2ff] animate-spin" />
                </div>
                <p className="text-lg font-semibold text-white">{t("yahoo.loading")}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{t("yahoo.loadingSub")}</p>
              </div>
              <div className="loading-progress-card" aria-hidden="true">
                <div className="loading-progress-track"><span /></div>
                <div className="loading-skeleton-row"><i /><i /><i /></div>
                <div className="loading-skeleton-line loading-skeleton-line-wide" />
                <div className="loading-skeleton-line" />
              </div>
            </div>
          </div>
        )}

        {/* Error（データが何も出せないときだけ全面表示。既存の描画を消さないため） */}
        {!loading && error && !displayedResult && (
          <div className="card rounded-2xl p-8 text-center">
            <Md3Icon name="error" className="mx-auto mb-4 h-10 w-10 text-red-300" />
            <h2 className="text-lg font-bold text-red-400 mb-2">{t("yahoo.error")}</h2>
            <p className="text-gray-400 text-sm">{error}</p>
            <a href={`/${locale}`} className="btn-primary inline-block mt-6 px-6 py-2 rounded-xl text-sm font-medium">{t("common.returnHome")}</a>
          </div>
        )}

        {/* Result */}
        {!loading && displayedResult && (
          <div className="result-layout">

            {/* Left: style panel */}
            <div className="result-sidebar space-y-3">
              {/* 強制再取得に失敗しても、いま表示中の結果は残す */}
              {error && (
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <StylePanel
                value={styleConfig}
                onChange={handleStyleChange}
                maxUsers={users.length}
                showAllOption
              />
              {/* Find yourself */}
              {displayedResult && (
                <FindYourself
                  topUsers={displayedResult.topUsers}
                  ownerUsername={username}
                  onHighlight={(name) => {
                    setHighlightedUsername(name);
                    if (name) setActiveTab("circle");
                  }}
                />
              )}
            </div>

            {/* Right: Circle + List tabs */}
            <div className="result-main">

              {/* Tab bar */}
              <div className="tech-tabs tech-tabs-scroll flex flex-nowrap gap-1 mb-4 overflow-x-auto">
                {([
                  ["circle", t("yahoo.tabCircle"), "bubble"],
                  ["list", t("yahoo.tabList"), "list"],
                  ["family", t("extras.tabFamily"), "tree"],
                  ["value", t("extras.tabValue"), "wallet"],
                  ["data", t("calls.tab"), "chart"],
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
                    result={displayedResult}
                    style={styleConfig}
                    onAccentColor={(color) => setBgAccent(color)}
                    circleId={circleId ?? undefined}
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
                          <th className="px-4 py-3">{t("yahoo.colRank")}</th>
                          <th className="px-4 py-3">{t("yahoo.colUser")}</th>
                          <th className="px-4 py-3 text-pink-400">{t("yahoo.colMention")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u, i) => (
                          <tr key={u.screenName} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-gray-500 font-mono text-sm">{i + 1}</td>
                            <td className="px-4 py-3">
                              <a href={`https://x.com/${u.screenName}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-3 hover:text-[#bec2ff] transition-colors">
                                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden shrink-0">
                                  <AvatarImage
                                    previewUrl={u.avatarUrlPreview}
                                    hdUrl={u.avatarUrl}
                                    name={u.screenName}
                                    imgClassName="w-full h-full object-cover"
                                    fallbackClassName="w-full h-full flex items-center justify-center text-xs font-bold"
                                  />
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

              {activeTab === "family" && <FamilyTree self={self} users={users} />}

              {activeTab === "value" && <AccountValuePanel self={self} users={users} />}

              {activeTab === "data" && <DataCallPanel data={diagnostics} />}

            </div>

            <footer className="order-3 col-span-full mt-2 flex flex-col gap-2 border-t border-white/10 px-1 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t("yahoo.inspirationFrom")} {" "}
                <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="text-[#bec2ff] underline underline-offset-4 transition-colors hover:text-white">nareaitter</a>
              </span>
              <span className="inline-flex items-center gap-2">
                <Md3Icon name={storedLongTerm ? "check" : "restart"} className="h-4 w-4 text-[#bec2ff]" />
                <span><span className="text-slate-400">{t("yahoo.storageLabel")}：</span>{storedLongTerm ? t("yahoo.storageLongTerm") : t("yahoo.storageTemporary")}</span>
              </span>
            </footer>
          </div>
        )}

      </div>
    </div>
  );
}
