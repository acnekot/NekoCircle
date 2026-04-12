"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DemoCircle from "@/components/DemoCircle";

type UserInfo = { ok: boolean; username?: string; subscribed?: boolean };
type DataSource = "twitter" | "yahoo";

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [user, setUser]           = useState<UserInfo | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [showLoginHint, setShowLoginHint] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>("twitter");

  // Check session on mount
  useEffect(() => {
    fetch("/api/user/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d: UserInfo) => setUser(d))
      .catch(() => setUser({ ok: false }))
      .finally(() => setUserLoading(false));
  }, []);

  const isLoggedIn = user?.ok === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

    // Yahoo mode: no login required, direct redirect
    if (dataSource === "yahoo") {
      const name = username.replace("@", "").trim();
      router.push(`/yahoo/${encodeURIComponent(name)}`);
      return;
    }

    if (!isLoggedIn) { setShowLoginHint(true); return; }
    setLoading(true);
    setError("");
    setShowLoginHint(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.replace("@", "").trim(), topCount: 50 }),
      });
      const data = await res.json();
      if (res.status === 401 && data.requireLogin) { setShowLoginHint(true); setLoading(false); return; }
      if (res.status === 403 && data.requireSubscription) { setError("Twitter API 模式权重尚未调好，暂不开放，请先使用 Yahoo 免费模式"); setLoading(false); return; }
      if (!res.ok) throw new Error(data.error ?? "分析失败");
      router.push(`/result/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "未知错误");
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/user/logout", { method: "POST", credentials: "include" });
    setUser({ ok: false });
  }

  return (
    <div className="gradient-bg min-h-screen flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-[#1d9bf0]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="font-bold text-white">NekoCircle</span>
        </div>

        <div className="flex items-center gap-3">
          {userLoading ? (
            <div className="w-4 h-4 rounded-full border border-white/10 border-t-white/40 animate-spin" />
          ) : isLoggedIn ? (
            <>
              <a href="/my" className="text-sm text-gray-300 hover:text-white transition-colors">
                我的圈子
              </a>
              <span className="text-gray-600 text-xs">@{user?.username}</span>
              <button onClick={logout} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                退出
              </button>
            </>
          ) : (
            <a href="/login" className="text-sm font-medium text-[#1d9bf0] hover:text-[#1a8cd8] transition-colors">
              登录 / 注册
            </a>
          )}
          <a href="/admin" className="text-gray-700 hover:text-gray-500 transition-colors" title="管理后台">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* Left: copy + form */}
          <div className="flex-1 w-full max-w-md lg:max-w-none">
            <div className="mb-8">
              <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mb-4">
                <span className="bg-gradient-to-r from-[#1d9bf0] to-[#7b6cf6] bg-clip-text text-transparent">
                  发现你的
                </span>
                <br />
                <span className="text-white">X 互动圈</span>
              </h1>
              <p className="text-gray-400 text-lg leading-relaxed">
                分析最近 75 条推文，基于 Reply / Quote / Mention / Retweet 与时间衰减计算亲密度，生成可下载的互动圈图谱。
              </p>
            </div>

            <div className="card rounded-2xl p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#1d9bf0] transition-colors">
                  <span className="text-gray-500 text-lg select-none">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setShowLoginHint(false); }}
                    placeholder="acnekot"
                    className="flex-1 bg-transparent outline-none text-white placeholder-gray-600 text-base"
                    disabled={loading}
                  />
                </div>

                {/* Data source selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setDataSource("twitter"); setShowLoginHint(false); }}
                    className={`relative flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      dataSource === "twitter"
                        ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/10 text-white"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/8"
                    }`}
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      twitterapi.io
                    </span>
                    <span className="text-[10px] text-gray-500 leading-tight">深度分析 · 需要登录</span>
                    {dataSource === "twitter" && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#1d9bf0]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDataSource("yahoo"); setShowLoginHint(false); setError(""); }}
                    className={`relative flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      dataSource === "yahoo"
                        ? "border-green-500/60 bg-green-500/10 text-white"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/8"
                    }`}
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="text-[11px]">🟢</span>
                      Yahoo 搜索
                    </span>
                    <span className="text-[10px] text-gray-500 leading-tight">免费 · 无需登录 · 基于 <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-300 transition-colors" onClick={(e) => e.stopPropagation()}>nareaitter</a></span>
                    {dataSource === "yahoo" && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-green-400" />
                    )}
                  </button>
                </div>

                {/* Login hint when not logged in (only for twitter mode) */}
                {dataSource === "twitter" && showLoginHint && !isLoggedIn && (
                  <div className="bg-[#1d9bf0]/10 border border-[#1d9bf0]/30 rounded-xl px-4 py-3 text-sm">
                    <p className="text-[#1d9bf0] font-medium mb-1">需要登录才能生成互动圈</p>
                    <p className="text-gray-400 text-xs mb-2">Twitter API 模式暂不开放，推荐使用 Yahoo 免费模式</p>
                    <a href="/login" className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#1d9bf0] hover:bg-[#1a8cd8] px-3 py-1.5 rounded-lg transition-colors">
                      立即登录 →
                    </a>
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className={`w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative transition-all ${
                    dataSource === "yahoo"
                      ? "bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400"
                      : "btn-primary"
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      正在创建任务...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      {dataSource === "twitter" && !isLoggedIn && !userLoading && (
                        <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      )}
                      {dataSource === "yahoo" ? "🟢 Yahoo 免费分析 →" : "开始分析 →"}
                    </span>
                  )}
                </button>

                {/* Not logged in passive reminder (twitter mode only) */}
                {dataSource === "twitter" && !userLoading && !isLoggedIn && !showLoginHint && (
                  <p className="text-center text-xs text-gray-600">
                    <a href="/login" className="text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2">登录</a>
                    {" "}后才能生成 · Twitter API 模式暂不开放
                  </p>
                )}

                {/* Yahoo mode hint */}
                {dataSource === "yahoo" && (
                  <p className="text-center text-xs text-gray-600">
                    通过 Yahoo 日本搜索获取公开 Mention 数据 · 仅含过去 30 天 · 无需 API Key · 灵感来自{" "}
                    <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-400 transition-colors">nareaitter</a>
                  </p>
                )}

                {/* Logged in: subscribed status (twitter mode only) */}
                {dataSource === "twitter" && isLoggedIn && !user?.subscribed && (
                  <p className="text-center text-xs text-gray-600">
                    <a href="/my" className="text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2">我的页面</a>
                    {" "}· Twitter API 模式权重调试中，暂不开放
                  </p>
                )}
              </form>
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              {dataSource === "twitter" ? (
                [
                  { label: "Reply", weight: "×10", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
                  { label: "Quote", weight: "×8", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                  { label: "Mention", weight: "×5", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
                  { label: "Retweet", weight: "×3", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
                ].map(({ label, weight, color, bg }) => (
                  <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${bg}`}>
                    <span className="text-gray-400">{label}</span>
                    <span className={`font-bold ${color}`}>{weight}</span>
                  </div>
                ))
              ) : (
                [
                  { label: "Mention", weight: "计数", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
                  { label: "免登录", weight: "✓", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
                  { label: "30 天内", weight: "⏱", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                ].map(({ label, weight, color, bg }) => (
                  <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${bg}`}>
                    <span className="text-gray-400">{label}</span>
                    <span className={`font-bold ${color}`}>{weight}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: animated canvas demo */}
          <div className="hidden lg:flex w-80 h-80 shrink-0 items-center justify-center">
            <DemoCircle />
          </div>

        </div>

        {/* How it works */}
        <div className="mt-16 w-full max-w-5xl">
          <h2 className="text-center text-xs font-semibold text-gray-600 uppercase tracking-widest mb-6">工作原理</h2>
          {dataSource === "twitter" ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { step: "01", icon: "📥", title: "抓取推文",  desc: "获取最近 75 条推文" },
                { step: "02", icon: "🔍", title: "分析互动",  desc: "提取回复、引用、提及与转推信号" },
                { step: "03", icon: "⚖️", title: "权重计算",  desc: "按四类互动和时间衰减综合排名" },
                { step: "04", icon: "🎨", title: "生成图谱",  desc: "渲染可下载的互动圈图" },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} className="card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="absolute top-2 right-3 text-white/4 font-black text-3xl select-none">{step}</div>
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-sm font-semibold text-white mb-1">{title}</div>
                  <div className="text-xs text-gray-500 leading-snug">{desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { step: "01", icon: "🔎", title: "Yahoo 搜索", desc: "通过 Yahoo 日本实时搜索公开 Mention" },
                { step: "02", icon: "📊", title: "统计次数",   desc: "统计每个用户的 @提及 次数" },
                { step: "03", icon: "🏆", title: "排名排序",   desc: "按提及次数从高到低排序" },
                { step: "04", icon: "🎨", title: "生成图谱",   desc: "渲染可下载的互动圈图" },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} className="card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="absolute top-2 right-3 text-white/4 font-black text-3xl select-none">{step}</div>
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-sm font-semibold text-white mb-1">{title}</div>
                  <div className="text-xs text-gray-500 leading-snug">{desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── 使用说明 ───────────────────────────────────────────── */}
      <section className="w-full bg-black/20 py-16 px-4">
        <div className="max-w-4xl mx-auto space-y-14">

          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">📖 使用说明</h2>
            <p className="text-gray-500 text-sm">
              {dataSource === "twitter" ? "从注册到生成，5 分钟上手 NekoCircle" : "无需注册，输入用户名即可免费生成"}
            </p>
          </div>

          {/* Step by step */}
          <div className="space-y-6">
            {(dataSource === "twitter" ? [
              {
                n: "01", color: "text-[#1d9bf0]", border: "border-[#1d9bf0]/20", bg: "bg-[#1d9bf0]/5",
                title: "注册 / 登录账号",
                desc: "点击右上角「登录」，填写用户名和密码完成注册。已有账号直接登录即可。登录状态会通过 Cookie 持久保存，关闭浏览器后再打开无需重新登录。",
                tips: ["用户名支持字母、数字、下划线", "密码长度不少于 6 位", "同一浏览器登录状态默认保留 30 天"],
              },
              {
                n: "02", color: "text-purple-400", border: "border-purple-400/20", bg: "bg-purple-400/5",
                title: "Twitter API 暂不开放",
                desc: "Twitter API 模式的权重参数尚未调好，暂不开放使用。目前推荐使用 Yahoo 免费模式体验互动圈功能。",
                tips: ["权重调试完成后会重新开放", "Yahoo 模式完全免费且无需登录", "两种模式生成的互动圈样式相同"],
              },
              {
                n: "03", color: "text-emerald-400", border: "border-emerald-400/20", bg: "bg-emerald-400/5",
                title: "输入 X (Twitter) 用户名",
                desc: "在首页输入框填入想分析的 X 用户名（@ 符号可加可不加），点击「生成互动圈」。系统会抓取该账号最近 75 条推文及其互动数据。",
                tips: ["用户名不区分大小写", "仅分析别人对该账号的互动（非该账号点赞别人）", "分析耗时约 30 秒 ~ 2 分钟，取决于互动数量"],
              },
              {
                n: "04", color: "text-amber-400", border: "border-amber-400/20", bg: "bg-amber-400/5",
                title: "查看互动圈 & 自定义样式",
                desc: "生成完成后进入结果页，左侧可调整背景色、节点大小、显示人数等样式，右侧实时预览。头像来自 X 真实头像，鼠标悬停可查看互动详情，点击头像跳转对应主页。",
                tips: ["最多展示 Top 50 互动用户", "基础权重：Reply ×10 · Quote ×8 · Mention ×5 · Retweet ×3", "最终得分会叠加时间衰减，并按主动 60% / 被动 40% 汇总"],
              },
              {
                n: "05", color: "text-pink-400", border: "border-pink-400/20", bg: "bg-pink-400/5",
                title: "下载图片",
                desc: "点击结果页顶部「下载图片」按钮，将互动圈以 PNG 格式保存到本地。图片分辨率与当前预览尺寸一致，建议在大屏设备上生成以获得更高清的图片。",
                tips: ["图片包含水印「NekoCircle」", "历史生成记录可在「我的」页面重新查看和下载", "可分享结果页链接给他人查看"],
              },
            ] : [
              {
                n: "01", color: "text-green-400", border: "border-green-400/20", bg: "bg-green-400/5",
                title: "输入 X (Twitter) 用户名",
                desc: "在首页输入框填入想分析的 X 用户名（@ 符号可加可不加），选择「Yahoo 搜索」模式，点击按钮即可开始。无需注册或登录。",
                tips: ["用户名不区分大小写", "完全免费，无需 API Key", "数据来自 Yahoo 日本实时搜索"],
              },
              {
                n: "02", color: "text-pink-400", border: "border-pink-400/20", bg: "bg-pink-400/5",
                title: "等待搜索完成",
                desc: "系统会通过 Yahoo 日本搜索引擎获取过去 30 天内公开的 @提及 数据，统计每个用户提及目标账号的次数。",
                tips: ["仅统计 Mention（@提及）数据", "仅含过去 30 天内的公开推文", "搜索耗时约 10 ~ 30 秒"],
              },
              {
                n: "03", color: "text-amber-400", border: "border-amber-400/20", bg: "bg-amber-400/5",
                title: "查看互动圈 & 自定义样式",
                desc: "搜索完成后可查看互动圈图谱，支持调整背景色、节点大小、显示人数等样式，实时预览效果。",
                tips: ["按 Mention 次数排名", "支持与 Twitter API 模式相同的样式自定义", "鼠标悬停可查看互动详情"],
              },
              {
                n: "04", color: "text-cyan-400", border: "border-cyan-400/20", bg: "bg-cyan-400/5",
                title: "下载图片",
                desc: "点击「下载图片」按钮，将互动圈以 PNG 格式保存到本地。",
                tips: ["图片包含水印「NekoCircle」", "Yahoo 模式结果不保存历史记录", "可直接分享图片给朋友"],
              },
            ]).map(({ n, color, border, bg, title, desc, tips }) => (
              <div key={n} className={`rounded-2xl border ${border} ${bg} p-6 flex gap-5`}>
                <div className={`text-3xl font-black ${color} opacity-40 select-none shrink-0 w-8 text-right leading-tight`}>{n}</div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-base mb-2 ${color}`}>{title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-3">{desc}</p>
                  <ul className="space-y-1">
                    {tips.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className={`mt-0.5 shrink-0 ${color}`}>›</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div>
            <h3 className="text-base font-semibold mb-5 text-center text-gray-400">常见问题</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {(dataSource === "twitter" ? [
                { q: "为什么有些头像加载不出来？", a: "X 头像需要通过代理加载，偶尔因网络波动失败属于正常现象，稍后刷新重试即可。" },
                { q: "分析结果和实际差距大怎么办？", a: "系统只抓取最近 75 条推文的互动，长期互动历史不在分析范围内。若账号互动频繁，数据会更准确。" },
                { q: "生成失败怎么办？", a: "Twitter API 模式目前权重未调好暂不开放。请切换到 Yahoo 搜索模式使用，完全免费且无需登录。" },
                { q: "历史记录保存多久？", a: "历史记录默认永久保存。结果页链接可随时分享给他人查看。" },
                { q: "支持分析私密账号吗？", a: "不支持。系统只能分析公开账号，私密账号的推文和互动无法通过 API 获取。" },
                { q: "为什么 Mention 数量是 0？", a: "Mention 数据来自独立的 API 搜索，部分账号可能因 API 限制导致数据为空，不影响其他互动类型统计。" },
                { q: "什么是 Shadowban（影子封禁）？", a: "Shadowban 是 X 平台的一种限流手段，被限制的账号发的推文、回复不会出现在其他用户的时间线或搜索结果中，但账号本身不会收到任何通知。" },
                { q: "互动圈能检测 Shadowban 吗？", a: "可以间接反映。如果某个账号的互动分数突然大幅下降，或者活跃互动用户明显减少，可能是遭到了不同程度的 Shadowban 限制。" },
                { q: "Shadowban 有哪些类型？", a: "常见的有：搜索 Shadowban（推文不出现在搜索结果）、回复 Shadowban（回复被折叠隐藏）、推荐流 Shadowban（不推送给非关注者）。互动圈中回复者减少通常与回复 Shadowban 相关。" },
                { q: "如何判断自己是否被 Shadowban？", a: "可以退出登录后搜索自己的用户名和推文，若搜不到则可能被搜索 Shadowban。也可观察互动圈中近期 Reply 数量是否异常减少。第三方工具如 hisubway.com 也可辅助检测。" },
              ] : [
                { q: "Yahoo 模式和 Twitter API 模式有什么区别？", a: "Yahoo 模式只统计 @提及 数据，免费无需登录；Twitter API 模式分析回复、引用、提及、转推四种互动，数据更全面但权重尚在调试中暂不开放。" },
                { q: "为什么只有 30 天的数据？", a: "Yahoo 实时搜索只索引过去约 30 天的推文，更早的数据无法获取。如需更深度的分析，建议使用 Twitter API 模式。" },
                { q: "Yahoo 模式需要注册吗？", a: "不需要。Yahoo 模式完全免费，无需注册、登录，输入用户名即可直接生成。" },
                { q: "搜索结果不准确怎么办？", a: "Yahoo 搜索依赖公开推文索引，如果目标账号是私密账号或推文被删除，可能导致数据不完整。" },
                { q: "为什么有些用户没出现在结果中？", a: "Yahoo 模式只统计 @提及，不包含回复、引用和转推。如果互动主要通过回复进行，可能不会被统计到。" },
                { q: "Yahoo 模式的结果会保存吗？", a: "不会。Yahoo 模式的结果仅在当前页面显示，刷新页面后需要重新搜索。如需保存历史记录，请使用 Twitter API 模式。" },
              ]).map(({ q, a }) => (
                <div key={q} className="card rounded-xl p-4">
                  <div className="text-sm font-medium text-white mb-1.5">Q: {q}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">A: {a}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weight table */}
          <div className="card rounded-2xl p-6">
            <h3 className="text-sm font-semibold mb-4 text-gray-400">
              {dataSource === "twitter" ? "⚖️ 互动权重说明" : "📊 计分规则"}
            </h3>
            {dataSource === "twitter" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { type: "Reply", weight: "×10", color: "text-blue-400", border: "border-blue-400/20", desc: "回复是最强的基础交流信号" },
                    { type: "Quote", weight: "×8", color: "text-purple-400", border: "border-purple-400/20", desc: "带观点的引用转发，属于深度互动" },
                    { type: "Mention", weight: "×5", color: "text-pink-400", border: "border-pink-400/20", desc: "主动点名对方，代表显式话题连接" },
                    { type: "Retweet", weight: "×3", color: "text-green-400", border: "border-green-400/20", desc: "普通扩散行为，成本最低" },
                  ].map(({ type, weight, color, border, desc }) => (
                    <div key={type} className={`rounded-xl border ${border} p-4 text-center`}>
                      <div className={`text-2xl font-black ${color} mb-1`}>{weight}</div>
                      <div className={`text-sm font-semibold ${color} mb-1`}>{type}</div>
                      <div className="text-xs text-gray-600 leading-snug">{desc}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-700 text-center mt-4">
                  当前自动计分 = (主动互动得分 × 0.6) + (被动互动得分 × 0.4)，其中每次互动都会按时间衰减；基础权重为 Reply×10、Quote×8、Mention×5、Retweet×3。
                </p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-pink-400/20 p-4 text-center">
                    <div className="text-2xl font-black text-pink-400 mb-1">@提及</div>
                    <div className="text-sm font-semibold text-pink-400 mb-1">Mention 次数</div>
                    <div className="text-xs text-gray-600 leading-snug">唯一计分维度，按提及次数直接排名</div>
                  </div>
                  <div className="rounded-xl border border-green-400/20 p-4 text-center">
                    <div className="text-2xl font-black text-green-400 mb-1">30 天</div>
                    <div className="text-sm font-semibold text-green-400 mb-1">时间范围</div>
                    <div className="text-xs text-gray-600 leading-snug">仅统计过去 30 天内的公开推文</div>
                  </div>
                  <div className="rounded-xl border border-cyan-400/20 p-4 text-center">
                    <div className="text-2xl font-black text-cyan-400 mb-1">免费</div>
                    <div className="text-sm font-semibold text-cyan-400 mb-1">无需 API Key</div>
                    <div className="text-xs text-gray-600 leading-snug">通过 Yahoo 日本搜索，无需任何密钥</div>
                  </div>
                </div>
                <p className="text-xs text-gray-700 text-center mt-4">
                  Yahoo 模式仅统计 @提及 次数，不区分互动方向，不含时间衰减。适合快速了解谁在近期频繁提及你。
                </p>
              </>
            )}
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-800 border-t border-white/5">
        NekoCircle · by 好奇猫a · 基于 twitterapi.io
        <span className="mx-2">·</span>
        Yahoo 搜索灵感来自 <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors underline underline-offset-2">nareaitter</a>
        <span className="mx-2">·</span>
        <a href="https://github.com/acnekot/NekoCircle" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors underline underline-offset-2">GitHub</a>
        <span className="mx-2">·</span>
        <a href="/admin/login" className="hover:text-gray-600 transition-colors">·</a>
      </footer>

    </div>
  );
}
