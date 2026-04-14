"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DemoCircle from "@/components/DemoCircle";
import AnnouncementBanner from "@/components/AnnouncementBanner";

type GenerationCounts = { yahoo: number; total: number };

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername]   = useState("");
  const [error, setError]         = useState("");
  const [genCounts, setGenCounts] = useState<GenerationCounts | null>(null);
  const [circleLookupId, setCircleLookupId] = useState("");
  const [circleLookupError, setCircleLookupError] = useState("");

  // Fetch generation counts
  useEffect(() => {
    fetch("/api/generation-stats")
      .then((r) => r.json())
      .then((d: GenerationCounts) => setGenCounts(d))
      .catch(() => {});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    const name = username.replace("@", "").trim();
    router.push(`/yahoo/${encodeURIComponent(name)}`);
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
          <a href="/stats" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">统计</a>
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
                通过 Yahoo 搜索获取公开 Mention 数据，基于过去 30 天的 @提及 次数生成可下载的互动圈图谱。免费、无需登录。
              </p>
            </div>

            <AnnouncementBanner />

            <div className="card rounded-2xl p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#1d9bf0] transition-colors">
                  <span className="text-gray-500 text-lg select-none">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(""); }}
                    placeholder="acnekot"
                    className="flex-1 bg-transparent outline-none text-white placeholder-gray-600 text-base"
                  />
                </div>

                {/* Generation count stats */}
                {genCounts && genCounts.total > 0 && (
                  <div className="flex items-center justify-center gap-3 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-500">🟢</span>
                      <span className="text-gray-400">已生成</span>
                      <span className="font-bold text-white tabular-nums">{genCounts.total}</span>
                      <span className="text-gray-400">次</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!username.trim()}
                  className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none relative transition-all bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400"
                >
                  <span className="flex items-center justify-center gap-2">
                    🟢 Yahoo 免费分析 →
                  </span>
                </button>

                <p className="text-center text-xs text-gray-600">
                  通过 Yahoo 日本搜索获取公开 Mention 数据 · 仅含过去 30 天 · 无需 API Key · 灵感来自{" "}
                  <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-400 transition-colors">nareaitter</a>
                </p>
              </form>
            </div>

            {/* 查找已有圈子 */}
            <div className="card rounded-2xl p-5 mt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                <span>🔗</span> 查找已有圈子
              </h3>
              <p className="text-xs text-gray-600 mb-3">输入圈子 ID 查看已生成的互动圈</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={circleLookupId}
                  onChange={(e) => { setCircleLookupId(e.target.value); setCircleLookupError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && circleLookupId.trim()) {
                      router.push(`/circle/${encodeURIComponent(circleLookupId.trim())}`);
                    }
                  }}
                  placeholder="圈子 ID（8 位）"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-white/30 transition-colors"
                />
                <button
                  onClick={() => {
                    const id = circleLookupId.trim();
                    if (!id) { setCircleLookupError("请输入圈子 ID"); return; }
                    router.push(`/circle/${encodeURIComponent(id)}`);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 transition-all shrink-0"
                >
                  查看 →
                </button>
              </div>
              {circleLookupError && (
                <p className="text-xs text-red-400 mt-2">{circleLookupError}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { label: "Mention", weight: "计数", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
                { label: "免登录", weight: "✓", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
                { label: "30 天内", weight: "⏱", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
              ].map(({ label, weight, color, bg }) => (
                <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${bg}`}>
                  <span className="text-gray-400">{label}</span>
                  <span className={`font-bold ${color}`}>{weight}</span>
                </div>
              ))}
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
        </div>
      </main>

      {/* ── 使用说明 ───────────────────────────────────────────── */}
      <section className="w-full bg-black/20 py-16 px-4">
        <div className="max-w-4xl mx-auto space-y-14">

          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">📖 使用说明</h2>
            <p className="text-gray-500 text-sm">无需注册，输入用户名即可免费生成</p>
          </div>

          {/* Step by step */}
          <div className="space-y-6">
            {[
              {
                n: "01", color: "text-green-400", border: "border-green-400/20", bg: "bg-green-400/5",
                title: "输入 X (Twitter) 用户名",
                desc: "在首页输入框填入想分析的 X 用户名（@ 符号可加可不加），点击按钮即可开始。无需注册或登录。",
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
                tips: ["按 Mention 次数排名", "支持丰富的样式自定义选项", "鼠标悬停可查看互动详情"],
              },
              {
                n: "04", color: "text-cyan-400", border: "border-cyan-400/20", bg: "bg-cyan-400/5",
                title: "下载图片",
                desc: "点击「下载图片」按钮，将互动圈以 PNG 格式保存到本地。",
                tips: ["图片包含水印「NekoCircle」", "可直接分享图片给朋友", "支持分享到 X"],
              },
            ].map(({ n, color, border, bg, title, desc, tips }) => (
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
              {[
                { q: "为什么只有 30 天的数据？", a: "Yahoo 实时搜索只索引过去约 30 天的推文，更早的数据无法获取。" },
                { q: "需要注册吗？", a: "不需要。完全免费，无需注册、登录，输入用户名即可直接生成。" },
                { q: "搜索结果不准确怎么办？", a: "Yahoo 搜索依赖公开推文索引，如果目标账号是私密账号或推文被删除，可能导致数据不完整。" },
                { q: "为什么有些用户没出现在结果中？", a: "仅统计 @提及，不包含回复、引用和转推。如果互动主要通过回复进行，可能不会被统计到。" },
                { q: "结果会保存吗？", a: "会。生成的圈子会保存并分配唯一 ID，可以通过 ID 随时查看。" },
                { q: "为什么有些头像加载不出来？", a: "X 头像需要通过代理加载，偶尔因网络波动失败属于正常现象，稍后刷新重试即可。" },
              ].map(({ q, a }) => (
                <div key={q} className="card rounded-xl p-4">
                  <div className="text-sm font-medium text-white mb-1.5">Q: {q}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">A: {a}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weight table */}
          <div className="card rounded-2xl p-6">
            <h3 className="text-sm font-semibold mb-4 text-gray-400">📊 计分规则</h3>
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
              仅统计 @提及 次数，不区分互动方向，不含时间衰减。适合快速了解谁在近期频繁提及你。
            </p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-800 border-t border-white/5">
        NekoCircle · by 好奇猫a
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
