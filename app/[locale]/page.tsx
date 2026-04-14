"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DemoCircle from "@/components/DemoCircle";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/components/LocaleProvider";

type HomeStats = {
  yahooCircleCount: number;
  yahooUniqueUsers: number;
  totalGenerations: number;
  todayCount: number;
};

export default function HomePage() {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [username, setUsername]   = useState("");
  const [error, setError]         = useState("");
  const [homeStats, setHomeStats] = useState<HomeStats | null>(null);
  const [circleLookupId, setCircleLookupId] = useState("");
  const [circleLookupError, setCircleLookupError] = useState("");

  // Fetch home stats
  useEffect(() => {
    fetch("/api/home-stats")
      .then((r) => r.json())
      .then((d: HomeStats) => setHomeStats(d))
      .catch(() => {});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    const name = username.replace("@", "").trim();
    router.push(`/${locale}/yahoo/${encodeURIComponent(name)}`);
  }

  return (
    <div className="gradient-bg min-h-screen flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-[#1d9bf0]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="font-bold text-white">{t("nav.brand")}</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/${locale}/stats`} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">{t("nav.stats")}</a>
          <LanguageSwitcher />
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
                  {t("home.hero.title1")}
                </span>
                <br />
                <span className="text-white">{t("home.hero.title2")}</span>
              </h1>
              <p className="text-gray-400 text-lg leading-relaxed">
                {t("home.hero.desc")}
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
                    placeholder={t("home.form.placeholder")}
                    className="flex-1 bg-transparent outline-none text-white placeholder-gray-600 text-base"
                  />
                </div>

                {/* Home stats overview */}
                {homeStats && homeStats.totalGenerations > 0 && (
                  <div className="grid grid-cols-3 gap-2 py-2 px-1">
                    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] border border-white/[0.06] py-2 px-1">
                      <span className="text-[10px] text-gray-500">{t("home.stats.circles")}</span>
                      <span className="font-bold text-white text-sm tabular-nums">{homeStats.yahooCircleCount.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] border border-white/[0.06] py-2 px-1">
                      <span className="text-[10px] text-gray-500">{t("home.stats.today")}</span>
                      <span className="font-bold text-emerald-400 text-sm tabular-nums">{homeStats.todayCount.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.03] border border-white/[0.06] py-2 px-1">
                      <span className="text-[10px] text-gray-500">{t("home.stats.total")}</span>
                      <span className="font-bold text-[#1d9bf0] text-sm tabular-nums">{homeStats.totalGenerations.toLocaleString()}</span>
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
                    {t("home.form.submit")}
                  </span>
                </button>

                <p className="text-center text-xs text-gray-600">
                  {t("home.form.yahooTip")}{" "}
                  <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-400 transition-colors">nareaitter</a>
                </p>
              </form>
            </div>

            {/* 查找已有圈子 */}
            <div className="card rounded-2xl p-5 mt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                <span>🔗</span> {t("home.lookup.title")}
              </h3>
              <p className="text-xs text-gray-600 mb-3">{t("home.lookup.desc")}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={circleLookupId}
                  onChange={(e) => { setCircleLookupId(e.target.value); setCircleLookupError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && circleLookupId.trim()) {
                      router.push(`/${locale}/circle/${encodeURIComponent(circleLookupId.trim())}`);
                    }
                  }}
                  placeholder={t("home.lookup.placeholder")}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-white/30 transition-colors"
                />
                <button
                  onClick={() => {
                    const id = circleLookupId.trim();
                    if (!id) { setCircleLookupError(t("home.lookup.error")); return; }
                    router.push(`/${locale}/circle/${encodeURIComponent(id)}`);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 transition-all shrink-0"
                >
                  {t("home.lookup.button")}
                </button>
              </div>
              {circleLookupError && (
                <p className="text-xs text-red-400 mt-2">{circleLookupError}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { label: t("home.badge.mention"), weight: t("home.badge.mentionVal"), color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
                { label: t("home.badge.noLogin"), weight: t("home.badge.noLoginVal"), color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
                { label: t("home.badge.days"), weight: t("home.badge.daysVal"), color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
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
          <h2 className="text-center text-xs font-semibold text-gray-600 uppercase tracking-widest mb-6">{t("home.howItWorks.title")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { step: "01", icon: "🔎", title: t("home.howItWorks.step01.title"), desc: t("home.howItWorks.step01.desc") },
              { step: "02", icon: "📊", title: t("home.howItWorks.step02.title"), desc: t("home.howItWorks.step02.desc") },
              { step: "03", icon: "🏆", title: t("home.howItWorks.step03.title"), desc: t("home.howItWorks.step03.desc") },
              { step: "04", icon: "🎨", title: t("home.howItWorks.step04.title"), desc: t("home.howItWorks.step04.desc") },
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
            <h2 className="text-xl font-bold mb-2">{t("home.guide.title")}</h2>
            <p className="text-gray-500 text-sm">{t("home.guide.subtitle")}</p>
          </div>

          {/* Step by step */}
          <div className="space-y-6">
            {[
              {
                n: "01", color: "text-green-400", border: "border-green-400/20", bg: "bg-green-400/5",
                title: t("home.guide.step01.title"),
                desc: t("home.guide.step01.desc"),
                tips: [t("home.guide.step01.tip1"), t("home.guide.step01.tip2"), t("home.guide.step01.tip3")],
              },
              {
                n: "02", color: "text-pink-400", border: "border-pink-400/20", bg: "bg-pink-400/5",
                title: t("home.guide.step02.title"),
                desc: t("home.guide.step02.desc"),
                tips: [t("home.guide.step02.tip1"), t("home.guide.step02.tip2"), t("home.guide.step02.tip3")],
              },
              {
                n: "03", color: "text-amber-400", border: "border-amber-400/20", bg: "bg-amber-400/5",
                title: t("home.guide.step03.title"),
                desc: t("home.guide.step03.desc"),
                tips: [t("home.guide.step03.tip1"), t("home.guide.step03.tip2"), t("home.guide.step03.tip3")],
              },
              {
                n: "04", color: "text-cyan-400", border: "border-cyan-400/20", bg: "bg-cyan-400/5",
                title: t("home.guide.step04.title"),
                desc: t("home.guide.step04.desc"),
                tips: [t("home.guide.step04.tip1"), t("home.guide.step04.tip2"), t("home.guide.step04.tip3")],
              },
            ].map(({ n, color, border, bg, title, desc, tips }) => (
              <div key={n} className={`rounded-2xl border ${border} ${bg} p-6 flex gap-5`}>
                <div className={`text-3xl font-black ${color} opacity-40 select-none shrink-0 w-8 text-right leading-tight`}>{n}</div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-base mb-2 ${color}`}>{title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-3">{desc}</p>
                  <ul className="space-y-1">
                    {tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className={`mt-0.5 shrink-0 ${color}`}>›</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div>
            <h3 className="text-base font-semibold mb-5 text-center text-gray-400">{t("home.faq.title")}</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { q: t("home.faq.q1"), a: t("home.faq.a1") },
                { q: t("home.faq.q2"), a: t("home.faq.a2") },
                { q: t("home.faq.q3"), a: t("home.faq.a3") },
                { q: t("home.faq.q4"), a: t("home.faq.a4") },
                { q: t("home.faq.q5"), a: t("home.faq.a5") },
                { q: t("home.faq.q6"), a: t("home.faq.a6") },
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
            <h3 className="text-sm font-semibold mb-4 text-gray-400">{t("home.scoring.title")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-pink-400/20 p-4 text-center">
                <div className="text-2xl font-black text-pink-400 mb-1">{t("home.scoring.mention")}</div>
                <div className="text-sm font-semibold text-pink-400 mb-1">{t("home.scoring.mentionLabel")}</div>
                <div className="text-xs text-gray-600 leading-snug">{t("home.scoring.mentionDesc")}</div>
              </div>
              <div className="rounded-xl border border-green-400/20 p-4 text-center">
                <div className="text-2xl font-black text-green-400 mb-1">{t("home.scoring.days")}</div>
                <div className="text-sm font-semibold text-green-400 mb-1">{t("home.scoring.daysLabel")}</div>
                <div className="text-xs text-gray-600 leading-snug">{t("home.scoring.daysDesc")}</div>
              </div>
              <div className="rounded-xl border border-cyan-400/20 p-4 text-center">
                <div className="text-2xl font-black text-cyan-400 mb-1">{t("home.scoring.free")}</div>
                <div className="text-sm font-semibold text-cyan-400 mb-1">{t("home.scoring.freeLabel")}</div>
                <div className="text-xs text-gray-600 leading-snug">{t("home.scoring.freeDesc")}</div>
              </div>
            </div>
            <p className="text-xs text-gray-700 text-center mt-4">
              {t("home.scoring.note")}
            </p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-800 border-t border-white/5">
        NekoCircle · {t("home.footer.by")}
        <span className="mx-2">·</span>
        {t("home.footer.inspiration")} <a href="https://github.com/maebahesioru/nareaitter" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors underline underline-offset-2">nareaitter</a>
        <span className="mx-2">·</span>
        <a href="/admin/login" className="hover:text-gray-600 transition-colors">·</a>
      </footer>

    </div>
  );
}
