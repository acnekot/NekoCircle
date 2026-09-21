"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import DemoCircle from "@/components/DemoCircle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/components/LocaleProvider";

type HomeStats = {
  yahooCircleCount: number;
  yahooUniqueUsers: number;
  totalGenerations: number;
  todayCount: number;
};

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const SearchIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
  </svg>
);

export default function Md3HomeDemo() {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [username, setUsername] = useState("");
  const [homeStats, setHomeStats] = useState<HomeStats | null>(null);
  const [circleLookupId, setCircleLookupId] = useState("");
  const [circleLookupError, setCircleLookupError] = useState("");

  useEffect(() => {
    fetch("/api/home-stats")
      .then((response) => response.json())
      .then((data: HomeStats) => setHomeStats(data))
      .catch(() => {});
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = username.replace("@", "").trim();
    if (name) router.push(`/${locale}/yahoo/${encodeURIComponent(name)}`);
  }

  function openSavedCircle() {
    const id = circleLookupId.trim();
    if (!id) {
      setCircleLookupError(t("home.lookup.error"));
      return;
    }
    router.push(`/${locale}/circle/${encodeURIComponent(id)}`);
  }

  const steps = [
    { n: "01", meta: "COLLECT", title: t("home.howItWorks.step01.title"), desc: t("home.howItWorks.step01.desc") },
    { n: "02", meta: "MERGE", title: t("home.howItWorks.step02.title"), desc: t("home.howItWorks.step02.desc") },
    { n: "03", meta: "SCORE", title: t("home.howItWorks.step03.title"), desc: t("home.howItWorks.step03.desc") },
    { n: "04", meta: "VISUALIZE", title: t("home.howItWorks.step04.title"), desc: t("home.howItWorks.step04.desc") },
  ];

  const faqs = [1, 2, 3, 5].map((number) => ({
    q: t(`home.faq.q${number}`),
    a: t(`home.faq.a${number}`),
  }));

  return (
    <div className="md3-page min-h-screen">
      <header className="md3-top-app-bar">
        <div className="md3-shell flex h-20 items-center justify-between gap-4">
          <a href={`/${locale}/md3-demo`} className="flex items-center gap-3" aria-label={t("nav.brand")}>
            <span className="md3-logo" aria-hidden="true">
              <span className="md3-logo-dot md3-logo-dot-a" />
              <span className="md3-logo-dot md3-logo-dot-b" />
              <span className="md3-logo-dot md3-logo-dot-c" />
            </span>
            <span>
              <span className="block text-lg font-bold tracking-[-0.03em] text-[var(--md-on-surface)]">{t("nav.brand")}</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--md-on-surface-variant)]">Material 3 demo</span>
            </span>
          </a>

          <div className="flex items-center gap-2">
            <a href={`/${locale}/stats`} className="md3-text-button">{t("nav.stats")}</a>
            <div className="md3-language-wrap"><LanguageSwitcher /></div>
          </div>
        </div>
      </header>

      <main>
        <section className="md3-shell grid gap-10 pb-16 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,.95fr)] lg:items-center lg:gap-16 lg:pb-24">
          <div className="max-w-2xl">
            <div className="md3-assist-chip mb-6">
              <span className="md3-live-dot" />
              {t("yahoo.tag")}
            </div>

            <h1 className="md3-display mb-6">
              {t("home.hero.title1")}
              <span>{t("home.hero.title2")}</span>
            </h1>
            <p className="max-w-xl text-base leading-7 text-[var(--md-on-surface-variant)] sm:text-lg">
              {t("home.hero.desc")}
            </p>

            <div className="mt-7"><AnnouncementBanner /></div>

            <form onSubmit={handleSubmit} className="md3-generator-card mt-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="md3-label">{t("home.guide.step01.title")}</p>
                  <p className="mt-1 text-sm text-[var(--md-on-surface-variant)]">{t("home.guide.subtitle")}</p>
                </div>
                <span className="md3-icon-badge" aria-hidden="true"><SearchIcon /></span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="md3-outlined-field">
                  <span>@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t("home.form.placeholder")}
                    aria-label={t("home.guide.step01.title")}
                  />
                </label>
                <button type="submit" disabled={!username.trim()} className="md3-filled-button">
                  <span>{t("home.form.submit")}</span>
                  <ArrowIcon />
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-[var(--md-on-surface-variant)]">
                {t("home.form.yahooTip")}
              </p>

              {homeStats && (
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[var(--md-outline-variant)] pt-5">
                  {[
                    [t("home.stats.circles"), homeStats.yahooCircleCount],
                    [t("home.stats.today"), homeStats.todayCount],
                    [t("home.stats.total"), homeStats.totalGenerations],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="md3-stat">
                      <strong>{Number(value).toLocaleString()}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {[t("home.badge.noLogin"), t("home.badge.days"), "FxTwitter · Yahoo · Bing"].map((label) => (
                <span key={label} className="md3-filter-chip">✓&nbsp; {label}</span>
              ))}
            </div>
          </div>

          <div className="md3-visual-card">
            <div className="flex items-center justify-between gap-4 px-2 pb-3">
              <div>
                <p className="md3-label">LIVE PREVIEW</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--md-on-surface)]">@acnekot</h2>
              </div>
              <span className="md3-tonal-icon" aria-hidden="true">↗</span>
            </div>
            <div className="md3-circle-surface">
              <DemoCircle />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="md3-mini-chip"><b>22</b><span>Nodes</span></div>
              <div className="md3-mini-chip"><b>30d</b><span>Window</span></div>
              <div className="md3-mini-chip"><b>3</b><span>Sources</span></div>
            </div>
          </div>
        </section>

        <section className="md3-section md3-section-tonal">
          <div className="md3-shell">
            <div className="mb-8 max-w-2xl">
              <p className="md3-label">HOW IT WORKS</p>
              <h2 className="md3-headline mt-3">{t("home.howItWorks.title")}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <article key={step.n} className="md3-step-card">
                  <div className="flex items-center justify-between">
                    <span className="md3-step-icon" aria-hidden="true">{step.n}</span>
                    <span className="text-xs font-semibold tracking-wider text-[var(--md-primary)]">{step.meta}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="md3-section">
          <div className="md3-shell grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <div className="md3-saved-card">
              <span className="md3-tonal-icon mb-6" aria-hidden="true">⌁</span>
              <p className="md3-label">SAVED CIRCLE</p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--md-on-surface)]">{t("home.lookup.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--md-on-surface-variant)]">{t("home.lookup.desc")}</p>
              <div className="mt-6 flex gap-2">
                <label className="md3-outlined-field min-w-0 flex-1">
                  <input
                    type="text"
                    value={circleLookupId}
                    onChange={(event) => { setCircleLookupId(event.target.value); setCircleLookupError(""); }}
                    onKeyDown={(event) => { if (event.key === "Enter") openSavedCircle(); }}
                    placeholder={t("home.lookup.placeholder")}
                    aria-label={t("home.lookup.placeholder")}
                  />
                </label>
                <button type="button" onClick={openSavedCircle} className="md3-tonal-button">{t("home.lookup.button")}</button>
              </div>
              {circleLookupError && <p className="mt-2 text-xs text-[var(--md-error)]">{circleLookupError}</p>}
            </div>

            <div className="md3-faq-card">
              <p className="md3-label">FAQ</p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--md-on-surface)]">{t("home.faq.title")}</h2>
              <div className="mt-5 divide-y divide-[var(--md-outline-variant)]">
                {faqs.map(({ q, a }) => (
                  <details key={q} className="md3-faq-item">
                    <summary>{q}<span aria-hidden="true">＋</span></summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--md-outline-variant)] py-8">
        <div className="md3-shell flex flex-col gap-4 text-sm text-[var(--md-on-surface-variant)] sm:flex-row sm:items-center sm:justify-between">
          <span>NekoCircle · {t("home.footer.by")}</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="mailto:acnekot@gmail.com">{t("home.footer.contact")}</a>
            <a href="https://github.com/acnekot/NekoCircle" target="_blank" rel="noopener noreferrer">GitHub</a>
            <span>AGPL-3.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
